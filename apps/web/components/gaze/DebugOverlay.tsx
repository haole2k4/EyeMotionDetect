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
        setIsVisible((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isVisible || !stats) return null;

  return (
    <div className="fixed top-4 left-4 z-[99999] w-80 rounded-lg bg-black/85 p-4 font-mono text-xs text-green-400 shadow-xl pointer-events-none border border-neutral-800">
      <h3 className="mb-2 border-b border-gray-700 pb-1 font-bold text-white flex justify-between items-center">
        <span>Gaze Core 144Hz HUD</span>
        <span className="text-[10px] text-cyan-400 uppercase">{stats.activeModel}</span>
      </h3>

      <div className="space-y-1">
        <div className="flex justify-between">
          <span>FPS (Render Loop):</span>
          <span className={stats.fps >= 60 ? 'text-green-400 font-bold' : 'text-yellow-400'}>
            {stats.fps} FPS
          </span>
        </div>

        <div className="flex justify-between">
          <span>WASM / Inference:</span>
          <span>{stats.inferenceMs.toFixed(1)} ms</span>
        </div>

        <div className="flex justify-between">
          <span>MediaPipe Loop:</span>
          <span className={stats.mediapipeMs < 25 ? 'text-green-400' : 'text-yellow-400'}>
            {stats.mediapipeMs.toFixed(1)} ms
          </span>
        </div>

        <div className="mt-2 border-t border-gray-700 pt-2 flex justify-between">
          <span>Smoothed Gaze:</span>
          <span>
            {stats.smoothedGaze[0].toFixed(0)}, {stats.smoothedGaze[1].toFixed(0)}
          </span>
        </div>

        {stats.activeTargetKey && (
          <div className="flex justify-between text-yellow-300">
            <span>Magnetic Snap:</span>
            <span className="font-bold">{stats.activeTargetKey}</span>
          </div>
        )}

        <div className="mt-2 border-t border-gray-700 pt-2">
          <div className="flex justify-between mb-1">
            <span>EAR (L / R):</span>
            <span className={stats.headPoseOk === false ? 'text-red-400' : 'text-neutral-400'}>
              Pose: {stats.headPoseOk ? 'OK' : 'TILTED'}
            </span>
          </div>
          <div className="flex gap-2">
            <span className={stats.earLeft < 0.2 ? 'text-yellow-400' : ''}>
              L: {stats.earLeft.toFixed(3)}
            </span>
            <span className={stats.earRight < 0.2 ? 'text-yellow-400' : ''}>
              R: {stats.earRight.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="mt-2 border-t border-gray-700 pt-2 flex justify-between">
          <span>Face Status:</span>
          <span className={stats.singleFaceReady ? 'text-green-400' : 'text-red-400'}>
            {stats.singleFaceReady ? '1 FACE (LOCKED)' : `${stats.faceCount} FACES`}
          </span>
        </div>

        <div className="mt-2 border-t border-gray-700 pt-2 flex justify-between font-bold">
          <span>Action / Gesture:</span>
          <span
            className={
              stats.blinkState !== 'none'
                ? 'rounded bg-emerald-600 px-1 text-white'
                : stats.saccadeEvent && stats.saccadeEvent !== 'none'
                ? 'rounded bg-purple-600 px-1 text-white'
                : 'text-gray-400'
            }
          >
            {stats.blinkState !== 'none'
              ? stats.blinkState.toUpperCase()
              : stats.saccadeEvent && stats.saccadeEvent !== 'none'
              ? `SACCADE_${stats.saccadeEvent.toUpperCase()}`
              : 'IDLE'}
          </span>
        </div>

        <div className="flex justify-between text-neutral-300">
          <span>Grid Region:</span>
          <span className="text-cyan-300">{stats.currentRegion}</span>
        </div>

        {stats.dwellProgress > 0 && (
          <div className="flex justify-between text-amber-300">
            <span>Dwell Progress:</span>
            <span>{(stats.dwellProgress * 100).toFixed(0)}%</span>
          </div>
        )}

        <div className="mt-3 text-[10px] text-gray-500 italic">
          Press Ctrl+Shift+D to toggle HUD
        </div>
      </div>
    </div>
  );
}
