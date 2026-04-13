'use client';

import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { LayoutDashboard, Users, FileQuestion, Target } from 'lucide-react';

export default function AdminDashboard() {
  const stats = [
    { title: 'Tổng số người dùng', value: '24', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Đã hiệu chuẩn', value: '18', icon: Target, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { title: 'Ngân hàng câu hỏi', value: '142', icon: FileQuestion, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { title: 'Phiên kiểm tra', value: '56', icon: LayoutDashboard, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-8"
    >
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Tổng quan hệ thống</h1>
        <p className="text-muted-foreground font-medium">Cập nhật hôm nay</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
          >
            <Card className="rounded-2xl border border-border shadow-sm overflow-hidden bg-card">
              <CardContent className="p-6">
                <div className="flex items-center space-x-4">
                  <div className={`p-4 rounded-xl ${stat.bg} ${stat.color}`}>
                    <stat.icon className="w-8 h-8" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground">{stat.title}</p>
                    <h3 className="text-3xl font-bold text-foreground mt-1">{stat.value}</h3>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Card className="rounded-2xl border border-border shadow-sm bg-card overflow-hidden p-8 mt-8">
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-foreground">Chào mừng đến với Control Panel</h2>
          <p className="text-muted-foreground mt-2">Sử dụng thanh điều hướng bên trái để quản lý dữ liệu.</p>
        </div>
      </Card>
    </motion.div>
  );
}