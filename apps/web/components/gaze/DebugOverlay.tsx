"use client";

import React, { useState, useEffect } from 'react';
import { useGaze } from './GazeProvider';

export function DebugOverlay() {
  const { stats } = useGaze();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Shift + D để ẩn/hiện Debug
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        setIsVisible(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible || !stats) return null;

  return (
    <div className="fixed top-4 left-4 bg-black/80 text-green-400 p-4 rounded-lg font-mono text-xs z-[99999] shadow-lg pointer-events-none w-72">
      <h3 className="font-bold text-white mb-2 border-b border-gray-700 pb-1">Gaze Debug Stats</h3>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>FPS:</span>
          <span className={stats.fps >= 30 ? 'text-green-400' : 'text-red-400'}>{stats.fps}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Inference (Worker):</span>
          <span>{stats.inferenceMs.toFixed(1)} ms</span>
        </div>
        
        <div className="flex justify-between">
          <span>MediaPipe Loop:</span>
          <span className={stats.mediapipeMs < 16 ? 'text-green-400' : 'text-yellow-400'}>
            {stats.mediapipeMs.toFixed(1)} ms
          </span>
        </div>
        
        <div className="mt-2 border-t border-gray-700 pt-2 flex justify-between">
          <span>Active Model:</span>
          <span className="text-blue-400 uppercase">{stats.activeModel}</span>
        </div>

        <div className="flex justify-between">
          <span>Smoothed Gaze:</span>
          <span>X: {stats.smoothedGaze[0].toFixed(0)}, Y: {stats.smoothedGaze[1].toFixed(0)}</span>
        </div>

        <div className="mt-2 border-t border-gray-700 pt-2">
          <div className="flex justify-between mb-1">
            <span>EAR Thresh / Current:</span>
          </div>
          <div className="flex gap-2">
            <span className={stats.earLeft < 0.21 ? 'text-yellow-400' : ''}>L: {stats.earLeft.toFixed(3)}</span>
            <span className={stats.earRight < 0.21 ? 'text-yellow-400' : ''}>R: {stats.earRight.toFixed(3)}</span>
          </div>
        </div>

        <div className="mt-2 border-t border-gray-700 pt-2 flex justify-between">
          <span>Faces In Frame:</span>
          <span className={stats.singleFaceReady ? 'text-green-400' : 'text-red-400'}>{stats.faceCount}</span>
        </div>

        <div className="flex justify-between">
          <span>Control Lock:</span>
          <span className={stats.singleFaceReady ? 'text-green-400' : 'text-yellow-300'}>
            {stats.singleFaceReady ? 'UNLOCKED' : 'LOCKED'}
          </span>
        </div>

        <div className="mt-2 border-t border-gray-700 pt-2 flex justify-between font-bold">
          <span>Action State:</span>
          <span className={stats.blinkState !== 'none' ? 'text-white bg-red-500 px-1 rounded' : 'text-gray-400'}>
            {stats.blinkState.toUpperCase()}
          </span>
        </div>

        <div className="flex justify-between font-bold text-yellow-300">
          <span>Drag Enabled:</span>
          <span>{stats.dragEnabled ? 'YES' : 'NO'}</span>
        </div>
        
        <div className="mt-4 text-[10px] text-gray-500 italic">
          Press Ctrl+Shift+D to close
        </div>
      </div>
    </div>
  );
}
