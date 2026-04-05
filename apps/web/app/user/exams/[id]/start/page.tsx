'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/card';
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

  if (!exam) return <div className="p-12 text-3xl font-bold">Đang tải...</div>;

  return (
    <div className="flex h-full items-center justify-center py-10 px-4">
      <Card className="p-8 rounded-3xl shadow-xl border border-slate-100 bg-white max-w-xl w-full">
        <h1 className="text-3xl font-bold text-slate-800 text-center mb-4">{exam.title}</h1>
        <p className="text-base text-slate-600 text-center mb-8">
          {exam.description || 'Bài thi với giao diện thân thiện với Eye-Tracking. Hãy chuẩn bị sẵn sàng mắt của bạn.'}
        </p>

        <div className="space-y-4 bg-blue-50/50 p-6 rounded-2xl border border-blue-100 mb-8">
          <h2 className="text-lg font-semibold text-blue-900">Thông tin bài thi:</h2>
          <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-blue-50/50">
            <span className="text-slate-600 font-medium">Số câu hỏi</span>
            <span className="text-blue-700 font-bold">{exam.questions?.length || 0}</span>
          </div>
          <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-blue-50/50">
            <span className="text-slate-600 font-medium">Thời gian làm bài</span>
            <span className="text-blue-700 font-bold">{exam.duration ? `${exam.duration} phút` : 'Không giới hạn'}</span>
          </div>
        </div>

        <Button
          onClick={handleStart}
          disabled={loading}
          size="lg"
          className="w-full text-xl font-bold h-14 rounded-xl bg-blue-600 text-white shadow-md hover:bg-blue-700 transition-all active:scale-[0.98]"
        >
          {loading ? 'Đang chuẩn bị...' : 'BẮT ĐẦU THI'}
        </Button>
      </Card>
    </div>
  );
}