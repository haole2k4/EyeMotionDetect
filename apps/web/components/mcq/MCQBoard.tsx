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
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit?: () => void;
}

export function MCQBoard({ question, options, onAnswerSelected, onBack, onPrev, onNext, onSubmit }: MCQBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);

  const handleAnswerClick = useCallback((id: 'A' | 'B' | 'C' | 'D') => {
    setSelected(id);
    if (onAnswerSelected) {
      onAnswerSelected(id);
    }
  }, [onAnswerSelected]);

  return (
    <div className="grid grid-cols-3 grid-rows-3 h-screen w-screen gap-6 p-6 bg-gray-900 overflow-hidden select-none">
      
      {/* Row 1 */}
      {/* [0,0] Top-Left: Option A */}
      <GazeButton 
        id="A" 
        onClick={() => handleAnswerClick('A')} 
        isActive={selected === 'A'}
        className="col-start-1 row-start-1 bg-blue-600/80 rounded-3xl shadow-xl hover:shadow-2xl hover:scale-105 transition-transform"
      >
        <span className="text-5xl font-bold text-white uppercase tracking-wider">A</span>
        <span className="text-2xl mt-4 font-medium text-blue-100">{options.A}</span>
      </GazeButton>

      {/* [0,1] Top-Center: Back */}
      <div className="col-start-2 row-start-1 flex justify-center items-start">
         <GazeButton 
          id="Back" 
          onClick={onBack}
          className="w-48 h-20 bg-gray-700/80 rounded-b-3xl shadow-lg border-t-0"
         >
           <span className="text-xl font-bold text-white">Quay lại</span>
         </GazeButton>
      </div>

      {/* [0,2] Top-Right: Option B */}
      <GazeButton 
        id="B" 
        onClick={() => handleAnswerClick('B')} 
        isActive={selected === 'B'}
        className="col-start-3 row-start-1 bg-purple-600/80 rounded-3xl shadow-xl hover:shadow-2xl hover:scale-105 transition-transform"
      >
        <span className="text-5xl font-bold text-white uppercase tracking-wider">B</span>
        <span className="text-2xl mt-4 font-medium text-purple-100">{options.B}</span>
      </GazeButton>

      {/* Row 2 */}
      {/* [1,0] Mid-Left: Prev */}
      <div className="col-start-1 row-start-2 flex justify-start items-center">
        <GazeButton 
          id="Prev" 
          onClick={onPrev}
          className="w-20 h-48 bg-gray-700/80 rounded-r-3xl shadow-lg border-l-0"
        >
          <span className="text-xl font-bold text-white -rotate-90 whitespace-nowrap">Câu trước</span>
        </GazeButton>
      </div>

      {/* [1,1] Center: Question */}
      <div className="col-start-2 row-start-2 flex items-center justify-center p-8 bg-gray-800 rounded-3xl shadow-2xl border border-gray-700/50">
        <h1 className="text-4xl text-white font-bold text-center leading-tight">{question}</h1>
      </div>

      {/* [1,2] Mid-Right: Next */}
      <div className="col-start-3 row-start-2 flex justify-end items-center">
        <GazeButton 
          id="Next" 
          onClick={onNext}
          className="w-20 h-48 bg-gray-700/80 rounded-l-3xl shadow-lg border-r-0"
        >
          <span className="text-xl font-bold text-white rotate-90 whitespace-nowrap">Câu tiếp</span>
        </GazeButton>
      </div>

      {/* Row 3 */}
      {/* [2,0] Bottom-Left: Option C */}
      <GazeButton 
        id="C" 
        onClick={() => handleAnswerClick('C')} 
        isActive={selected === 'C'}
        className="col-start-1 row-start-3 bg-emerald-600/80 rounded-3xl shadow-xl mb-8 hover:shadow-2xl hover:scale-105 transition-transform"
      >
        <span className="text-5xl font-bold text-white uppercase tracking-wider">C</span>
        <span className="text-2xl mt-4 font-medium text-emerald-100">{options.C}</span>
      </GazeButton>

      {/* [2,1] Bottom-Center: Submit */}
      <div className="col-start-2 row-start-3 flex justify-center items-end mb-8">
        <GazeButton 
          id="Submit" 
          onClick={onSubmit}
          className="w-64 h-24 bg-rose-600/90 rounded-t-3xl rounded-b-xl shadow-2xl shadow-rose-900/50 border-b-8 border-rose-800"
        >
          <span className="text-2xl font-black text-white uppercase tracking-widest">Nộp bài</span>
        </GazeButton>
      </div>

      {/* [2,2] Bottom-Right: Option D */}
      <GazeButton 
        id="D" 
        onClick={() => handleAnswerClick('D')} 
        isActive={selected === 'D'}
        className="col-start-3 row-start-3 bg-amber-600/80 rounded-3xl shadow-xl mb-8 hover:shadow-2xl hover:scale-105 transition-transform"
      >
        <span className="text-5xl font-bold text-white uppercase tracking-wider">D</span>
        <span className="text-2xl mt-4 font-medium text-amber-100">{options.D}</span>
      </GazeButton>

    </div>
  );
}