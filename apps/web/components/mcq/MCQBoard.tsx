'use client';
import { useCallback, useEffect, useState } from 'react';
import { GazeButton } from '../ui/GazeButton';
import { useGaze } from '../gaze/GazeProvider';

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

export function MCQBoard({ question, options, onAnswerSelected, onPrev, onNext, onSubmit }: MCQBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const { setInteractionMode } = useGaze();

  const [confirmAction, setConfirmAction] = useState<{
    id: 'A' | 'B' | 'C' | 'D' | 'PREV' | 'NEXT' | 'SUBMIT';
    label: string;
  } | null>(null);

  const handleActionRequest = useCallback((id: 'A' | 'B' | 'C' | 'D' | 'PREV' | 'NEXT' | 'SUBMIT', label: string) => {
    if (confirmAction) return; // already confirming something
    setConfirmAction({ id, label });
  }, [confirmAction]);

  const handleConfirm = useCallback((confirmed: boolean) => {
    if (!confirmAction) return;
    if (confirmed) {
      if (['A', 'B', 'C', 'D'].includes(confirmAction.id)) {
        setSelected(confirmAction.id);
        if (onAnswerSelected) onAnswerSelected(confirmAction.id as 'A' | 'B' | 'C' | 'D');
      } else if (confirmAction.id === 'PREV' && onPrev) {
        onPrev();
      } else if (confirmAction.id === 'NEXT' && onNext) {
        onNext();
      } else if (confirmAction.id === 'SUBMIT' && onSubmit) {
        onSubmit();
      }
    }
    setConfirmAction(null);
  }, [confirmAction, onAnswerSelected, onPrev, onNext, onSubmit]);

  const isConfirming = Boolean(confirmAction);

  useEffect(() => {
    setInteractionMode(isConfirming ? 'confirm' : 'default');

    return () => {
      setInteractionMode('default');
    };
  }, [isConfirming, setInteractionMode]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-900 select-none">
      <div className={`grid grid-cols-3 grid-rows-3 h-full w-full gap-4 p-4 ${isConfirming ? 'pointer-events-none opacity-30' : ''}`}>
      
      {/* Row 0 */}
      {/* (0,0) Đáp án A */}
      <GazeButton 
        id="A" 
        onClick={() => handleActionRequest('A', 'đáp án A')} 
        isActive={selected === 'A'}
        className="bg-blue-600/80 rounded-3xl shadow-xl transition-transform hover:scale-105"
      >
        <span className="text-4xl font-bold text-white uppercase">A</span>
        <span className="text-xl mt-2 text-blue-100 px-4 text-center">{options.A}</span>
      </GazeButton>

      {/* (0,1) Previous */}
      <div className="flex justify-center items-start">
        <GazeButton 
          id="PREV" 
          onClick={() => handleActionRequest('PREV', 'về câu trước')}
          className="w-full h-24 bg-gray-700/80 rounded-b-3xl shadow-lg border-t-0"
        >
          <span className="text-xl font-bold text-white">Câu trước</span>
        </GazeButton>
      </div>

      {/* (0,2) Đáp án B */}
      <GazeButton 
        id="B" 
        onClick={() => handleActionRequest('B', 'đáp án B')} 
        isActive={selected === 'B'}
        className="bg-purple-600/80 rounded-3xl shadow-xl transition-transform hover:scale-105"
      >
        <span className="text-4xl font-bold text-white uppercase">B</span>
        <span className="text-xl mt-2 text-purple-100 px-4 text-center">{options.B}</span>
      </GazeButton>

      {/* Row 1 */}
      {/* (1,0) SAFE_MARGIN */}
      <div className="flex justify-start items-center">
         {/* Safe margin - no interactive button */}
      </div>

      {/* (1,1) DEADZONE - Ký hiệu trung tâm tĩnh */}
      <div className="flex items-center justify-center p-8 bg-gray-800 rounded-3xl shadow-2xl border border-gray-700/50">
        <h1 className="text-3xl text-white font-bold text-center leading-tight overflow-y-auto">
          {question}
        </h1>
      </div>

      {/* (1,2) Next */}
      <div className="flex justify-end items-center h-full">
        <GazeButton 
          id="NEXT" 
          onClick={() => handleActionRequest('NEXT', 'câu tiếp')}
          className="w-56 h-[80%] bg-gray-700/80 rounded-l-3xl shadow-xl border-r-0 hover:bg-gray-600 transition-colors"
        >
          <span className="text-3xl font-bold text-white whitespace-nowrap">Câu tiếp</span>
        </GazeButton>
      </div>

      {/* Row 2 */}
      {/* (2,0) Đáp án C */}
      <GazeButton 
        id="C" 
        onClick={() => handleActionRequest('C', 'đáp án C')} 
        isActive={selected === 'C'}
        className="bg-emerald-600/80 rounded-3xl shadow-xl transition-transform hover:scale-105"
      >
        <span className="text-4xl font-bold text-white uppercase">C</span>
        <span className="text-xl mt-2 text-emerald-100 px-4 text-center">{options.C}</span>
      </GazeButton>

      {/* (2,1) Submit */}
      <div className="flex justify-center items-end">
        <GazeButton 
          id="SUBMIT" 
          onClick={() => handleActionRequest('SUBMIT', 'nộp bài')}
          className="w-full h-24 bg-rose-600/90 rounded-t-3xl shadow-lg border-b-0 transition-opacity hover:bg-rose-500"
        >
          <span className="text-xl font-bold text-white">Nộp bài</span>
        </GazeButton>
      </div>

      {/* (2,2) Đáp án D */}
      <GazeButton 
        id="D" 
        onClick={() => handleActionRequest('D', 'đáp án D')} 
        isActive={selected === 'D'}
        className="bg-amber-600/80 rounded-3xl shadow-xl transition-transform hover:scale-105"
      >
        <span className="text-4xl font-bold text-white uppercase">D</span>
        <span className="text-xl mt-2 text-amber-100 px-4 text-center">{options.D}</span>
      </GazeButton>
      </div>

      {confirmAction && (
        <div className="absolute inset-0 z-50 grid grid-cols-3 grid-rows-3 gap-4 bg-black/60 p-4">
          <div className="row-start-2 col-start-1 flex items-center justify-start h-full">
            <GazeButton
              id="SAFE_MARGIN"
              onClick={() => handleConfirm(false)}
              className="w-56 h-[80%] bg-red-600/90 rounded-r-3xl shadow-2xl border-l-0 hover:bg-red-500 transition-colors"
            >
              <span className="text-2xl font-bold text-white">Không đồng ý</span>
            </GazeButton>
          </div>

          <div className="row-start-2 col-start-2 flex items-center justify-center rounded-3xl border-4 border-yellow-400 bg-blue-900/90 p-8 shadow-2xl">
            <h1 className="text-3xl font-bold leading-tight text-white text-center">
              Xác nhận chọn {confirmAction.label}?
            </h1>
          </div>

          <div className="row-start-2 col-start-3 flex items-center justify-end h-full">
            <GazeButton
              id="NEXT"
              onClick={() => handleConfirm(true)}
              className="w-56 h-[80%] bg-green-600/90 rounded-l-3xl shadow-2xl border-r-0 hover:bg-green-500 transition-colors"
            >
              <span className="text-3xl font-bold text-white">Đồng ý</span>
            </GazeButton>
          </div>
        </div>
      )}

    </div>
  );
}