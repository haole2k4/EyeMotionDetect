'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GAZE_WEIGHTS_UPDATED_EVENT } from '@/lib/gaze/weights-sync';
import { useAuthStore } from '@/store/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function CalibrationPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const userKey = user?.id ?? user?.email ?? 'anon';

  const { data: weights, isLoading, isError, refetch } = useQuery({
    queryKey: ['calibration-weights-me', userKey],
    queryFn: async () => {
      const res = await api.get('/weights/me');
      return res.data as {
        calibrationPoints?: number;
        lastMaePixels?: number | null;
      };
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    const refresh = () => {
      void refetch();
    };

    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    window.addEventListener(GAZE_WEIGHTS_UPDATED_EVENT, refresh as EventListener);

    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener(GAZE_WEIGHTS_UPDATED_EVENT, refresh as EventListener);
    };
  }, [refetch]);

  const calibrationPoints = weights?.calibrationPoints ?? 0;
  const lastMaePixels = weights?.lastMaePixels;

  return (
    <section className="w-full space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
          Hiệu chỉnh hệ thống mắt
        </h1>
        <p className="text-base text-[#3C3C43]">
          Đồng bộ lại mô hình theo điều kiện ánh sáng và khoảng cách ngồi hiện tại để tăng độ chính xác.
        </p>
      </header>

      <Card className="p-0 ring-0">
        <CardHeader className="border-b border-black/[0.07] bg-[#F5F5F7]/50 px-6 py-5">
          <CardTitle className="text-lg font-semibold text-[#1D1D1F]">
            Trạng thái hiệu chuẩn
          </CardTitle>
          <CardDescription className="text-sm text-[#3C3C43]">
            Dữ liệu dưới đây được lấy trực tiếp từ hồ sơ hiệu chuẩn trên máy chủ.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          {isError && (
            <div
              role="alert"
              className="flex flex-col justify-between gap-3 rounded-xl border border-[#FFB8B5] bg-[#FFECEB] px-4 py-3 text-sm font-medium text-[#D70015] sm:flex-row sm:items-center"
            >
              <span>Không thể tải dữ liệu hiệu chuẩn từ máy chủ.</span>
              <Button
                type="button"
                variant="outline"
                onClick={() => void refetch()}
                className="min-h-10 border-[#FFB8B5] bg-white text-[#D70015] hover:bg-[#FFDAD8]"
              >
                Tải lại
              </Button>
            </div>
          )}

          <div
            aria-busy={isLoading}
            className="grid grid-cols-1 divide-y divide-black/[0.07] rounded-2xl border border-black/[0.07] bg-[#F5F5F7]/80 md:grid-cols-2 md:divide-x md:divide-y-0"
          >
            <div className="space-y-2 p-6">
              <p className="text-sm font-medium text-[#3C3C43]">Số điểm huấn luyện</p>
              {isLoading ? (
                <div role="status" className="pt-0.5">
                  <Skeleton className="h-9 w-24" />
                  <span className="sr-only">Đang tải số điểm huấn luyện...</span>
                </div>
              ) : (
                <p className="text-3xl font-semibold tabular-nums text-[#1D1D1F]">
                  {calibrationPoints}
                </p>
              )}
            </div>

            <div className="space-y-2 p-6">
              <p className="text-sm font-medium text-[#3C3C43]">Sai số MAE</p>
              {isLoading ? (
                <div role="status" className="pt-0.5">
                  <Skeleton className="h-9 w-32" />
                  <span className="sr-only">Đang tải sai số MAE...</span>
                </div>
              ) : (
                <p className="text-3xl font-semibold tabular-nums text-[#1D1D1F]">
                  {typeof lastMaePixels === 'number' ? (
                    <>
                      {lastMaePixels.toFixed(2)}{' '}
                      <span className="text-base font-normal text-[#515154]">px</span>
                    </>
                  ) : (
                    'Chưa đo'
                  )}
                </p>
              )}
            </div>
          </div>

          <p className="text-base leading-relaxed text-[#3C3C43]">
            Khi con trỏ phản hồi lệch hoặc kém ổn định, hãy chạy lại quy trình hiệu chỉnh để cập nhật dữ liệu mới.
          </p>

          <Button
            type="button"
            size="lg"
            onClick={() => router.push('/gaze')}
            className="min-h-12 w-full rounded-[14px] px-6 text-base font-semibold md:w-auto"
          >
            Bắt đầu hiệu chỉnh
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
