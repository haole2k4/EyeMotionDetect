'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function CalibrationPage() {
  const router = useRouter();
  const [weights, setWeights] = useState<{
    calibrationPoints?: number;
    lastMaePixels?: number | null;
  } | null>(null);

  useEffect(() => {
    async function loadWeights() {
      try {
        const res = await api.get('/weights/me');
        setWeights(res.data);
      } catch (error) {
        console.error('Failed to load calibration data', error);
      }
    }
    loadWeights();
  }, []);

  const calibrationPoints = weights?.calibrationPoints || 0;
  const lastMaePixels = weights?.lastMaePixels;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Hiệu chỉnh hệ thống gaze</h1>
        <p className="text-sm text-muted-foreground">
          Đồng bộ lại mô hình theo điều kiện ánh sáng và khoảng cách hiện tại để tăng độ chính xác.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Trạng thái calibration</CardTitle>
          <CardDescription>
            Dữ liệu dưới đây được lấy trực tiếp từ hồ sơ người dùng trên máy chủ.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 md:grid-cols-2">
            <div className="space-y-1 rounded-md border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Số điểm training</p>
              <p className="text-2xl font-semibold">{calibrationPoints}</p>
            </div>
            <div className="space-y-1 rounded-md border bg-card p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sai số MAE</p>
              <p className="text-2xl font-semibold">
                {typeof lastMaePixels === 'number' ? `${lastMaePixels.toFixed(2)} px` : 'Chưa đo'}
              </p>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Khi con trỏ phản hồi lệch hoặc kém ổn định, hãy chạy lại quy trình hiệu chỉnh để cập nhật dữ liệu mới.
          </p>

          <Button className="w-full md:w-auto" size="lg" onClick={() => router.push('/gaze')}>
            Bắt đầu hiệu chỉnh
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}