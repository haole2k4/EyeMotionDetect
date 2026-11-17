'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface Exam {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  timeLimit?: number;
}

interface ExamSession {
  id: string;
  exam: Exam;
  status: 'IN_PROGRESS' | 'COMPLETED';
  score?: number;
  startTime: string;
  endTime?: string;
}

export default function UserDashboard() {
  const [assignedExams, setAssignedExams] = useState<Exam[]>([]);
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [examsRes, sessionsRes] = await Promise.all([
        api.get('/exams/user/assigned'),
        api.get('/exams/sessions/my'),
      ]);
      setAssignedExams(Array.isArray(examsRes.data) ? examsRes.data : []);
      setSessions(Array.isArray(sessionsRes.data) ? sessionsRes.data : []);
    } catch (err) {
      console.error('Failed to fetch user data', err);
      setError('Không thể tải danh sách bài thi và lịch sử làm bài. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const completedSessions = sessions.filter((session) => session.status === 'COMPLETED');

  return (
    <div className="space-y-10">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
          Bảng thi
        </h1>
        <p className="text-base text-[#3C3C43]">
          Chọn bài thi được giao để bắt đầu làm bài hoặc xem lại kết quả các phiên thi trước.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="flex flex-col justify-between gap-4 rounded-[20px] border border-[#FFB8B5] bg-[#FFECEB] p-5 text-[#D70015] shadow-[0_2px_10px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center"
        >
          <p className="text-sm font-medium">{error}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void fetchData()}
            className="min-h-11 shrink-0 border-[#FFB8B5] bg-white px-4 text-sm font-semibold text-[#D70015] hover:bg-[#FFDAD8]"
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* Phần 1: Bài thi được giao */}
      <section aria-labelledby="assigned-exams-heading" className="space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="assigned-exams-heading" className="text-xl font-semibold text-[#1D1D1F]">
            Bài thi được giao
          </h2>
          {loading ? (
            <Skeleton className="h-5 w-16" />
          ) : (
            <span className="text-sm font-medium tabular-nums text-[#515154]">
              {assignedExams.length} bài thi
            </span>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            aria-busy="true"
            className="grid grid-cols-1 gap-6 md:grid-cols-2"
          >
            <span className="sr-only">Đang tải danh sách bài thi...</span>
            {[0, 1].map((item) => (
              <div
                key={item}
                className="flex flex-col justify-between gap-6 rounded-[20px] border border-black/[0.08] bg-white/95 p-6 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <div className="space-y-2.5">
                    <Skeleton className="h-7 w-3/4" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                </div>
                <Skeleton className="h-12 w-full rounded-[14px]" />
              </div>
            ))}
          </div>
        ) : assignedExams.length === 0 ? (
          <div className="rounded-[20px] border border-black/[0.08] bg-white/95 p-6 text-base text-[#515154] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
            Bạn chưa được giao bài thi nào.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {assignedExams.map((exam) => {
              const inProgressSession = sessions.find(
                (s) => s.exam?.id === exam.id && s.status === 'IN_PROGRESS',
              );
              const durationMinutes = exam.timeLimit ?? exam.duration;

              return (
                <article
                  key={exam.id}
                  className="flex flex-col justify-between gap-6 rounded-[20px] border border-black/[0.08] bg-white/95 p-6 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)] transition-[border-color,box-shadow] duration-150 hover:border-[#0066CC]/45 hover:shadow-[0_12px_28px_-6px_rgba(0,102,204,0.12),0_4px_12px_rgba(0,0,0,0.04)]"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span
                        className={
                          inProgressSession
                            ? 'inline-flex items-center rounded-full border border-[#FCD34D] bg-[#FFF8EB] px-3 py-1 text-xs font-semibold text-[#9A4600] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'
                            : 'inline-flex items-center rounded-full border border-[#86EFAC] bg-[#ECFDF3] px-3 py-1 text-xs font-semibold text-[#12783D] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]'
                        }
                      >
                        {inProgressSession ? 'Đang làm dở' : 'Sẵn sàng'}
                      </span>

                      <span className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-[#3C3C43]">
                        <Clock className="size-4 text-[#515154]" aria-hidden="true" />
                        {durationMinutes ? `${durationMinutes} phút` : 'Không giới hạn'}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-xl font-semibold leading-snug text-[#1D1D1F]">
                        {exam.title}
                      </h3>
                      {exam.description && (
                        <p className="line-clamp-2 text-sm leading-relaxed text-[#515154]">
                          {exam.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <Link href={`/user/exams/${exam.id}/start`} className="block w-full">
                    <Button size="lg" className="min-h-12 w-full rounded-[14px] text-base font-semibold">
                      {inProgressSession ? 'Tiếp tục làm bài' : 'Bắt đầu ngay'}
                    </Button>
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Phần 2: Lịch sử làm bài */}
      <section aria-labelledby="exam-history-heading" className="space-y-5">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="exam-history-heading" className="text-xl font-semibold text-[#1D1D1F]">
            Lịch sử làm bài
          </h2>
          {loading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <span className="text-sm font-medium tabular-nums text-[#515154]">
              {completedSessions.length} lượt hoàn thành
            </span>
          )}
        </div>

        {loading ? (
          <div
            role="status"
            aria-busy="true"
            className="overflow-hidden rounded-[20px] border border-black/[0.08] bg-white/95 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]"
          >
            <span className="sr-only">Đang tải lịch sử làm bài...</span>
            <table className="table-fixed w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.07] bg-[#F5F5F7]/80">
                  <th className="w-[52%] px-4 py-4 text-sm font-semibold text-[#3C3C43] sm:w-[58%] sm:px-6">
                    Bài thi
                  </th>
                  <th className="w-[26%] px-4 py-4 text-sm font-semibold text-[#3C3C43] sm:w-[22%] sm:px-6">
                    Ngày thi
                  </th>
                  <th className="w-[22%] px-4 py-4 text-right text-sm font-semibold text-[#3C3C43] sm:w-[20%] sm:px-6">
                    Điểm số
                  </th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((row) => (
                  <tr key={row} className="border-b border-black/[0.06] last:border-b-0">
                    <td className="px-4 py-4 sm:px-6">
                      <Skeleton className="h-5 w-3/4" />
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-4 sm:px-6">
                      <Skeleton className="ml-auto h-7 w-14" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : completedSessions.length === 0 ? (
          <div className="rounded-[20px] border border-black/[0.08] bg-white/95 p-6 text-base text-[#515154] shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
            Chưa có lịch sử làm bài.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[20px] border border-black/[0.08] bg-white/95 shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
            <table className="table-fixed w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.07] bg-[#F5F5F7]/80">
                  <th className="w-[52%] px-4 py-4 text-sm font-semibold text-[#3C3C43] sm:w-[58%] sm:px-6">
                    Bài thi
                  </th>
                  <th className="w-[26%] px-4 py-4 text-sm font-semibold text-[#3C3C43] sm:w-[22%] sm:px-6">
                    Ngày thi
                  </th>
                  <th className="w-[22%] px-4 py-4 text-right text-sm font-semibold text-[#3C3C43] sm:w-[20%] sm:px-6">
                    Điểm số
                  </th>
                </tr>
              </thead>
              <tbody>
                {completedSessions.map((session) => {
                  const examTitle = session.exam?.title || 'Bài thi';
                  return (
                    <tr
                      key={session.id}
                      className="border-b border-black/[0.06] last:border-b-0 hover:bg-[#F5F5F7]/65 transition-colors"
                    >
                      <td className="px-4 py-4 sm:px-6">
                        <div
                          className="truncate text-base font-semibold text-[#1D1D1F]"
                          title={examTitle}
                        >
                          {examTitle}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm font-medium tabular-nums text-[#3C3C43] sm:px-6">
                        {new Date(session.startTime).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-right text-xl font-semibold tabular-nums text-[#1D1D1F] sm:px-6 sm:text-2xl">
                        {typeof session.score === 'number'
                          ? `${session.score.toFixed(1)}%`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
