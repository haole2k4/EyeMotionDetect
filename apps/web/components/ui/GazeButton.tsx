'use client';

import React from 'react';
import { useGaze } from '../gaze/GazeProvider';
import type { RegionId } from '../gaze/GazeProvider';
import { cn } from '@/lib/utils';

interface GazeButtonProps {
  id: RegionId;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  isActive?: boolean;
}

export function GazeButton({
  id,
  onClick,
  className = '',
  children,
  isActive = false,
}: GazeButtonProps) {
  const { stats } = useGaze();

  // Dwell progress is managed globally by GazeProvider logic mapping Grid 3x3
  const isHovered = stats?.currentRegion === id;
  const progressPerc = isHovered
    ? Math.min(100, Math.max(0, (stats?.dwellProgress || 0) * 100))
    : 0;
  const isEngaged = isActive || isHovered;

  return (
    <button
      type="button"
      onClick={onClick} // Click event is automatically dispatched by GazeProvider upon 100% dwell time!
      aria-pressed={isActive}
      className={cn(
        'relative flex cursor-pointer items-center justify-center overflow-hidden rounded-[20px] border-[1.5px] text-[#1D1D1F] transition-[border-color,background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.985] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#0066CC]/40',
        isEngaged
          ? 'border-[#0066CC] bg-[#F5F9FF] shadow-[0_12px_28px_-6px_rgba(0,102,204,0.22),0_2px_6px_rgba(0,0,0,0.04)]'
          : 'border-black/[0.10] bg-white/95 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)] hover:border-[#0066CC] hover:bg-[#F5F9FF]',
        className
      )}
    >
      <div className="relative z-10 flex h-full w-full flex-col items-center justify-center">
        {children}
      </div>

      {/* Dwell sweep overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 border-r-2 border-[#0066CC] bg-[#0066CC]/[0.09] transition-[width] duration-75 ease-linear"
        style={{
          width: `${progressPerc}%`,
          opacity: progressPerc > 0 ? 1 : 0,
        }}
      />

      {/* Bottom dwell progress bar */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-2 bg-[#0066CC] transition-[width] duration-75 ease-linear"
        style={{ width: `${progressPerc}%` }}
      />
    </button>
  );
}
