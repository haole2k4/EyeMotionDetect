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
    return <div className="h-screen w-screen bg-gray-50 flex items-center justify-center">Đang tải...</div>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-6xl">
          {children}
        </div>
      </main>
    </div>
  );
}