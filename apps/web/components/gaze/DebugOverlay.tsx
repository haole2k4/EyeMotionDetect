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
    <div className="fixed top-4 left-4 z-[99999] w-80 rounded-xl border-2 border-[#0A0A0A] bg-white p-4 text-xs text-[#0A0A0A] pointer-events-none tabular-nums">
      <h3 className="mb-2.5 border-b-2 border-[#E4E4E7] pb-2 font-bold text-[#0A0A0A] flex justify-between items-center">
        <span>Gaze Core 144Hz HUD</span>
        <span className="rounded border border-[#D4D4D8] bg-[#F4F4F5] px-2 py-0.5 text-[11px] font-semibold text-[#0052FF]">
          {stats.activeModel}
        </span>
      </h3>

      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-[#52525B]">FPS (Render Loop):</span>
          <span className={stats.fps >= 60 ? 'text-[#15803D] font-bold' : 'text-[#B45309] font-bold'}>
            {stats.fps} FPS
          </span>
        </div>

        <div className="flex justify-between">
          <span className="text-[#52525B]">WASM / Inference:</span>
          <span className="font-semibold text-[#0A0A0A]">{stats.inferenceMs.toFixed(1)} ms</span>
        </div>

        <div className="flex justify-between">
          <span className="text-[#52525B]">MediaPipe Loop:</span>
          <span className={stats.mediapipeMs < 25 ? 'text-[#15803D] font-semibold' : 'text-[#B45309] font-semibold'}>
            {stats.mediapipeMs.toFixed(1)} ms
          </span>
        </div>

        <div className="mt-2 border-t-2 border-[#E4E4E7] pt-2 flex justify-between">
          <span className="text-[#52525B]">Smoothed Gaze:</span>
          <span className="font-semibold text-[#0A0A0A]">
            {stats.smoothedGaze[0].toFixed(0)}, {stats.smoothedGaze[1].toFixed(0)}
          </span>
        </div>

        {stats.activeTargetKey && (
          <div className="flex justify-between text-[#0052FF]">
            <span>Magnetic Snap:</span>
            <span className="font-bold">{stats.activeTargetKey}</span>
          </div>
        )}

        <div className="mt-2 border-t-2 border-[#E4E4E7] pt-2">
          <div className="flex justify-between mb-1">
            <span className="text-[#52525B]">EAR (L / R):</span>
            <span className={stats.headPoseOk === false ? 'text-[#DC2626] font-semibold' : 'text-[#3F3F46] font-medium'}>
              Pose: {stats.headPoseOk ? 'OK' : 'Tilted'}
            </span>
          </div>
          <div className="flex gap-3 font-medium">
            <span className={stats.earLeft < 0.2 ? 'text-[#B45309] font-semibold' : 'text-[#0A0A0A]'}>
              L: {stats.earLeft.toFixed(3)}
            </span>
            <span className={stats.earRight < 0.2 ? 'text-[#B45309] font-semibold' : 'text-[#0A0A0A]'}>
              R: {stats.earRight.toFixed(3)}
            </span>
          </div>
        </div>

        <div className="mt-2 border-t-2 border-[#E4E4E7] pt-2 flex justify-between">
          <span className="text-[#52525B]">Face Status:</span>
          <span className={stats.singleFaceReady ? 'text-[#15803D] font-semibold' : 'text-[#DC2626] font-semibold'}>
            {stats.singleFaceReady ? '1 Face (Locked)' : `${stats.faceCount} Faces`}
          </span>
        </div>

        <div className="mt-2 border-t-2 border-[#E4E4E7] pt-2 flex justify-between items-center font-semibold">
          <span className="text-[#52525B]">Action / Gesture:</span>
          <span
            className={
              stats.blinkState !== 'none'
                ? 'rounded bg-[#15803D] px-1.5 py-0.5 text-white'
                : stats.saccadeEvent && stats.saccadeEvent !== 'none'
                ? 'rounded bg-[#0052FF] px-1.5 py-0.5 text-white'
                : 'text-[#52525B]'
            }
          >
            {stats.blinkState !== 'none'
              ? stats.blinkState
              : stats.saccadeEvent && stats.saccadeEvent !== 'none'
              ? `saccade_${stats.saccadeEvent}`
              : 'Idle'}
          </span>
        </div>

        <div className="flex justify-between text-[#3F3F46]">
          <span className="text-[#52525B]">Grid Region:</span>
          <span className="font-semibold text-[#0052FF]">{stats.currentRegion}</span>
        </div>

        {stats.dwellProgress > 0 && (
          <div className="flex justify-between text-[#0052FF] font-semibold">
            <span>Dwell Progress:</span>
            <span>{(stats.dwellProgress * 100).toFixed(0)}%</span>
          </div>
        )}

        <div className="mt-3 text-[11px] text-[#52525B]">
          Nhấn Ctrl+Shift+D để ẩn/hiện HUD
        </div>
      </div>
    </div>
  );
}
