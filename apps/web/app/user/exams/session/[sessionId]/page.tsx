'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { MCQBoard } from '@/components/mcq/MCQBoard';
import { Button } from '@/components/ui/button';
import { GazeProvider } from '@/components/gaze/GazeProvider';

export default function ExamSessionFocusMode({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);
  const router = useRouter();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [session, setSession] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isFinishing, setIsFinishing] = useState(false);

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

  const handleFinish = useCallback(async () => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      await api.post(`/exams/sessions/${sessionId}/finish`);
      router.push('/user/dashboard');
    } catch (error) {
      console.error(error);
      setIsFinishing(false);
    }
  }, [isFinishing, router, sessionId]);

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

    try {
      await api.post(`/exams/sessions/${sessionId}/answer`, {
        questionId: question.id,
        selectedOption: selectedOptionString,
        dwellTimeMs: 2500,
      });

      // Update local session state so the progress bar reflects the answer immediately
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSession((prev: any) => {
        if (!prev) return prev;
        const cloned = { ...prev };
        if (!cloned.answers) cloned.answers = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingIdx = cloned.answers.findIndex((a: any) => a.question?.id === question.id);
        if (existingIdx >= 0) {
          cloned.answers[existingIdx].selectedOption = selectedOptionString;
        } else {
          cloned.answers.push({ question: { id: question.id }, selectedOption: selectedOptionString });
        }
        return cloned;
      });

      if (currentIndex < session.exam.questions.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        await handleFinish();
      }
    } catch (error) {
      console.error(error);
    }
  }, [session, currentIndex, sessionId, handleFinish]);

  if (loading || !session) {
    return <div className="h-screen w-full flex items-center justify-center bg-gray-900 text-white text-3xl font-bold tracking-widest">ĐANG TẢI...</div>;
  }

  const questions = session.exam.questions || [];
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const isAnswered = session?.answers?.some((a: any) => a.question?.id === q.id);
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

        {/* Exam Controls */}
        <div className="absolute top-8 right-8 z-50 flex gap-4">
          <div className="bg-gray-800 border-2 border-gray-600 px-6 py-3 rounded-full text-white font-bold text-xl shadow-lg">
            Câu {currentIndex + 1} / {questions.length}
          </div>
          <Button 
            onClick={handleManualFinish} 
            variant="destructive" 
            size="lg" 
            className="rounded-full font-bold text-xl px-8 border-2 border-red-400 hover:border-red-300"
          >
            Nộp bài
          </Button>
        </div>

        {/* Content Board */}
        <div className="w-full h-full">
          <MCQBoard
            key={currentQuestion.id} // Force remount to reset internal state of MCQBoard if needed
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