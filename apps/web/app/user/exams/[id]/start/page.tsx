'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function ExamStartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [exam, setExam] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchExam() {
      try {
        const res = await api.get(`/exams/${id}`);
        setExam(res.data);
      } catch (error) {
        console.error(error);
      }
    }
    fetchExam();
  }, [id]);

  const handleStart = async () => {
    try {
      setLoading(true);
      const res = await api.post(`/exams/${id}/start`);
      const sessionId = res.data.id;
      // Navigate to the focus mode exam UI
      router.push(`/user/exams/session/${sessionId}`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (!exam) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-base font-medium text-muted-foreground">Đang tải bài thi...</p>
      </div>
    );
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-2xl">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-3xl font-semibold">{exam.title}</CardTitle>
          <CardDescription className="max-w-xl text-base">
            {exam.description || 'Bài thi với giao diện thân thiện với Eye-Tracking. Hãy chuẩn bị sẵn sàng trước khi bắt đầu.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="space-y-3 rounded-xl border bg-muted/40 p-4">
            <h2 className="text-base font-semibold">Thông tin bài thi</h2>
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                <span className="font-medium text-muted-foreground">Số câu hỏi</span>
                <span className="font-semibold">{exam.questions?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2">
                <span className="font-medium text-muted-foreground">Thời gian làm bài</span>
                <span className="font-semibold">{exam.duration ? `${exam.duration} phút` : 'Không giới hạn'}</span>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-end">
          <Button
            onClick={handleStart}
            disabled={loading}
            size="lg"
            className="h-11 w-full text-base font-semibold md:w-auto"
          >
            {loading ? 'Đang chuẩn bị...' : 'Bắt đầu thi'}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}