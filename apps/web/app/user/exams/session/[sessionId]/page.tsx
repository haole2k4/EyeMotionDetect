'use client';

import { use, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Volume2, VolumeX, Eye, AlertTriangle, Clock, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { MCQBoard } from '@/components/mcq/MCQBoard';
import { useGaze } from '@/components/gaze/GazeProvider';
import { decodeBinaryPayloadToArrayBuffer } from '@/lib/gaze/server-weights';

interface ServerWeightsResponse {
  polyCoeffsX: number[] | null;
  polyCoeffsY: number[] | null;
  mlpWeightsJson: string | null;
  mlpWeightsBin: unknown;
}

interface GazeHeatmapPoint {
  x: number;
  y: number;
  t: number;
  qIdx?: number;
}

interface AccessibilityProfile {
  dominantEye: 'both' | 'left' | 'right';
  triggerMode: 'blink' | 'dwell';
  dwellTimeMs: number;
  blinkDurationMs: number;
  ttsEnabled: boolean;
  magneticStrength: number;
}

interface ExtendedGazeContext {
  stats?: {
    singleFaceReady?: boolean;
    faceCount?: number;
    headPoseOk?: boolean;
    lightingScore?: number;
    smoothedGaze?: [number, number];
    snappedGaze?: [number, number];
    activeTargetKey?: string | null;
    saccadeEvent?: 'none' | 'next' | 'prev';
  } & Record<string, unknown>;
  startPipeline: (video: HTMLVideoElement) => void;
  stopPipeline: () => void;
  setModel: (modelType: 'polynomial' | 'mlp' | 'none', weights?: unknown) => Promise<void>;
  accessibilityProfile?: AccessibilityProfile;
  setAccessibilityProfile?: (profile: Partial<AccessibilityProfile>) => void;
  [key: string]: unknown;
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

export default function ExamSessionFocusMode({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [session, setSession] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Time & Pause Management
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [faceLossPauseCount, setFaceLossPauseCount] = useState(0);
  const faceLossCountRef = useRef(0);
  const faceLostStartRef = useRef<number | null>(null);

  // Text-To-Speech State
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const ttsEnabledRef = useRef(true);

  // Question dwell time tracking
  const questionEnteredAtRef = useRef<number>(Date.now());
  const telemetryPointsRef = useRef<GazeHeatmapPoint[]>([]);
  const lastTelemetrySyncRef = useRef<number>(0);

  const answerQueueRef = useRef<Promise<void>>(Promise.resolve());
  const finishingRef = useRef(false);

  // Camera tracking integration
  const rawGaze = useGaze();
  const gaze = rawGaze as unknown as ExtendedGazeContext;
  const { startPipeline, stopPipeline, setModel, stats } = gaze;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Load candidate accessibility profile
  useEffect(() => {
    async function loadAccessibility() {
      try {
        const res = await api.get<AccessibilityProfile>('/users/me/accessibility');
        if (res.data) {
          gaze.setAccessibilityProfile?.(res.data);
          if (typeof res.data.ttsEnabled === 'boolean') {
            setTtsEnabled(res.data.ttsEnabled);
            ttsEnabledRef.current = res.data.ttsEnabled;
          }
        }
      } catch (err) {
        console.warn('Could not load user accessibility profile, using defaults', err);
      }
    }
    loadAccessibility();
  }, [gaze]);

  // Load Model from server
  const loadModelFromServer = useCallback(async () => {
    try {
      const { data } = await api.get<ServerWeightsResponse>('/weights');
      const mlpWeights = decodeBinaryPayloadToArrayBuffer(data.mlpWeightsBin);

      if (typeof data.mlpWeightsJson === 'string' && mlpWeights) {
        await setModel('mlp', { json: data.mlpWeightsJson, weights: mlpWeights });
        return;
      }

      if (isFiniteNumberArray(data.polyCoeffsX) && isFiniteNumberArray(data.polyCoeffsY)) {
        await setModel('polynomial', { coeffsX: data.polyCoeffsX, coeffsY: data.polyCoeffsY });
        return;
      }
    } catch (error) {
      console.error('Load gaze model for exam failed:', error);
    }

    await setModel('none');
  }, [setModel]);

  useEffect(() => {
    let active = true;
    const startCamera = async () => {
      if (!videoRef.current) return;
      try {
        await loadModelFromServer();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        startPipeline(videoRef.current);
      } catch (err) {
        console.error("Camera error:", err);
      }
    };
    startCamera();

    return () => {
      active = false;
      stopPipeline();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [loadModelFromServer, startPipeline, stopPipeline]);

  // Fetch session data
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await api.get(`/exams/sessions/${sessionId}/active`);
        if (res.data.status === 'COMPLETED') {
          router.push('/user/dashboard');
          return;
        }
        setSession(res.data);
        if (res.data.faceLossPauseCount) {
          setFaceLossPauseCount(res.data.faceLossPauseCount);
          faceLossCountRef.current = res.data.faceLossPauseCount;
        }

        // Initialize countdown timer
        if (res.data.exam?.duration && remainingSeconds === null) {
          const durationSeconds = res.data.exam.duration * 60;
          if (res.data.startTime) {
            const elapsed = Math.floor((Date.now() - new Date(res.data.startTime).getTime()) / 1000);
            setRemainingSeconds(Math.max(0, durationSeconds - elapsed));
          } else {
            setRemainingSeconds(durationSeconds);
          }
        }
      } catch (error) {
        console.error(error);
        router.push('/user/dashboard');
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, [sessionId, router, remainingSeconds]);

  // Handle Finish Exam
  const handleFinish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;

    // Stop speaking if active
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }

    try {
      await answerQueueRef.current.catch(() => undefined);
      await api.post(`/exams/sessions/${sessionId}/finish`, {
        gazeHeatmap: telemetryPointsRef.current,
        faceLossPauseCount: faceLossCountRef.current,
      });
      router.push('/user/dashboard');
    } catch (error) {
      console.error(error);
      finishingRef.current = false;
    }
  }, [router, sessionId]);

  // Countdown timer with Auto-pause support
  useEffect(() => {
    if (remainingSeconds === null || isPaused || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          void handleFinish();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [remainingSeconds, isPaused, handleFinish]);

  // Auto-Pause on Face Loss Detection (> 1.5s lost continuous)
  useEffect(() => {
    const isSingleFaceReady = stats?.singleFaceReady ?? false;
    const now = Date.now();

    if (!isSingleFaceReady) {
      if (faceLostStartRef.current === null) {
        faceLostStartRef.current = now;
      } else if (now - faceLostStartRef.current >= 1500) {
        if (!isPaused) {
          setIsPaused(true);
          setFaceLossPauseCount((prev) => {
            const next = prev + 1;
            faceLossCountRef.current = next;
            return next;
          });
        }
      }
    } else {
      faceLostStartRef.current = null;
      if (isPaused) {
        setIsPaused(false);
      }
    }
  }, [stats?.singleFaceReady, isPaused]);

  // 4Hz Heatmap Telemetry Sampler (every 250ms, max 400 points)
  useEffect(() => {
    const interval = setInterval(() => {
      if (isPaused) return;

      const gazePoint = stats?.snappedGaze || stats?.smoothedGaze;
      if (!gazePoint || typeof window === 'undefined') return;

      const normX = Math.round((gazePoint[0] / window.innerWidth) * 1000) / 1000;
      const normY = Math.round((gazePoint[1] / window.innerHeight) * 1000) / 1000;

      if (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1) {
        const point: GazeHeatmapPoint = {
          x: normX,
          y: normY,
          t: Date.now(),
          qIdx: currentIndex,
        };

        const currentPoints = telemetryPointsRef.current;
        if (currentPoints.length >= 400) {
          currentPoints.shift();
        }
        currentPoints.push(point);

        // Periodically sync telemetry every 15s to backend
        const now = Date.now();
        if (now - lastTelemetrySyncRef.current > 15000) {
          lastTelemetrySyncRef.current = now;
          void api.put(`/exams/sessions/${sessionId}/telemetry`, {
            gazeHeatmap: currentPoints.slice(-50),
            faceLossPauseCount: faceLossCountRef.current,
          }).catch(() => undefined);
        }
      }
    }, 250);

    return () => clearInterval(interval);
  }, [stats?.snappedGaze, stats?.smoothedGaze, isPaused, currentIndex, sessionId]);

  // Text-to-Speech: Read question and options aloud in Vietnamese
  const speakCurrentQuestion = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (!ttsEnabledRef.current || !session?.exam?.questions) return;

    const currentQuestion = session.exam.questions[currentIndex];
    if (!currentQuestion) return;

    window.speechSynthesis.cancel();

    const optionsText = [
      `Phương án A: ${currentQuestion.options[0] || 'trống'}`,
      `Phương án B: ${currentQuestion.options[1] || 'trống'}`,
      `Phương án C: ${currentQuestion.options[2] || 'trống'}`,
      `Phương án D: ${currentQuestion.options[3] || 'trống'}`,
    ].join('. ');

    const fullText = `Câu hỏi số ${currentIndex + 1}: ${currentQuestion.content}. ${optionsText}`;

    const utterance = new SpeechSynthesisUtterance(fullText);
    utterance.lang = 'vi-VN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick Vietnamese voice if available
    const voices = window.speechSynthesis.getVoices();
    const viVoice = voices.find((v) => v.lang.includes('vi') || v.lang.includes('VN'));
    if (viVoice) {
      utterance.voice = viVoice;
    }

    window.speechSynthesis.speak(utterance);
  }, [currentIndex, session]);

  // Read when question changes
  useEffect(() => {
    questionEnteredAtRef.current = Date.now();
    speakCurrentQuestion();

    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [currentIndex, speakCurrentQuestion]);

  const toggleTts = () => {
    const nextVal = !ttsEnabled;
    setTtsEnabled(nextVal);
    ttsEnabledRef.current = nextVal;
    if (!nextVal && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    } else if (nextVal) {
      speakCurrentQuestion();
    }
  };

  const enqueueAnswerSubmission = useCallback(
    (payload: { questionId: string; selectedOption: string; dwellTimeMs: number }) => {
      answerQueueRef.current = answerQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          await api.post(`/exams/sessions/${sessionId}/answer`, payload);
        });

      return answerQueueRef.current;
    },
    [sessionId],
  );

  const handleAnswer = useCallback(
    async (optionChoice: string) => {
      if (!session) return;

      const question = session.exam.questions[currentIndex];

      const mapChoiceToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
      const optionIndex = mapChoiceToIndex[optionChoice];
      if (optionIndex === undefined) return;
      const selectedOptionString = question.options[optionIndex];

      // Calculate actual dwell time on this question
      const actualDwellTimeMs = Math.max(200, Date.now() - questionEnteredAtRef.current);
      questionEnteredAtRef.current = Date.now();

      // Optimistic UI update
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSession((prev: any) => {
        if (!prev) return prev;
        const prevAnswers = Array.isArray(prev.answers) ? prev.answers : [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingIdx = prevAnswers.findIndex((a: any) => a.question?.id === question.id);

        let nextAnswers = prevAnswers;
        if (existingIdx >= 0) {
          nextAnswers = prevAnswers.map((answer: { selectedOption?: string }, index: number) =>
            index === existingIdx ? { ...answer, selectedOption: selectedOptionString } : answer,
          );
        } else {
          nextAnswers = [
            ...prevAnswers,
            { question: { id: question.id }, selectedOption: selectedOptionString },
          ];
        }

        return {
          ...prev,
          answers: nextAnswers,
        };
      });

      if (currentIndex < session.exam.questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      }

      const answerPersistPromise = enqueueAnswerSubmission({
        questionId: question.id,
        selectedOption: selectedOptionString,
        dwellTimeMs: actualDwellTimeMs,
      });

      if (currentIndex >= session.exam.questions.length - 1) {
        try {
          await answerPersistPromise;
          await handleFinish();
        } catch (error) {
          console.error(error);
        }
      }
    },
    [session, currentIndex, enqueueAnswerSubmission, handleFinish],
  );

  const questions = session?.exam?.questions || [];
  const answeredQuestionIds = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const answers = (session?.answers || []) as any[];
    return new Set(
      answers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((answer: any) => answer?.question?.id)
        .filter((id): id is string => typeof id === 'string'),
    );
  }, [session?.answers]);

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderContent = () => {
    if (loading || !session) {
      return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-[#090d16] text-white">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
          <p className="mt-6 text-2xl font-bold tracking-widest text-cyan-200">
            ĐANG CHUẨN BỊ PHÒNG THI TRỢ NĂNG...
          </p>
        </div>
      );
    }

    if (questions.length === 0) {
      return <div className="p-12 text-white text-2xl">Bài thi không có câu hỏi nào.</div>;
    }

    const currentQuestion = questions[currentIndex];

    const optionsObj = {
      A: currentQuestion.options[0] || '',
      B: currentQuestion.options[1] || '',
      C: currentQuestion.options[2] || '',
      D: currentQuestion.options[3] || '',
    };

    const isSingleFaceReady = stats?.singleFaceReady ?? false;
    const isHeadPoseOk = stats?.headPoseOk ?? true;
    const lightingScore = stats?.lightingScore;

    return (
      <>
        {/* Top Ergonomic HUD Bar */}
        <header className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-[#090d16]/90 border-b border-slate-800 backdrop-blur-md">
          {/* Left: Exam title & Progress status */}
          <div className="flex items-center gap-4">
            <span className="rounded-xl bg-blue-950/80 border border-blue-500/40 px-3 py-1 text-sm font-extrabold text-blue-300">
              CÂU {currentIndex + 1} / {questions.length}
            </span>
            <span className="hidden md:inline text-sm font-bold text-slate-300 truncate max-w-xs">
              {session?.exam?.title}
            </span>
          </div>

          {/* Center: Head Pose, Face & Lighting Indicators */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Face Status Badge */}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border transition-colors ${
                isSingleFaceReady
                  ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-300'
                  : 'border-rose-500/50 bg-rose-950/80 text-rose-300 animate-pulse'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>{isSingleFaceReady ? 'Đã khóa khuôn mặt' : 'Mất dấu mặt'}</span>
            </div>

            {/* Head Pose Badge */}
            <div
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold border ${
                isHeadPoseOk
                  ? 'border-cyan-500/40 bg-cyan-950/60 text-cyan-300'
                  : 'border-amber-500/40 bg-amber-950/60 text-amber-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isHeadPoseOk ? 'Tư thế chuẩn' : 'Đang nghiêng đầu'}</span>
            </div>

            {/* Lighting Badge */}
            {lightingScore !== undefined && (
              <div className="rounded-full border border-slate-700 bg-slate-900/80 px-2.5 py-1 text-xs font-bold text-slate-300">
                Sáng: {Math.round(lightingScore * 100)}%
              </div>
            )}
          </div>

          {/* Right: TTS Toggle Button & Countdown Timer */}
          <div className="flex items-center gap-4">
            {/* TTS Toggle */}
            <button
              type="button"
              onClick={toggleTts}
              aria-label={ttsEnabled ? 'Tắt đọc đề' : 'Bật đọc đề'}
              className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all ${
                ttsEnabled
                  ? 'border-cyan-400 bg-cyan-950/80 text-cyan-200 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
                  : 'border-slate-700 bg-slate-800 text-slate-400'
              }`}
            >
              {ttsEnabled ? <Volume2 className="w-4 h-4 text-cyan-300" /> : <VolumeX className="w-4 h-4" />}
              <span className="hidden sm:inline">{ttsEnabled ? 'Đọc đề: BẬT' : 'Đọc đề: TẮT'}</span>
            </button>

            {/* Countdown Timer */}
            {remainingSeconds !== null && (
              <div
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-1.5 font-mono text-sm md:text-base font-black ${
                  remainingSeconds < 300
                    ? 'border-rose-500 bg-rose-950/80 text-rose-300 animate-pulse'
                    : 'border-slate-700 bg-slate-900 text-slate-100'
                }`}
              >
                <Clock className="w-4 h-4 text-slate-400" />
                <span>{formatTimer(remainingSeconds)}</span>
              </div>
            )}
          </div>
        </header>

        {/* Top Progress Track */}
        <div className="absolute top-[53px] left-0 z-40 flex w-full justify-center gap-1.5 px-4 bg-[#090d16]/80 py-1">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {questions.map((q: any, i: number) => {
            const isAnswered = answeredQuestionIds.has(q.id);
            const isCurrent = i === currentIndex;
            let barStyle = 'bg-slate-800/80';
            if (isCurrent) barStyle = 'bg-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.8)] scale-y-125';
            else if (isAnswered) barStyle = 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]';

            return (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${barStyle}`}
              />
            );
          })}
        </div>

        {/* Auto-Pause Warning Banner on Face Loss */}
        {isPaused && (
          <div className="absolute inset-x-6 top-20 z-50 rounded-2xl border-2 border-rose-500 bg-rose-950/95 p-5 shadow-[0_0_40px_rgba(244,63,94,0.6)] backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-600 text-white shadow-lg">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black text-rose-100 uppercase tracking-wide">
                  ⏸ Đã tạm dừng tính giờ bài thi (Lần {faceLossPauseCount})
                </h3>
                <p className="text-sm font-semibold text-rose-200">
                  Không nhận diện được khuôn mặt của bạn liên tục quá 1.5 giây. Vui lòng ngồi thẳng vào vùng trung tâm camera để tiếp tục làm bài.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Content MCQ Board */}
        <div className="h-full w-full pt-16">
          <MCQBoard
            question={currentQuestion.content}
            options={optionsObj}
            onAnswerSelected={handleAnswer}
            onPrev={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            onNext={() => setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1))}
            onSubmit={handleFinish}
          />
        </div>
      </>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] h-screen w-screen overflow-hidden bg-[#090d16]">
      {/* Hidden Video Feed for Gaze Tracking */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none z-[-1]"
      />
      {renderContent()}
    </div>
  );
}
