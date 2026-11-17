'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  calibrated?: boolean;
  createdAt: string;
}

interface AdminExam {
  id: string;
  title: string;
  description?: string;
  duration: number;
  createdAt: string;
}

interface AdminQuestion {
  id: string;
  content: string;
  difficulty: string;
}

interface GazeDataRecord {
  id: string;
  userId: string;
  userEmail: string;
  calibrationPoints: number;
  lastMaePixels: number | null;
  updatedAt: string;
}

interface GazeDataResponse {
  data: GazeDataRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function AdminDashboard() {
  const usersQuery = useQuery<AdminUser[]>({
    queryKey: ['admin-overview-users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
  });

  const examsQuery = useQuery<AdminExam[]>({
    queryKey: ['admin-overview-exams'],
    queryFn: async () => {
      const res = await api.get('/exams');
      return res.data;
    },
  });

  const questionsQuery = useQuery<AdminQuestion[]>({
    queryKey: ['admin-overview-questions'],
    queryFn: async () => {
      const res = await api.get('/questions');
      return res.data;
    },
  });

  const gazeQuery = useQuery<GazeDataResponse>({
    queryKey: ['admin-overview-gaze'],
    queryFn: async () => {
      const res = await api.get('/admin/gaze-data?page=1&limit=20');
      return res.data;
    },
  });

  const users = usersQuery.data ?? [];
  const exams = examsQuery.data ?? [];
  const questions = questionsQuery.data ?? [];
  const gazeRecords = gazeQuery.data?.data ?? [];

  const userById = new Map(users.map((u) => [u.id, u]));
  const calibratedCount = users.some((u) => typeof u.calibrated === 'boolean')
    ? users.filter((u) => u.calibrated).length
    : gazeRecords.filter((g) => g.calibrationPoints > 0).length;

  const recentCalibrations = [...gazeRecords]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  const recentExams = exams.slice(0, 5);

  const formatMetric = (loading: boolean, errored: boolean, value: number) => {
    if (loading) return '-';
    if (errored) return '-';
    return value.toLocaleString('vi-VN');
  };

  const kpis = [
    {
      label: 'Tổng số người dùng',
      loading: usersQuery.isLoading,
      value: formatMetric(usersQuery.isLoading, usersQuery.isError, users.length),
    },
    {
      label: 'Đã hiệu chuẩn',
      loading: usersQuery.isLoading && gazeQuery.isLoading,
      value: formatMetric(
        usersQuery.isLoading && gazeQuery.isLoading,
        usersQuery.isError && gazeQuery.isError,
        calibratedCount,
      ),
    },
    {
      label: 'Ngân hàng câu hỏi',
      loading: questionsQuery.isLoading,
      value: formatMetric(questionsQuery.isLoading, questionsQuery.isError, questions.length),
    },
    {
      label: 'Bài thi hiện có',
      loading: examsQuery.isLoading,
      value: formatMetric(examsQuery.isLoading, examsQuery.isError, exams.length),
    },
  ];

  return (
    <div className="space-y-8">
      {/* Minimalist Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
            Tổng quan hệ thống
          </h1>
          <p className="mt-1 text-sm text-[#515154]">
            Trạng thái hiệu chuẩn ánh mắt, ngân hàng câu hỏi và danh sách bài thi hiện hành.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/admin/questions">
            <Button
              type="button"
              variant="outline"
              className="h-10 px-4"
            >
              Ngân hàng câu hỏi
            </Button>
          </Link>
          <Link href="/admin/exams">
            <Button
              type="button"
              className="h-10 px-4"
            >
              <Plus className="size-4 mr-1.5" />
              Tạo bài thi
            </Button>
          </Link>
        </div>
      </div>

      {/* Apple HIG Grouped Metric Strip */}
      <section
        aria-label="Chỉ số hệ thống"
        className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-black/[0.07]">
          {kpis.map((item) => (
            <div key={item.label} className="px-6 py-5">
              <p className="text-xs font-medium text-[#515154]">{item.label}</p>
              {item.loading ? (
                <Skeleton className="mt-2 h-9 w-20" />
              ) : (
                <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-[#1D1D1F]">
                  {item.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Two Real Content Blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Recent Calibrated Users */}
        <section className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.07] bg-[#F5F5F7]/60">
            <h2 className="text-base font-semibold text-[#1D1D1F]">
              Hiệu chuẩn gần đây
            </h2>
            <Link
              href="/admin/gaze-data"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0066CC] hover:underline"
            >
              Xem tất cả
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {gazeQuery.isLoading ? (
            <div className="divide-y divide-black/[0.06]">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-4 w-14" />
                  </div>
                </div>
              ))}
            </div>
          ) : gazeQuery.isError ? (
            <div className="px-5 py-8 text-sm text-[#D70015]">
              Không thể tải dữ liệu hiệu chuẩn từ máy chủ.
            </div>
          ) : recentCalibrations.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[#515154]">
              Chưa có dữ liệu hiệu chuẩn nào được ghi nhận.
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {recentCalibrations.map((record) => {
                const matchedUser = userById.get(record.userId);
                const isCalibrated = record.calibrationPoints > 0;
                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[#F5F5F7]/65 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1D1D1F] truncate">
                        {matchedUser?.username || record.userEmail}
                      </p>
                      <p className="text-xs text-[#515154] truncate">{record.userEmail}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[13px] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${
                          isCalibrated
                            ? 'bg-[#ECFDF3] text-[#12783D] border-[#86EFAC]'
                            : 'bg-[#F2F2F7] text-[#3C3C43] border-black/[0.08]'
                        }`}
                      >
                        {isCalibrated ? 'Đã hiệu chuẩn' : 'Chưa hiệu chuẩn'}
                      </span>
                      <span className="w-20 text-right text-sm font-medium tabular-nums text-[#1D1D1F]">
                        {record.lastMaePixels !== null
                          ? `${record.lastMaePixels.toFixed(1)} px`
                          : '-'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Active Exams */}
        <section className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.07] bg-[#F5F5F7]/60">
            <h2 className="text-base font-semibold text-[#1D1D1F]">
              Bài thi hiện có
            </h2>
            <Link
              href="/admin/exams"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0066CC] hover:underline"
            >
              Quản lý bài thi
              <ArrowRight className="size-3.5" />
            </Link>
          </div>

          {examsQuery.isLoading ? (
            <div className="divide-y divide-black/[0.06]">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-8 w-24 rounded-[10px] shrink-0" />
                </div>
              ))}
            </div>
          ) : examsQuery.isError ? (
            <div className="px-5 py-8 text-sm text-[#D70015]">
              Không thể tải danh sách bài thi từ máy chủ.
            </div>
          ) : recentExams.length === 0 ? (
            <div className="px-5 py-8 text-sm text-[#515154]">
              Chưa có bài thi nào. Nhấn &ldquo;Tạo bài thi&rdquo; để bắt đầu.
            </div>
          ) : (
            <div className="divide-y divide-black/[0.06]">
              {recentExams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-[#F5F5F7]/65 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1D1D1F] truncate">
                      {exam.title}
                    </p>
                    <p className="text-xs text-[#515154] tabular-nums">
                      Thời lượng: {exam.duration} phút
                    </p>
                  </div>

                  <Link
                    href={`/admin/exams/${exam.id}`}
                    className="inline-flex items-center gap-1 shrink-0 rounded-[10px] border border-black/[0.10] bg-white px-3 py-1.5 text-xs font-semibold text-[#1D1D1F] shadow-[0_1px_2px_rgba(0,0,0,0.04)] hover:bg-[#F2F2F7] transition-colors"
                  >
                    Cấu hình
                    <ArrowRight className="size-3.5 text-[#515154]" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
