'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { GazeProvider } from '@/components/gaze/GazeProvider';
import { DebugOverlay } from '@/components/gaze/DebugOverlay';

const menuItems = [
  { href: '/user/dashboard', label: 'Bảng thi' },
  { href: '/user/calibration', label: 'Calibration' },
  { href: '/user/settings', label: 'Cài đặt' },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);

  const user = useAuthStore((state) => state.user);

  return (
    <GazeProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <aside className="flex h-full w-64 flex-col border-r bg-card px-4 py-8">
          <h1 className="mb-2 px-2 text-2xl font-bold">{user?.username || 'Học Viên'}</h1>
          <p className="mb-8 px-2 text-sm text-muted-foreground">{user?.email || ''}</p>
          <nav className="flex-1 space-y-2">
            {menuItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={cn(
                    'block rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <button
            onClick={() => {
              logout();
              window.location.href = '/login';
            }}
            className="mt-auto w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-left text-sm font-medium text-destructive transition-colors hover:bg-destructive/15"
          >
            Đăng xuất
          </button>
        </aside>
        <main className="flex-1 overflow-auto bg-background px-6 py-8 md:px-8">
          <div className="mx-auto max-w-5xl space-y-6">{children}</div>
        </main>
      </div>
      <DebugOverlay />
    </GazeProvider>
  );
}