'use client';
import { useCallback, useState } from 'react';
import { GazeButton } from '../ui/GazeButton';

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

  const handleAnswerClick = useCallback((id: 'A' | 'B' | 'C' | 'D') => {
    setSelected(id);
    if (onAnswerSelected) {
      onAnswerSelected(id);
    }
  }, [onAnswerSelected]);

  return (
    <div className="grid grid-cols-3 grid-rows-3 h-screen w-screen gap-4 p-4 bg-gray-900 overflow-hidden select-none">
      
      {/* Row 0 */}
      {/* (0,0) Đáp án A */}
      <GazeButton 
        id="A" 
        onClick={() => handleAnswerClick('A')} 
        isActive={selected === 'A'}
        className="bg-blue-600/80 rounded-3xl shadow-xl hover:scale-105 transition-transform"
      >
        <span className="text-4xl font-bold text-white uppercase">A</span>
        <span className="text-xl mt-2 text-blue-100 px-4 text-center">{options.A}</span>
      </GazeButton>

      {/* (0,1) Previous */}
      <div className="flex justify-center items-start">
        <GazeButton 
          id="PREV" 
          onClick={onPrev}
          className="w-full h-24 bg-gray-700/80 rounded-b-3xl shadow-lg border-t-0"
        >
          <span className="text-xl font-bold text-white">Câu trước</span>
        </GazeButton>
      </div>

      {/* (0,2) Đáp án B */}
      <GazeButton 
        id="B" 
        onClick={() => handleAnswerClick('B')} 
        isActive={selected === 'B'}
        className="bg-purple-600/80 rounded-3xl shadow-xl hover:scale-105 transition-transform"
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
      <div className="flex justify-end items-center">
        <GazeButton 
          id="NEXT" 
          onClick={onNext}
          className="w-32 h-64 bg-gray-700/80 rounded-l-3xl shadow-xl border-r-0 hover:bg-gray-600 transition-colors"
        >
          <span className="text-2xl font-bold text-white rotate-90 whitespace-nowrap">Câu tiếp</span>
        </GazeButton>
      </div>

      {/* Row 2 */}
      {/* (2,0) Đáp án C */}
      <GazeButton 
        id="C" 
        onClick={() => handleAnswerClick('C')} 
        isActive={selected === 'C'}
        className="bg-emerald-600/80 rounded-3xl shadow-xl hover:scale-105 transition-transform"
      >
        <span className="text-4xl font-bold text-white uppercase">C</span>
        <span className="text-xl mt-2 text-emerald-100 px-4 text-center">{options.C}</span>
      </GazeButton>

      {/* (2,1) Submit */}
      <div className="flex justify-center items-end">
        <GazeButton 
          id="SUBMIT" 
          onClick={onSubmit}
          className="w-full h-24 bg-rose-600/90 rounded-t-3xl shadow-lg border-b-0 hover:bg-rose-500 transition-colors"
        >
          <span className="text-xl font-bold text-white">Nộp bài</span>
        </GazeButton>
      </div>

      {/* (2,2) Đáp án D */}
      <GazeButton 
        id="D" 
        onClick={() => handleAnswerClick('D')} 
        isActive={selected === 'D'}
        className="bg-amber-600/80 rounded-3xl shadow-xl hover:scale-105 transition-transform"
      >
        <span className="text-4xl font-bold text-white uppercase">D</span>
        <span className="text-xl mt-2 text-amber-100 px-4 text-center">{options.D}</span>
      </GazeButton>

    </div>
  );
}