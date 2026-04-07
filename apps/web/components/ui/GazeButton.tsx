'use client';
import React from 'react';
import { useGaze } from '../gaze/GazeProvider';
import type { RegionId } from '../gaze/GazeProvider';

interface GazeButtonProps {
  id: RegionId;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  isActive?: boolean;
}

export function GazeButton({ id, onClick, className = '', children, isActive = false }: GazeButtonProps) {
  const { stats } = useGaze();
  
  // Dwell progress is managed globally by GazeProvider logic mapping Grid 3x3
  const isHovered = stats?.currentRegion === id;
  const progressPerc = isHovered ? (stats?.dwellProgress || 0) * 100 : 0;

  return (
    <div
      className={`relative overflow-hidden cursor-pointer flex items-center justify-center transition-colors group border-4 ${isActive ? 'border-yellow-400' : 'border-transparent'} hover:border-white ${className}`}
      onClick={onClick} // Click event is automatically dispatched by GazeProvider upon 100% dwell time!
    >
      <div className="z-10 w-full h-full flex flex-col items-center justify-center">
        {children}
      </div>

      {/* Visual Progress Background */}
      <div
        className="absolute bottom-0 left-0 h-full bg-black/30 transition-all ease-linear duration-100"
        style={{ width: `${progressPerc}%` }}
      />
    </div>
  );
}
