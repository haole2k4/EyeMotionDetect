'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, Users, FileQuestion, Target, LogOut } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/questions', label: 'Quản lý câu hỏi', icon: FileQuestion },
  { href: '/admin/users', label: 'Quản lý User', icon: Users },
  { href: '/admin/gaze-data', label: 'Quản lý dữ liệu mắt', icon: Target },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <motion.aside 
      initial={{ x: -250 }}
      animate={{ x: 0 }}
      className="w-64 bg-white border-r h-screen shadow-sm flex flex-col"
    >
      <div className="p-6">
        <h2 className="text-2xl font-bold tracking-tight text-blue-600">EyeMotion</h2>
        <p className="text-sm text-gray-500 font-medium">Detector Admin</p>
        {user?.username ? (
          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            @{user.username}
          </p>
        ) : null}
      </div>
      
      <Separator />

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
          
          return (
            <Link key={item.href} href={item.href} className="block relative">
              <span className={cn(
                'flex relative z-10 items-center justify-start gap-4 px-4 py-3 rounded-xl text-sm font-semibold transition-colors',
                isActive 
                  ? 'text-blue-700' 
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}>
                <item.icon className={cn('h-5 w-5', isActive ? 'text-blue-600' : 'text-gray-400')} />
                {item.label}
              </span>
              {isActive && (
                <motion.div
                  className="absolute inset-0 rounded-xl bg-blue-50 border border-blue-200 shadow-sm"
                  layoutId="activeNavIndicator"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <Separator />
      
      <div className="p-4">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={handleLogout}
        >
          <LogOut className="mr-2 h-5 w-5" />
          Đăng xuất
        </Button>
      </div>
    </motion.aside>
  );
}