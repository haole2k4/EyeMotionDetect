'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';

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
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-64 bg-white border-r px-4 py-8 flex flex-col h-full shadow-sm">
        <h1 className="text-2xl font-bold mb-2 text-slate-800 px-2">{user?.username || 'Học Viên'}</h1>
        <p className="text-sm px-2 text-slate-500 mb-8">{user?.email || ''}</p>
        <nav className="flex-1 space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                className={cn(
                  'block px-4 py-3 rounded-xl text-sm font-medium transition-all',
                  isActive
                    ? 'bg-slate-100 text-blue-700 shadow-inner'
                    : 'text-slate-600 hover:bg-slate-50 shadow-sm hover:shadow-md'
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
          className="w-full mt-auto px-4 py-3 bg-red-50 rounded-xl text-red-600 font-medium text-sm transition-all text-left shadow-sm hover:shadow-md"
        >
          Đăng xuất
        </button>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50 p-8">
        <div className="mx-auto max-w-5xl">
          {children}
        </div>
      </main>
    </div>
  );
}