'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { useAuthStore } from '@/store/auth';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const userStr = useAuthStore((state) => state.user);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (!token || !userStr || userStr.role !== 'admin') {
      router.push('/login');
    }
  }, [token, userStr, router]);

  if (!mounted || !token || !userStr || userStr.role !== 'admin') {
    return (
      <div className="min-h-dvh w-full bg-[#F5F5F7] text-[#3C3C43] flex items-center justify-center text-sm font-medium">
        Đang xác thực phiên quản trị...
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row min-h-dvh md:h-dvh md:overflow-hidden bg-transparent text-[#1D1D1F]">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
