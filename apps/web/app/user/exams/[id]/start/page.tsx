'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface ExamDetail {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  timeLimit?: number;
  questions?: unknown[];
}

export default function ExamStartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [exam, setExam] = useState<ExamDetail | null>(null);
  const [loadingExam, setLoadingExam] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const fetchExam = useCallback(async () => {
    setLoadingExam(true);
    setError('');
    try {
      const res = await api.get(`/exams/${id}`);
      setExam(res.data);
    } catch (err) {
      console.error(err);
      setError('Không thể tải thông tin bài thi. Vui lòng quay lại hoặc thử tải lại.');
    } finally {
      setLoadingExam(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchExam();
  }, [fetchExam]);

  const handleStart = async () => {
    setError('');
    try {
      setStarting(true);
      const res = await api.post(`/exams/${id}/start`);
      const sessionId = res.data.id;
      router.push(`/user/exams/session/${sessionId}`);
    } catch (err) {
      console.error(err);
      setError('Không thể khởi tạo phiên làm bài. Vui lòng thử lại.');
    } finally {
      setStarting(false);
    }
  };

  if (loadingExam) {
    return (
      <section className="flex w-full flex-col py-4" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Đang tải thông tin bài thi...</span>
        <Card className="w-full p-0 ring-0">
          <div className="flex items-center justify-between border-b border-black/[0.07] px-6 py-4">
            <Skeleton className="h-11 w-28 rounded-xl" />
          </div>

          <CardHeader className="space-y-3 px-6 pt-6 pb-2 text-left">
            <Skeleton className="h-8 w-2/3 md:h-9" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </CardHeader>

          <CardContent className="space-y-5 px-6 py-4">
            <div className="rounded-2xl border border-black/[0.07] bg-[#F5F5F7]/80">
              <div className="border-b border-black/[0.07] px-5 py-3.5">
                <Skeleton className="h-5 w-36" />
              </div>
              <div className="divide-y divide-black/[0.07] px-5">
                <div className="flex items-center justify-between py-4">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <div className="flex items-center justify-between py-4">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-6 w-20" />
                </div>
              </div>
            </div>
          </CardContent>

          <CardFooter className="justify-end px-6 py-5">
            <Skeleton className="h-12 w-full rounded-[14px] md:w-40" />
          </CardFooter>
        </Card>
      </section>
    );
  }

  if (!exam) {
    return (
      <section className="w-full py-6">
        <div
          role="alert"
          className="space-y-4 rounded-[20px] border border-[#FFB8B5] bg-[#FFECEB] p-6 text-[#D70015] shadow-[0_2px_10px_rgba(0,0,0,0.04)]"
        >
          <p className="text-base font-medium">
            {error || 'Không tìm thấy bài thi được yêu cầu.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/user/dashboard">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 px-4 text-base font-medium"
              >
                <ArrowLeft className="mr-2 size-4" aria-hidden="true" />
                Quay lại bảng thi
              </Button>
            </Link>
            <Button
              type="button"
              onClick={() => void fetchExam()}
              className="min-h-11 px-5 text-base font-semibold"
            >
              Thử lại
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const durationMinutes = exam.duration ?? exam.timeLimit;
  const questionCount = exam.questions?.length ?? 0;

  return (
    <section className="flex w-full flex-col py-4">
      <Card className="w-full p-0 ring-0">
        <div className="flex items-center justify-between border-b border-black/[0.07] px-6 py-4">
          <Link
            href="/user/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/[0.10] bg-white/90 px-4 py-2 text-base font-medium text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors duration-150 hover:bg-[#F2F2F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC]"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            <span>Quay lại</span>
          </Link>
        </div>

        <CardHeader className="space-y-2 px-6 pt-6 pb-2 text-left">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F] md:text-3xl">
            {exam.title}
          </h1>
          <CardDescription className="text-base leading-relaxed text-[#3C3C43]">
            {exam.description ||
              'Bài thi với giao diện tối ưu cho điều khiển bằng ánh mắt. Hãy chuẩn bị tư thế thoải mái trước khi bắt đầu.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 px-6 py-4">
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-[#FFB8B5] bg-[#FFECEB] px-4 py-3 text-sm font-medium text-[#D70015]"
            >
              {error}
            </div>
          )}

          <div className="rounded-2xl border border-black/[0.07] bg-[#F5F5F7]/80">
            <div className="border-b border-black/[0.07] px-5 py-3.5">
              <h2 className="text-base font-semibold text-[#1D1D1F]">Thông tin bài thi</h2>
            </div>
            <div className="divide-y divide-black/[0.07] px-5">
              <div className="flex items-center justify-between py-4">
                <span className="text-base text-[#3C3C43]">Số câu hỏi</span>
                <span className="text-lg font-semibold tabular-nums text-[#1D1D1F]">
                  {questionCount} câu
                </span>
              </div>
              <div className="flex items-center justify-between py-4">
                <span className="text-base text-[#3C3C43]">Thời gian làm bài</span>
                <span className="text-lg font-semibold tabular-nums text-[#1D1D1F]">
                  {durationMinutes ? `${durationMinutes} phút` : 'Không giới hạn'}
                </span>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-end px-6 py-5">
          <Button
            type="button"
            size="lg"
            onClick={handleStart}
            disabled={starting}
            className="min-h-12 w-full rounded-[14px] px-8 text-base font-semibold md:w-auto"
          >
            {starting ? 'Đang chuẩn bị phòng thi...' : 'Bắt đầu thi'}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
