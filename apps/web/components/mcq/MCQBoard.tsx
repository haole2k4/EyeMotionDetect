'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGaze } from '../gaze/GazeProvider';

interface ExtendedGazeStats {
  snappedGaze?: [number, number];
  activeTargetKey?: string | null;
  saccadeEvent?: 'none' | 'next' | 'prev';
  pursuitProgress?: number;
  pursuitConfirmed?: boolean;
  headPoseOk?: boolean;
  lightingScore?: number;
  currentRegion?: string;
  dwellProgress?: number;
}

interface ExtendedGazeContext {
  stats?: ExtendedGazeStats | null;
  setInteractionMode?: (mode: 'default' | 'confirm') => void;
  registerMagneticTargets?: (
    targets: Array<{ id: number; key: string; x: number; y: number; width: number; height: number; gravityRadius?: number }>,
  ) => void;
  clearMagneticTargets?: () => void;
  recordImplicitDrift?: (targetX: number, targetY: number) => void;
  setPursuitOrbitTarget?: (target: { x: number; y: number; radius?: number } | null) => void;
  accessibilityProfile?: {
    dominantEye: 'both' | 'left' | 'right';
    triggerMode: 'blink' | 'dwell';
    dwellTimeMs: number;
    blinkDurationMs: number;
    ttsEnabled: boolean;
    magneticStrength: number;
  };
}

interface MCQBoardProps {
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  onAnswerSelected?: (answer: 'A' | 'B' | 'C' | 'D') => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
}

