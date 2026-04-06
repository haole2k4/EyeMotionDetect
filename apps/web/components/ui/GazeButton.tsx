'use client';
import React, { useEffect, useRef, useState } from 'react';
import { useGaze } from '../gaze/GazeProvider';

interface GazeButtonProps {
  id: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  isActive?: boolean;
}

export function GazeButton({ id, onClick, className = '', children, isActive = false }: GazeButtonProps) {
  const { stats } = useGaze();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const onClickRef = useRef(onClick);

  // Keep ref to latest onClick without triggering re-runs of timeout
  useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  // Check gaze collision
  useEffect(() => {
    if (!buttonRef.current || !stats?.smoothedGaze) return;

    const [gx, gy] = stats.smoothedGaze;
    const rect = buttonRef.current.getBoundingClientRect();

    const inBox = gx >= rect.left && gx <= rect.right && gy >= rect.top && gy <= rect.bottom;

    if (inBox !== isHovered) {
      setIsHovered(inBox);
    }
  }, [stats?.smoothedGaze, isHovered]);

  // Dwell time timeout logic
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    if (isHovered) {
      timeoutId = setTimeout(() => {
        setIsHovered(false); // Reset animation
        onClickRef.current?.();
      }, 2000); // 2 second dwell time
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isHovered]);

  return (
    <div
      ref={buttonRef}
      className={`relative overflow-hidden cursor-pointer flex items-center justify-center transition-colors group border-4 ${isActive ? 'border-yellow-400' : 'border-transparent'} hover:border-white ${className}`}
      onClick={() => {
        // Fallback for normal mouse click
        setIsHovered(false);
        onClickRef.current?.();
      }}
    >
      <div className="z-10 w-full h-full flex flex-col items-center justify-center">
        {children}
      </div>

      {/* Progress Background running horizontal */}
      <div
        className={`absolute bottom-0 left-0 h-full bg-black/30 transition-all ease-linear ${isHovered ? 'duration-[2000ms] w-full' : 'duration-300 w-0'}`}
      />
    </div>
  );
}
