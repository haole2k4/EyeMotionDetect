'use client';

import { use, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { MCQBoard } from '@/components/mcq/MCQBoard';
import { GazeProvider } from '@/components/gaze/GazeProvider';

export default function ExamSessionFocusMode({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [session, setSession] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const answerQueueRef = useRef<Promise<void>>(Promise.resolve());
  const finishingRef = useRef(false);

  // Fetch session data
  useEffect(() => {
    async function loadSession() {
      try {
        const res = await api.get(`/exams/sessions/${sessionId}/active`);
        // If completed, redirect back to dashboard
        if (res.data.status === 'COMPLETED') {
          router.push('/user/dashboard');
          return;
        }
        setSession(res.data);
      } catch (error) {
        console.error(error);
        router.push('/user/dashboard');
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, [sessionId, router]);

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

  const handleFinish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      await answerQueueRef.current.catch(() => undefined);
      await api.post(`/exams/sessions/${sessionId}/finish`);
      router.push('/user/dashboard');
    } catch (error) {
      console.error(error);
      finishingRef.current = false;
    }
  }, [router, sessionId]);

  const handleManualFinish = async () => {
    if (!confirm('Bạn có chắc chắn muốn nộp bài?')) return;
    await handleFinish();
  };

  const handleAnswer = useCallback(async (optionChoice: string) => {
    if (!session) return;

    const question = session.exam.questions[currentIndex];

    // Validate answer mapped correctly
    const mapChoiceToIndex: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
    const optionIndex = mapChoiceToIndex[optionChoice];
    if (optionIndex === undefined) return;
    const selectedOptionString = question.options[optionIndex];

    // Optimistic UI update: reflect answer and navigate immediately.
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
      dwellTimeMs: 2500,
    });

    if (currentIndex >= session.exam.questions.length - 1) {
      try {
        await answerPersistPromise;
        await handleFinish();
      } catch (error) {
        console.error(error);
      }
    }
  }, [session, currentIndex, enqueueAnswerSubmission, handleFinish]);

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

  if (loading || !session) {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-white text-3xl font-bold tracking-widest">ĐANG TẢI...</div>;
  }

  if (questions.length === 0) {
    return <div className="p-12">Bài thi không có câu hỏi nào.</div>;
  }

  const currentQuestion = questions[currentIndex];
  
  // Format options for MCQBoard
  const optionsObj = {
    A: currentQuestion.options[0] || '',
    B: currentQuestion.options[1] || '',
    C: currentQuestion.options[2] || '',
    D: currentQuestion.options[3] || '',
  };

  return (
    <GazeProvider>
      <div className="fixed inset-0 z-[100] w-screen h-screen bg-gray-900 overflow-hidden">
        {/* Top Progress Bar */}
        <div className="absolute top-2 left-0 w-full flex justify-center gap-1 z-50 px-4">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {questions.map((q: any, i: number) => {
            const isAnswered = answeredQuestionIds.has(q.id);
            const isCurrent = i === currentIndex;
            let bgColor = 'bg-blue-500/20';
            if (isCurrent) bgColor = 'bg-blue-500';
            else if (isAnswered) bgColor = 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]';

            return (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${bgColor}`}
              />
            );
          })}
        </div>

        {/* Content Board */}
        <div className="w-full h-full">
          <MCQBoard
            question={currentQuestion.content}
            options={optionsObj}
            onAnswerSelected={handleAnswer}
            onPrev={() => setCurrentIndex((prev) => Math.max(prev - 1, 0))}
            onNext={() => setCurrentIndex((prev) => Math.min(prev + 1, questions.length - 1))}
            onSubmit={handleManualFinish}
          />
        </div>
      </div>
    </GazeProvider>
  );
}