export function MCQBoard({
  question,
  options,
  onAnswerSelected,
  onPrev,
  onNext,
  onSubmit,
}: MCQBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saccadeNotice, setSaccadeNotice] = useState<string | null>(null);
  const [orbitAngle, setOrbitAngle] = useState(0);

  const rawGaze = useGaze();
  const gaze = rawGaze as unknown as ExtendedGazeContext;
  const stats = gaze.stats;

  const [confirmAction, setConfirmAction] = useState<{
    id: 'A' | 'B' | 'C' | 'D' | 'PREV' | 'NEXT' | 'SUBMIT';
    label: string;
  } | null>(null);

  // Button DOM element references
  const cardARef = useRef<HTMLDivElement | null>(null);
  const cardBRef = useRef<HTMLDivElement | null>(null);
  const cardCRef = useRef<HTMLDivElement | null>(null);
  const cardDRef = useRef<HTMLDivElement | null>(null);
  const prevBtnRef = useRef<HTMLDivElement | null>(null);
  const nextBtnRef = useRef<HTMLDivElement | null>(null);
  const submitBtnRef = useRef<HTMLDivElement | null>(null);

  // Modal element references
  const modalCancelRef = useRef<HTMLDivElement | null>(null);
  const modalConfirmRef = useRef<HTMLDivElement | null>(null);
  const modalPursuitRef = useRef<HTMLDivElement | null>(null);

  const lastSaccadeHandledRef = useRef<number>(0);
  const pursuitTriggeredRef = useRef<boolean>(false);

  // 1. Magnetic Target Snap Registration
  const registerTargets = useCallback(() => {
    if (confirmAction) {
      // In confirmation mode, register modal targets
      const targets: Array<{
        id: number;
        key: string;
        x: number;
        y: number;
        width: number;
        height: number;
        gravityRadius?: number;
      }> = [];

      if (confirmAction.id === 'SUBMIT') {
        if (modalCancelRef.current) {
          const r = modalCancelRef.current.getBoundingClientRect();
          targets.push({ id: 101, key: 'SAFE_MARGIN', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 75 });
        }
        if (modalPursuitRef.current) {
          const r = modalPursuitRef.current.getBoundingClientRect();
          targets.push({ id: 102, key: 'SUBMIT_PURSUIT', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 90 });
        }
      } else {
        if (modalCancelRef.current) {
          const r = modalCancelRef.current.getBoundingClientRect();
          targets.push({ id: 101, key: 'SAFE_MARGIN', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 75 });
        }
        if (modalConfirmRef.current) {
          const r = modalConfirmRef.current.getBoundingClientRect();
          targets.push({ id: 102, key: 'NEXT', x: r.left, y: r.top, width: r.width, height: r.height, gravityRadius: 75 });
        }
      }

      gaze?.registerMagneticTargets?.(targets);
      return;
    }

    // Default MCQ board targets
    const refs = [
      { key: 'A', id: 0, ref: cardARef },
      { key: 'PREV', id: 1, ref: prevBtnRef },
      { key: 'B', id: 2, ref: cardBRef },
      { key: 'NEXT', id: 3, ref: nextBtnRef },
      { key: 'C', id: 4, ref: cardCRef },
      { key: 'SUBMIT', id: 5, ref: submitBtnRef },
      { key: 'D', id: 6, ref: cardDRef },
    ];

    const targets = refs
      .map(({ key, id, ref }) => {
        if (!ref.current) return null;
        const rect = ref.current.getBoundingClientRect();
        return {
          id,
          key,
          x: rect.left,
          y: rect.top,
          width: rect.width,
          height: rect.height,
          gravityRadius: key === 'SUBMIT' ? 85 : 70,
        };
      })
      .filter((t): t is NonNullable<typeof t> => Boolean(t));

    if (targets.length > 0) {
      gaze?.registerMagneticTargets?.(targets);
    }
  }, [confirmAction, gaze]);

  // Keep magnetic targets synchronized with resize and content updates
  useEffect(() => {
    registerTargets();
    const handleResize = () => registerTargets();
    window.addEventListener('resize', handleResize);

    const observer = new ResizeObserver(() => {
      registerTargets();
    });

    if (cardARef.current) observer.observe(cardARef.current);
    if (submitBtnRef.current) observer.observe(submitBtnRef.current);

    return () => {
      window.removeEventListener('resize', handleResize);
      observer.disconnect();
      gaze?.clearMagneticTargets?.();
    };
  }, [registerTargets, gaze, question]);

  // 2. Continuous Orbiting Stimulus Animation for Smooth Pursuit
  useEffect(() => {
    let animId = 0;
    const updateOrbit = () => {
      // 1.2s period orbit
      const now = performance.now();
      const theta = ((now % 1200) / 1200) * 2 * Math.PI;
      setOrbitAngle(theta);
      animId = requestAnimationFrame(updateOrbit);
    };
    animId = requestAnimationFrame(updateOrbit);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, []);

  // Update Pursuit target center when submit is hovered or in submit modal
  useEffect(() => {
    const isSubmitActive =
      stats?.activeTargetKey === 'SUBMIT' ||
      stats?.currentRegion === 'SUBMIT' ||
      (confirmAction && confirmAction.id === 'SUBMIT');

    if (isSubmitActive) {
      const targetElement =
        confirmAction?.id === 'SUBMIT' ? modalPursuitRef.current : submitBtnRef.current;

      if (targetElement) {
        const rect = targetElement.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        gaze?.setPursuitOrbitTarget?.({ x: centerX, y: centerY, radius: 48 });
      }
    } else {
      gaze?.setPursuitOrbitTarget?.(null);
    }
  }, [stats?.activeTargetKey, stats?.currentRegion, confirmAction, gaze]);

  // Handle Action Request
  const handleActionRequest = useCallback(
    (id: 'A' | 'B' | 'C' | 'D' | 'PREV' | 'NEXT' | 'SUBMIT', label: string) => {
      if (confirmAction) return;
      pursuitTriggeredRef.current = false;
      setConfirmAction({ id, label });
    },
    [confirmAction],
  );

  // 3. Implicit Drift Correction on Answer Confirmation
  const performImplicitDriftCorrection = useCallback(
    (choiceId: 'A' | 'B' | 'C' | 'D') => {
      const refMap = {
        A: cardARef,
        B: cardBRef,
        C: cardCRef,
        D: cardDRef,
      };
      const element = refMap[choiceId]?.current;
      if (element) {
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        gaze?.recordImplicitDrift?.(centerX, centerY);
      }
    },
    [gaze],
  );

  const handleConfirm = useCallback(
    (confirmed: boolean) => {
      if (!confirmAction) return;

      if (confirmed) {
        if (['A', 'B', 'C', 'D'].includes(confirmAction.id)) {
          const answerChoice = confirmAction.id as 'A' | 'B' | 'C' | 'D';
          setSelected(answerChoice);
          performImplicitDriftCorrection(answerChoice);
          if (onAnswerSelected) onAnswerSelected(answerChoice);
        } else if (confirmAction.id === 'PREV' && onPrev) {
          onPrev();
        } else if (confirmAction.id === 'NEXT' && onNext) {
          onNext();
        } else if (confirmAction.id === 'SUBMIT' && onSubmit) {
          onSubmit();
        }
      }

      setConfirmAction(null);
      gaze?.setPursuitOrbitTarget?.(null);
    },
    [confirmAction, onAnswerSelected, onPrev, onNext, onSubmit, performImplicitDriftCorrection, gaze],
  );

  // 4. Smooth Pursuit Triggered for SUBMIT (0% accidental triggers)
  useEffect(() => {
    if (stats?.pursuitConfirmed && !pursuitTriggeredRef.current) {
      if (confirmAction?.id === 'SUBMIT') {
        pursuitTriggeredRef.current = true;
        handleConfirm(true);
      } else if (stats.activeTargetKey === 'SUBMIT' || stats.currentRegion === 'SUBMIT') {
        pursuitTriggeredRef.current = true;
        handleActionRequest('SUBMIT', 'nộp bài thi');
      }
    }
  }, [stats?.pursuitConfirmed, stats?.activeTargetKey, stats?.currentRegion, confirmAction, handleConfirm, handleActionRequest]);

  // 5. Saccadic Edge Strokes: Quick flick gestures for prev/next
  useEffect(() => {
    const saccade = stats?.saccadeEvent;
    if (!saccade || saccade === 'none') return;

    const now = Date.now();
    if (now - lastSaccadeHandledRef.current < 900) return;
    lastSaccadeHandledRef.current = now;

    if (saccade === 'next' && onNext) {
      setSaccadeNotice('⚡ Liếc cạnh phải: Sang câu tiếp theo');
      onNext();
    } else if (saccade === 'prev' && onPrev) {
      setSaccadeNotice('⚡ Liếc cạnh trái: Về câu trước');
      onPrev();
    }

    const timer = setTimeout(() => {
      setSaccadeNotice(null);
    }, 1600);

    return () => clearTimeout(timer);
  }, [stats?.saccadeEvent, onNext, onPrev]);

  // Sync interaction mode with GazeProvider
  const isConfirming = Boolean(confirmAction);
  useEffect(() => {
    gaze?.setInteractionMode?.(isConfirming ? 'confirm' : 'default');
    return () => {
      gaze?.setInteractionMode?.('default');
    };
  }, [isConfirming, gaze]);

  // Helper to determine if an element is magnetically locked or hovered
  const isTargetActive = (key: string) => {
    return stats?.activeTargetKey === key || stats?.currentRegion === key;
  };

  const getDwellProgress = (key: string) => {
    if (isTargetActive(key)) {
      return (stats?.dwellProgress ?? 0) * 100;
    }
    return 0;
  };

  const pursuitProgress = stats?.pursuitProgress ?? 0;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#090d16] text-white select-none">
      {/* Saccadic Gesture Toast HUD */}
      {saccadeNotice && (
        <div className="pointer-events-none fixed top-6 left-1/2 -translate-x-1/2 z-[9999] rounded-2xl border-2 border-cyan-400 bg-cyan-950/90 px-6 py-2.5 shadow-[0_0_25px_rgba(34,211,238,0.7)] backdrop-blur-md animate-in fade-in slide-in-from-top-4 duration-200">
          <p className="text-sm md:text-base font-extrabold text-cyan-200 tracking-wide">
            {saccadeNotice}
          </p>
        </div>
      )}

      {/* Main 3x3 Grid Layout - WCAG AAA High Contrast & 48px+ separation */}
      <div
        className={`grid grid-cols-3 grid-rows-3 h-full w-full gap-6 md:gap-12 p-6 md:p-8 transition-opacity duration-200 ${
          isConfirming ? 'pointer-events-none opacity-20 filter blur-[2px]' : ''
        }`}
      >
        {/* ROW 0 */}
        {/* (0,0) Đáp án A */}
        <div
          ref={cardARef}
          onClick={() => handleActionRequest('A', 'đáp án A')}
          className={`relative cursor-pointer overflow-hidden rounded-3xl border-2 p-6 md:p-8 flex flex-col justify-between transition-all duration-150 ${
            selected === 'A'
              ? 'border-cyan-300 bg-blue-900/90 ring-4 ring-cyan-400/80 shadow-[0_0_30px_rgba(34,211,238,0.5)]'
              : isTargetActive('A')
                ? 'border-blue-400 bg-blue-950/95 ring-4 ring-offset-4 ring-offset-[#090d16] ring-cyan-400 scale-[1.02] shadow-[0_0_35px_rgba(34,211,238,0.6)]'
                : 'border-blue-500/50 bg-[#0d1629] hover:border-blue-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600/90 text-3xl font-black text-white shadow-lg">
              A
            </span>
            {isTargetActive('A') && (
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-widest animate-pulse">
                HÚT TỪ TÍNH
              </span>
            )}
          </div>
          <p className="mt-4 text-xl md:text-2xl font-bold text-slate-100 leading-snug line-clamp-4">
            {options.A}
          </p>

          {/* Dwell Progress Bar */}
          <div
            className="absolute bottom-0 left-0 h-2 bg-gradient-to-r from-blue-400 to-cyan-300 transition-all ease-linear"
            style={{ width: `${getDwellProgress('A')}%` }}
          />
        </div>

        {/* (0,1) Nút PREV (Câu trước) */}
        <div className="flex justify-center items-start">
          <div
            ref={prevBtnRef}
            onClick={() => handleActionRequest('PREV', 'về câu trước')}
            className={`cursor-pointer w-full max-w-sm h-20 rounded-b-3xl border-b-2 border-x-2 p-4 flex items-center justify-center gap-3 transition-all duration-150 ${
              isTargetActive('PREV')
                ? 'border-cyan-400 bg-slate-800 ring-4 ring-cyan-400/80 shadow-[0_0_25px_rgba(34,211,238,0.5)] scale-[1.02]'
                : 'border-slate-700 bg-slate-900/90 hover:border-slate-500'
            }`}
          >
            <span className="text-2xl font-black text-slate-300">◀</span>
            <span className="text-xl md:text-2xl font-extrabold text-slate-100 tracking-wide">
              Câu trước
            </span>
            <div
              className="absolute bottom-0 left-0 h-1.5 bg-cyan-400 transition-all ease-linear"
              style={{ width: `${getDwellProgress('PREV')}%` }}
            />
          </div>
        </div>

        {/* (0,2) Đáp án B */}
        <div
          ref={cardBRef}
          onClick={() => handleActionRequest('B', 'đáp án B')}
          className={`relative cursor-pointer overflow-hidden rounded-3xl border-2 p-6 md:p-8 flex flex-col justify-between transition-all duration-150 ${
            selected === 'B'
              ? 'border-purple-300 bg-purple-900/90 ring-4 ring-purple-400/80 shadow-[0_0_30px_rgba(192,132,252,0.5)]'
              : isTargetActive('B')
                ? 'border-purple-400 bg-purple-950/95 ring-4 ring-offset-4 ring-offset-[#090d16] ring-purple-400 scale-[1.02] shadow-[0_0_35px_rgba(192,132,252,0.6)]'
                : 'border-purple-500/50 bg-[#160d29] hover:border-purple-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-600/90 text-3xl font-black text-white shadow-lg">
              B
            </span>
            {isTargetActive('B') && (
              <span className="text-xs font-bold text-purple-300 uppercase tracking-widest animate-pulse">
                HÚT TỪ TÍNH
              </span>
            )}
          </div>
          <p className="mt-4 text-xl md:text-2xl font-bold text-slate-100 leading-snug line-clamp-4">
            {options.B}
          </p>

          <div
            className="absolute bottom-0 left-0 h-2 bg-gradient-to-r from-purple-400 to-pink-300 transition-all ease-linear"
            style={{ width: `${getDwellProgress('B')}%` }}
          />
        </div>

        {/* ROW 1 */}
        {/* (1,0) Vùng đệm SAFE_MARGIN */}
        <div className="flex items-center justify-center opacity-40">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-600">
            VÙNG NGHỈ MẮT
          </span>
        </div>

        {/* (1,1) DEADZONE - Vùng Câu hỏi Tĩnh WCAG AAA (>=26px, leading-relaxed) */}
        <div className="flex items-center justify-center rounded-3xl border-2 border-slate-700/80 bg-slate-900/95 p-8 shadow-2xl backdrop-blur-md">
          <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-slate-100 text-center leading-relaxed tracking-wide overflow-y-auto max-h-[85%]">
            {question}
          </h1>
        </div>

        {/* (1,2) Nút NEXT (Câu tiếp) */}
        <div className="flex items-center justify-end h-full">
          <div
            ref={nextBtnRef}
            onClick={() => handleActionRequest('NEXT', 'câu tiếp theo')}
            className={`relative cursor-pointer w-48 md:w-56 h-[80%] rounded-l-3xl border-l-2 border-y-2 p-6 flex flex-col items-center justify-center gap-2 transition-all duration-150 ${
              isTargetActive('NEXT')
                ? 'border-cyan-400 bg-slate-800 ring-4 ring-cyan-400/80 shadow-[0_0_25px_rgba(34,211,238,0.5)] scale-[1.02]'
                : 'border-slate-700 bg-slate-900/90 hover:border-slate-500'
            }`}
          >
            <span className="text-3xl font-extrabold text-slate-100">Câu tiếp</span>
            <span className="text-3xl font-black text-cyan-400">▶</span>
            <div
              className="absolute left-0 bottom-0 w-2 bg-cyan-400 transition-all ease-linear"
              style={{ height: `${getDwellProgress('NEXT')}%` }}
            />
          </div>
        </div>

        {/* ROW 2 */}
        {/* (2,0) Đáp án C */}
        <div
          ref={cardCRef}
          onClick={() => handleActionRequest('C', 'đáp án C')}
          className={`relative cursor-pointer overflow-hidden rounded-3xl border-2 p-6 md:p-8 flex flex-col justify-between transition-all duration-150 ${
            selected === 'C'
              ? 'border-emerald-300 bg-emerald-900/90 ring-4 ring-emerald-400/80 shadow-[0_0_30px_rgba(52,211,153,0.5)]'
              : isTargetActive('C')
                ? 'border-emerald-400 bg-emerald-950/95 ring-4 ring-offset-4 ring-offset-[#090d16] ring-emerald-400 scale-[1.02] shadow-[0_0_35px_rgba(52,211,153,0.6)]'
                : 'border-emerald-500/50 bg-[#0d2919] hover:border-emerald-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600/90 text-3xl font-black text-white shadow-lg">
              C
            </span>
            {isTargetActive('C') && (
              <span className="text-xs font-bold text-emerald-300 uppercase tracking-widest animate-pulse">
                HÚT TỪ TÍNH
              </span>
            )}
          </div>
          <p className="mt-4 text-xl md:text-2xl font-bold text-slate-100 leading-snug line-clamp-4">
            {options.C}
          </p>

          <div
            className="absolute bottom-0 left-0 h-2 bg-gradient-to-r from-emerald-400 to-teal-300 transition-all ease-linear"
            style={{ width: `${getDwellProgress('C')}%` }}
          />
        </div>

        {/* (2,1) Nút SUBMIT (Nộp bài) - Tích hợp Smooth Pursuit Orbit Stimulus */}
        <div className="flex justify-center items-end">
          <div
            ref={submitBtnRef}
            onClick={() => handleActionRequest('SUBMIT', 'nộp bài')}
            className={`relative cursor-pointer w-full max-w-sm h-24 rounded-t-3xl border-t-2 border-x-2 p-4 flex items-center justify-center gap-4 transition-all duration-150 ${
              isTargetActive('SUBMIT')
                ? 'border-rose-400 bg-rose-950/90 ring-4 ring-rose-400 shadow-[0_0_35px_rgba(244,63,94,0.6)] scale-[1.02]'
                : 'border-rose-600/60 bg-rose-950/40 hover:border-rose-500'
            }`}
          >
            {/* Smooth Pursuit Orbit Stimulus Dot */}
            <div className="relative flex items-center justify-center w-12 h-12">
              <div
                className="absolute w-4 h-4 rounded-full bg-cyan-300 shadow-[0_0_15px_#22d3ee] pointer-events-none"
                style={{
                  transform: `translate(${Math.cos(orbitAngle) * 22}px, ${Math.sin(orbitAngle) * 22}px)`,
                }}
              />
              <span className="text-2xl">🎯</span>
            </div>

            <div className="flex flex-col items-start">
              <span className="text-xl md:text-2xl font-black text-white tracking-wide">
                Nộp bài
              </span>
              <span className="text-xs font-semibold text-rose-300">
                Lia mắt theo chấm xoay
              </span>
            </div>

            {/* Pursuit / Dwell Progress Indicator */}
            <div
              className="absolute top-0 left-0 h-1.5 bg-gradient-to-r from-rose-400 to-cyan-400 transition-all ease-linear"
              style={{
                width: `${Math.max(getDwellProgress('SUBMIT'), pursuitProgress * 100)}%`,
              }}
            />
          </div>
        </div>

        {/* (2,2) Đáp án D */}
        <div
          ref={cardDRef}
          onClick={() => handleActionRequest('D', 'đáp án D')}
          className={`relative cursor-pointer overflow-hidden rounded-3xl border-2 p-6 md:p-8 flex flex-col justify-between transition-all duration-150 ${
            selected === 'D'
              ? 'border-amber-300 bg-amber-900/90 ring-4 ring-amber-400/80 shadow-[0_0_30px_rgba(251,191,36,0.5)]'
              : isTargetActive('D')
                ? 'border-amber-400 bg-amber-950/95 ring-4 ring-offset-4 ring-offset-[#090d16] ring-amber-400 scale-[1.02] shadow-[0_0_35px_rgba(251,191,36,0.6)]'
                : 'border-amber-500/50 bg-[#291e0d] hover:border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-600/90 text-3xl font-black text-white shadow-lg">
              D
            </span>
            {isTargetActive('D') && (
              <span className="text-xs font-bold text-amber-300 uppercase tracking-widest animate-pulse">
                HÚT TỪ TÍNH
              </span>
            )}
          </div>
          <p className="mt-4 text-xl md:text-2xl font-bold text-slate-100 leading-snug line-clamp-4">
            {options.D}
          </p>

          <div
            className="absolute bottom-0 left-0 h-2 bg-gradient-to-r from-amber-400 to-yellow-300 transition-all ease-linear"
            style={{ width: `${getDwellProgress('D')}%` }}
          />
        </div>
      </div>

      {/* Gaze Modal Xác nhận Trợ năng WCAG AAA */}
      {confirmAction && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-8 animate-in fade-in duration-200">
          <div className="relative w-full max-w-5xl rounded-3xl border-4 border-cyan-500 bg-[#0c1220] p-10 shadow-[0_0_60px_rgba(6,182,212,0.4)] flex flex-col items-center justify-between min-h-[480px]">
            {/* Header Dialog */}
            <div className="text-center space-y-3">
              <span className="rounded-full bg-cyan-950 px-4 py-1.5 text-sm font-extrabold text-cyan-300 border border-cyan-500/50 uppercase tracking-widest">
                XÁC NHẬN CỬ CHỈ MẮT
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white">
                Xác nhận chọn {confirmAction.label}?
              </h2>
              {confirmAction.id === 'SUBMIT' && (
                <p className="text-base md:text-lg font-medium text-amber-300">
                  ⚠️ Hãy lia mắt đuổi theo chấm sáng vệ tinh bên dưới để xác nhận nộp bài an toàn (tỷ lệ bấm nhầm 0%).
                </p>
              )}
            </div>

            {/* Middle Section: Pursuit Target or Standard Modal */}
            {confirmAction.id === 'SUBMIT' ? (
              <div
                ref={modalPursuitRef}
                className="relative my-8 flex items-center justify-center w-52 h-52 rounded-full border-4 border-rose-500/70 bg-rose-950/40 shadow-[0_0_40px_rgba(244,63,94,0.3)]"
              >
                {/* Rotating Orbit Stimulus Dot */}
                <div
                  className="absolute w-7 h-7 rounded-full bg-cyan-300 shadow-[0_0_20px_#22d3ee] pointer-events-none transition-transform"
                  style={{
                    transform: `translate(${Math.cos(orbitAngle) * 58}px, ${Math.sin(orbitAngle) * 58}px)`,
                  }}
                />

                {/* Circular Pursuit Progress Ring */}
                <div className="flex flex-col items-center justify-center">
                  <span className="text-4xl font-black text-rose-400">
                    {Math.round(pursuitProgress * 100)}%
                  </span>
                  <span className="text-xs font-bold text-slate-300 tracking-wider uppercase mt-1">
                    Theo dấu mắt
                  </span>
                </div>
              </div>
            ) : (
              <div className="my-6 text-center text-slate-300 text-lg">
                Nhìn giữ vào ô <strong className="text-emerald-400 font-black">ĐỒNG Ý</strong> bên phải hoặc <strong className="text-rose-400 font-black">HỦY BỎ</strong> bên trái
              </div>
            )}

            {/* Action Buttons Row */}
            <div className="w-full grid grid-cols-2 gap-8 mt-4">
              {/* Nút KHÔNG ĐỒNG Ý */}
              <div
                ref={modalCancelRef}
                onClick={() => handleConfirm(false)}
                className={`relative cursor-pointer overflow-hidden rounded-2xl border-2 p-6 flex items-center justify-center gap-3 transition-all ${
                  isTargetActive('SAFE_MARGIN')
                    ? 'border-rose-400 bg-rose-900/90 ring-4 ring-rose-400 shadow-[0_0_30px_rgba(244,63,94,0.6)] scale-[1.02]'
                    : 'border-rose-700/80 bg-rose-950/60 hover:border-rose-500'
                }`}
              >
                <span className="text-3xl font-black text-rose-400">✕</span>
                <span className="text-2xl font-black text-white">Không đồng ý</span>
                <div
                  className="absolute bottom-0 left-0 h-2 bg-rose-400 transition-all ease-linear"
                  style={{ width: `${getDwellProgress('SAFE_MARGIN')}%` }}
                />
              </div>

              {/* Nút ĐỒNG Ý (Hoặc Nộp bài bằng Smooth Pursuit) */}
              {confirmAction.id === 'SUBMIT' ? (
                <div
                  onClick={() => handleConfirm(true)}
                  className="relative cursor-pointer overflow-hidden rounded-2xl border-2 border-rose-500 bg-rose-900/60 p-6 flex items-center justify-center gap-3 hover:bg-rose-800"
                >
                  <span className="text-3xl font-black text-amber-400">🎯</span>
                  <span className="text-2xl font-black text-white">Nộp bài ngay</span>
                </div>
              ) : (
                <div
                  ref={modalConfirmRef}
                  onClick={() => handleConfirm(true)}
                  className={`relative cursor-pointer overflow-hidden rounded-2xl border-2 p-6 flex items-center justify-center gap-3 transition-all ${
                    isTargetActive('NEXT')
                      ? 'border-emerald-400 bg-emerald-900/90 ring-4 ring-emerald-400 shadow-[0_0_30px_rgba(52,211,153,0.6)] scale-[1.02]'
                      : 'border-emerald-700/80 bg-emerald-950/60 hover:border-emerald-500'
                  }`}
                >
                  <span className="text-3xl font-black text-emerald-400">✓</span>
                  <span className="text-2xl font-black text-white">Đồng ý</span>
                  <div
                    className="absolute bottom-0 left-0 h-2 bg-emerald-400 transition-all ease-linear"
                    style={{ width: `${getDwellProgress('NEXT')}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
