import { GazeProvider } from '@/components/gaze/GazeProvider';
import { DebugOverlay } from '@/components/gaze/DebugOverlay';

export default function GazeLayout({ children }: { children: React.ReactNode }) {
  return (
    <GazeProvider>
      {children}
      <DebugOverlay />
    </GazeProvider>
  );
}
