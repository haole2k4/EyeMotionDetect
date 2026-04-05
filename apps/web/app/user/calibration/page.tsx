'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function CalibrationPage() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await api.get('/users/me');
        setProfile(res.data);
      } catch (error) {
        console.error('Failed to load profile', error);
      }
    }
    loadProfile();
  }, []);

  return (
    <div className="max-w-2xl">
      <Card className="shadow-sm border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Trạng Thái Calibration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
            <h3 className="font-semibold text-slate-700">Dữ liệu từ máy chủ</h3>
            <p className="text-slate-600">
              Số điểm Training: <strong className="text-blue-600 text-lg">
                {profile?.gazeWeights?.calibrationPoints || 0}
              </strong>
            </p>
            <p className="text-slate-600">
              Sai số MAE (Mean Absolute Error): <strong className="text-emerald-600 text-lg">
                {profile?.gazeWeights?.lastMaePixels ? profile.gazeWeights.lastMaePixels.toFixed(2) + ' px' : 'Chưa đo'}
              </strong>
            </p>
          </div>

          <p className="text-sm text-slate-500">
            Nếu bạn cảm thấy chuột phản hồi không chính xác, hãy bấm nút bên dưới để tiến hành hiệu chỉnh lại hệ thống Gaze-Tracking.
          </p>

          <Button 
            className="w-full" 
            size="lg" 
            onClick={() => router.push('/gaze')}
          >
            Hiệu Chỉnh Ngay
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}