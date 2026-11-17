'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookOpen, Crosshair, LogOut, Menu, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { GazeProvider } from '@/components/gaze/GazeProvider';
import { DebugOverlay } from '@/components/gaze/DebugOverlay';

const menuItems = [
  { href: '/user/dashboard', label: 'Bảng thi', icon: BookOpen },
  { href: '/user/calibration', label: 'Hiệu chỉnh mắt', icon: Crosshair },
  { href: '/user/settings', label: 'Cài đặt', icon: SlidersHorizontal },
];

export default function UserLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const displayName = mounted ? user?.username || 'Học viên' : 'Học viên';
  const displayEmail = mounted ? user?.email || '' : '';

  const handleLogout = () => {
    logout();
    window.location.href = '/login';
  };

  const navContent = (
    <>
      <nav aria-label="Điều hướng cổng học viên" className="flex-1 space-y-1.5">
        {menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-2xl px-4 py-3 text-base font-medium transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] focus-visible:ring-offset-2',
                isActive
                  ? 'bg-white font-semibold text-[#0066CC] shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.05)]'
                  : 'text-[#3C3C43] hover:bg-black/[0.04] hover:text-[#1D1D1F]',
              )}
            >
              <Icon
                aria-hidden="true"
                className={cn('size-5 shrink-0', isActive ? 'text-[#0066CC]' : 'text-[#515154]')}
                strokeWidth={1.75}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-4 border-t border-black/[0.07]">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-[#FFB8B5] bg-[#FFECEB]/80 px-4 py-3 text-left text-base font-semibold text-[#D70015] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] hover:bg-[#FFDAD8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D70015] focus-visible:ring-offset-2"
        >
          <LogOut aria-hidden="true" className="size-5 shrink-0 text-[#D70015]" strokeWidth={1.75} />
          <span>Đăng xuất</span>
        </button>
      </div>
    </>
  );

  return (
    <GazeProvider>
      <div className="flex min-h-dvh flex-col bg-transparent text-[#1D1D1F] md:h-dvh md:flex-row md:overflow-hidden">
        {/* Mobile header */}
        <header className="sticky top-0 z-40 flex items-center justify-between border-b border-black/[0.08] bg-white/76 backdrop-blur-2xl backdrop-saturate-180 px-4 py-3 md:hidden">
          <div className="flex items-center gap-2.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 28 28"
              className="size-6 shrink-0 text-[#0066CC]"
              fill="none"
            >
              <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2.25" />
              <circle cx="14" cy="14" r="4.5" fill="currentColor" />
            </svg>
            <span className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
              EyeMotionDetect
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? 'Đóng menu điều hướng' : 'Mở menu điều hướng'}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-black/[0.10] bg-white/90 text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 hover:bg-[#F2F2F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]"
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </header>

        {mobileMenuOpen && (
          <div className="flex flex-col gap-4 border-b border-black/[0.08] bg-white/85 backdrop-blur-2xl backdrop-saturate-180 px-4 py-4 md:hidden">
            <div className="rounded-2xl border border-black/[0.07] bg-white/90 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
              <p className="truncate text-sm font-semibold text-[#1D1D1F]">{displayName}</p>
              {displayEmail && (
                <p className="truncate text-xs text-[#515154]">{displayEmail}</p>
              )}
            </div>
            {navContent}
          </div>
        )}

        {/* Desktop Sidebar */}
        <aside className="hidden h-full w-68 shrink-0 flex-col border-r border-black/[0.08] bg-white/72 backdrop-blur-2xl backdrop-saturate-180 shadow-[inset_-1px_0_0_rgba(255,255,255,0.6)] px-4 py-6 md:flex">
          <div className="mb-6 space-y-4 px-1">
            <div className="flex items-center gap-2.5">
              <svg
                aria-hidden="true"
                viewBox="0 0 28 28"
                className="size-7 shrink-0 text-[#0066CC]"
                fill="none"
              >
                <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2.25" />
                <circle cx="14" cy="14" r="4.5" fill="currentColor" />
              </svg>
              <span className="text-lg font-semibold tracking-[-0.02em] text-[#1D1D1F]">
                EyeMotionDetect
              </span>
            </div>

            <div className="rounded-2xl border border-black/[0.07] bg-white/80 px-3.5 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.9)]">
              <p className="truncate text-sm font-semibold text-[#1D1D1F]">{displayName}</p>
              {displayEmail && (
                <p className="truncate text-xs text-[#515154]">{displayEmail}</p>
              )}
            </div>
          </div>

          {navContent}
        </aside>

        <main className="flex-1 overflow-y-auto px-6 py-8 md:px-12 md:py-10">
          <div className="mx-auto max-w-5xl space-y-8">{children}</div>
        </main>
      </div>
      <DebugOverlay />
    </GazeProvider>
  );
}
