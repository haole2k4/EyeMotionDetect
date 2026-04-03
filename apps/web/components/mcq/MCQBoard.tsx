'use client';
import { useCallback, useState } from 'react';
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
}

export function MCQBoard({ question, options, onAnswerSelected }: MCQBoardProps) {
  const { stats } = useGaze();
  const [selected, setSelected] = useState<string | null>(null);

  const handleClick = useCallback((id: 'A' | 'B' | 'C' | 'D') => {
    setSelected(id);
    if (onAnswerSelected) {
      onAnswerSelected(id);
    }
  }, [onAnswerSelected]);

  // Read state directly from Gaze Context
  const region = stats?.currentRegion || 'DEADZONE';
  const progress = stats?.dwellProgress || 0;

  const renderButton = (id: 'A' | 'B' | 'C' | 'D', text: string, bgClass: string, posClass: string) => {
    const isGazing = region === id;
    const progressPerc = isGazing ? progress * 100 : 0;
    
    return (
      <div 
        className={`absolute ${posClass} w-64 h-64 ${bgClass} rounded-2xl shadow-xl flex items-center justify-center cursor-pointer overflow-hidden border-4 ${selected === id ? 'border-yellow-400' : 'border-transparent'} hover:border-white transition-colors group`}
        onClick={() => handleClick(id)}
      >
        <span className="text-4xl font-bold text-white z-10">{id}: {text}</span>
        
        {/* Progress Background */}
        <div 
          className="absolute bottom-0 left-0 w-full bg-black/30 transition-all duration-100 ease-linear"
          style={{ height: `${progressPerc}%` }}
        />
      </div>
    );
  };

  return (
    <div className="relative w-full h-screen bg-gray-900 overflow-hidden select-none">
      {/* Question Text */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-1/2 p-6 bg-gray-800 rounded-xl shadow-lg border border-gray-700 text-center z-10">
        <h1 className="text-3xl text-white font-bold">{question}</h1>
      </div>

      {/* Deadzone Visual (Optional, can be removed in production) */}
      <div className="absolute inset-0 pointer-events-none hidden md:flex items-center justify-center">
        <div className="w-[40%] h-[40%] border-4 border-dashed border-gray-600/30 rounded-full flex items-center justify-center">
          <span className="text-gray-500/50 font-bold uppercase tracking-widest text-xl">Deadzones</span>
        </div>
      </div>

      {renderButton('A', options.A, 'bg-blue-600/80', 'top-10 left-10')}
      {renderButton('B', options.B, 'bg-purple-600/80', 'top-10 right-10')}
      {renderButton('C', options.C, 'bg-emerald-600/80', 'bottom-10 left-10')}
      {renderButton('D', options.D, 'bg-rose-600/80', 'bottom-10 right-10')}
    </div>
  );
}