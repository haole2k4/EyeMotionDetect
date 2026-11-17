'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  FileQuestion,
  Target,
  LogOut,
  FileText,
  Menu,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const NAV_ITEMS = [
  { href: '/admin', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/admin/exams', label: 'Quản lý bài thi', icon: FileText },
  { href: '/admin/questions', label: 'Ngân hàng câu hỏi', icon: FileQuestion },
  { href: '/admin/users', label: 'Người dùng', icon: Users },
  { href: '/admin/gaze-data', label: 'Dữ liệu ánh mắt', icon: Target },
];

function BrandMark() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0 drop-shadow-[0_1px_2px_rgba(0,102,204,0.28)]"
    >
      <rect width="24" height="24" rx="6" fill="#0066CC" />
      <path
        d="M5 12C6.8 8.9 9.2 7.5 12 7.5C14.8 7.5 17.2 8.9 19 12C17.2 15.1 14.8 16.5 12 16.5C9.2 16.5 6.8 15.1 5 12Z"
        stroke="#FFFFFF"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.25" fill="#FFFFFF" />
    </svg>
  );
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  const navContent = (
    <>
      <div className="px-5 py-5 border-b border-black/[0.07]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <BrandMark />
            <span className="text-base font-semibold tracking-tight text-[#1D1D1F] truncate">
              EyeMotionDetect
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng thanh điều hướng"
            className="md:hidden inline-flex size-8 items-center justify-center rounded-full bg-[#767680]/12 text-[#3C3C43] hover:bg-[#767680]/20 hover:text-[#1D1D1F]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-[#515154]">
          <span className="font-medium text-[#3C3C43]">Quản trị viên</span>
          {user?.username ? (
            <span className="truncate text-[#515154]">@{user.username}</span>
          ) : null}
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto" aria-label="Điều hướng quản trị">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 min-h-11 px-3.5 py-2.5 rounded-xl text-sm transition-[background-color,color,box-shadow] duration-150',
                isActive
                  ? 'bg-white text-[#0066CC] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.04)]'
                  : 'text-[#3C3C43] font-medium hover:bg-black/[0.04] hover:text-[#1D1D1F]',
              )}
            >
              <item.icon
                className={cn(
                  'size-4 shrink-0',
                  isActive ? 'text-[#0066CC]' : 'text-[#515154]',
                )}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-black/[0.07]">
        <Button
          type="button"
          variant="ghost"
          className="w-full min-h-11 justify-start gap-3 px-3.5 rounded-xl text-sm font-medium text-[#D70015] hover:text-[#D70015] hover:bg-[#FFECEB]"
          onClick={handleLogout}
        >
          <LogOut className="size-4 shrink-0" />
          Đăng xuất
        </Button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile Header Bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-white/76 backdrop-blur-2xl backdrop-saturate-180 border-b border-black/[0.08] shrink-0">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <span className="text-sm font-semibold tracking-tight text-[#1D1D1F]">
            EyeMotionDetect
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Mở thanh điều hướng"
          className="inline-flex size-10 items-center justify-center rounded-xl border border-black/[0.10] bg-white/90 text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
        >
          <Menu className="size-4" />
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen ? (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/25 backdrop-blur-[6px]"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-64 max-w-[80vw] bg-white/88 backdrop-blur-2xl backdrop-saturate-180 border-r border-black/[0.08] shadow-[12px_0_32px_rgba(0,0,0,0.12)] h-dvh flex flex-col">
            {navContent}
          </aside>
        </div>
      ) : null}

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 bg-white/72 backdrop-blur-2xl backdrop-saturate-180 border-r border-black/[0.08] shadow-[inset_-1px_0_0_rgba(255,255,255,0.6)] h-dvh flex-col">
        {navContent}
      </aside>
    </>
  );
}
