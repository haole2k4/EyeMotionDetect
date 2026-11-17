'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Search } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

export interface Question {
  id: string;
  content: string;
  options: string[];
  correctAnswer: string;
  difficulty: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  createdAt: string;
}

interface ExamDetail {
  id: string;
  title: string;
  duration: number;
  questions?: Question[];
  assignedUsers?: User[];
}

type DifficultyFilter = 'ALL' | 'EASY' | 'MEDIUM' | 'HARD';

const DIFFICULTY_FILTERS: { value: DifficultyFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'EASY', label: 'Dễ' },
  { value: 'MEDIUM', label: 'Trung bình' },
  { value: 'HARD', label: 'Khó' },
];

function getDifficultyBadge(difficulty: string) {
  if (difficulty === 'EASY') {
    return {
      label: 'Dễ',
      className: 'bg-[#ECFDF3] text-[#12783D] border-[#86EFAC] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
    };
  }
  if (difficulty === 'MEDIUM') {
    return {
      label: 'Trung bình',
      className: 'bg-[#FFF8EB] text-[#9A4600] border-[#FCD34D] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
    };
  }
  return {
    label: 'Khó',
    className: 'bg-[#FFECEB] text-[#D70015] border-[#FFB8B5] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]',
  };
}

export default function ExamDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'questions' | 'users'>('questions');
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [questionSearch, setQuestionSearch] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>('ALL');
  const [userSearch, setUserSearch] = useState('');

  const { data: exam, isLoading: isLoadingExam } = useQuery<ExamDetail>({
    queryKey: ['exams', id],
    queryFn: async () => {
      const res = await api.get(`/exams/${id}`);
      return res.data;
    },
  });

  const { data: allQuestions, isLoading: isLoadingAllQuestions } = useQuery<Question[]>({
    queryKey: ['questions'],
    queryFn: async () => {
      const res = await api.get('/questions');
      return res.data;
    },
  });

  const { data: allUsers, isLoading: isLoadingAllUsers } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
  });

  const assignQuestionsMutation = useMutation({
    mutationFn: (questionIds: string[]) => api.post(`/exams/${id}/questions`, { questionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
      setIsQuestionModalOpen(false);
      toast.success('Đã lưu danh sách câu hỏi cho bài thi.');
    },
    onError: () => {
      toast.error('Không thể lưu danh sách câu hỏi.');
    },
  });

  const assignUsersMutation = useMutation({
    mutationFn: (userIds: string[]) => api.post(`/exams/${id}/assign`, { userIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
      setIsUserModalOpen(false);
      toast.success('Đã cập nhật danh sách thí sinh dự thi.');
    },
    onError: () => {
      toast.error('Không thể cập nhật danh sách thí sinh.');
    },
  });

  const openQuestionModal = () => {
    const currentIds = (exam?.questions || []).map((q) => q.id);
    setSelectedQuestionIds(new Set(currentIds));
    setQuestionSearch('');
    setDifficultyFilter('ALL');
    setIsQuestionModalOpen(true);
  };

  const openUserModal = () => {
    const currentIds = (exam?.assignedUsers || []).map((u) => u.id);
    setSelectedUserIds(new Set(currentIds));
    setUserSearch('');
    setIsUserModalOpen(true);
  };

  const handleToggleQuestion = (questionId: string) => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  };

  const handleToggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const filteredQuestions = useMemo(() => {
    const items = allQuestions ?? [];
    const keyword = questionSearch.trim().toLowerCase();

    return items.filter((q) => {
      const matchesDifficulty =
        difficultyFilter === 'ALL' || q.difficulty === difficultyFilter;
      if (!matchesDifficulty) return false;
      if (!keyword) return true;
      return (
        q.content.toLowerCase().includes(keyword) ||
        q.options.some((opt) => opt.toLowerCase().includes(keyword))
      );
    });
  }, [allQuestions, questionSearch, difficultyFilter]);

  const eligibleUsers = useMemo(
    () => (allUsers ?? []).filter((u) => u.role !== 'admin'),
    [allUsers],
  );

  const filteredUsers = useMemo(() => {
    const keyword = userSearch.trim().toLowerCase();
    if (!keyword) return eligibleUsers;
    return eligibleUsers.filter(
      (u) =>
        u.username.toLowerCase().includes(keyword) ||
        u.email.toLowerCase().includes(keyword),
    );
  }, [eligibleUsers, userSearch]);

  const handleSelectAllFilteredQuestions = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      filteredQuestions.forEach((q) => next.add(q.id));
      return next;
    });
  };

  const handleClearFilteredQuestions = () => {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev);
      filteredQuestions.forEach((q) => next.delete(q.id));
      return next;
    });
  };

  const handleSelectAllFilteredUsers = () => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const handleClearFilteredUsers = () => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      filteredUsers.forEach((u) => next.delete(u.id));
      return next;
    });
  };

  if (isLoadingExam) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-xl shrink-0" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-44" />
          </div>
        </div>

        <div className="flex items-center justify-between border-b border-black/[0.08] pb-3">
          <div className="flex items-center gap-6">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-36" />
          </div>
          <Skeleton className="h-10 w-52 rounded-xl" />
        </div>

        <div className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <div className="divide-y divide-black/[0.06]">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="flex items-center justify-between gap-4 px-4 py-4">
                <Skeleton className="h-4 w-6 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!exam) {
    return <div className="py-8 text-sm font-medium text-[#D70015]">Không tìm thấy bài thi.</div>;
  }

  const questionCount = exam.questions?.length ?? 0;
  const assignedUserCount = exam.assignedUsers?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Quay lại danh sách bài thi"
          onClick={() => router.push('/admin/exams')}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F] truncate">
            Cấu hình: {exam.title}
          </h1>
          <p className="mt-0.5 text-sm text-[#515154] tabular-nums">
            Thời gian làm bài: {exam.duration} phút
          </p>
        </div>
      </div>

      {/* Unified Toolbar: Tabs (left) + Primary Action Button (right) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-black/[0.08]">
        <div className="flex items-center gap-6" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'questions'}
            onClick={() => setActiveTab('questions')}
            className={`-mb-px border-b-2 pb-3 text-sm transition-colors tabular-nums ${
              activeTab === 'questions'
                ? 'border-[#0066CC] font-semibold text-[#1D1D1F]'
                : 'border-transparent font-medium text-[#515154] hover:text-[#1D1D1F]'
            }`}
          >
            Câu hỏi ({questionCount})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
            className={`-mb-px border-b-2 pb-3 text-sm transition-colors tabular-nums ${
              activeTab === 'users'
                ? 'border-[#0066CC] font-semibold text-[#1D1D1F]'
                : 'border-transparent font-medium text-[#515154] hover:text-[#1D1D1F]'
            }`}
          >
            Phân quyền thí sinh ({assignedUserCount})
          </button>
        </div>

        <div className="pb-2.5 shrink-0">
          {activeTab === 'questions' ? (
            <Button
              type="button"
              onClick={openQuestionModal}
              className="h-10 px-4"
            >
              Chỉnh sửa câu hỏi trong đề
            </Button>
          ) : (
            <Button
              type="button"
              onClick={openUserModal}
              className="h-10 px-4"
            >
              Chỉ định thí sinh
            </Button>
          )}
        </div>
      </div>

      {activeTab === 'questions' ? (
        <div className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <Table className="w-full table-fixed">
            <TableHeader className="bg-[#F5F5F7]/80">
              <TableRow className="border-b border-black/[0.07] hover:bg-transparent">
                <TableHead className="w-14 px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                  STT
                </TableHead>
                <TableHead className="w-auto px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                  Nội dung câu hỏi
                </TableHead>
                <TableHead className="w-32 px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                  Độ khó
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questionCount === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-[#515154]">
                    Chưa có câu hỏi nào trong đề thi này.
                  </TableCell>
                </TableRow>
              ) : (
                exam.questions?.map((q, idx) => {
                  const badge = getDifficultyBadge(q.difficulty);
                  return (
                    <TableRow
                      key={q.id}
                      className="border-b border-black/[0.06] last:border-b-0 hover:bg-[#F5F5F7]/65 transition-colors"
                    >
                      <TableCell className="px-4 py-3.5 text-sm text-[#515154] tabular-nums">
                        {idx + 1}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-[#1D1D1F]" title={q.content}>
                            {q.content}
                          </div>
                          <div
                            className="mt-1 truncate text-sm text-[#515154]"
                            title={q.options.join(' | ')}
                          >
                            {q.options.join(' | ')}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center justify-center min-w-[84px] rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                        >
                          {badge.label}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {activeTab === 'users' ? (
        <div className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
          <Table className="w-full table-fixed">
            <TableHeader className="bg-[#F5F5F7]/80">
              <TableRow className="border-b border-black/[0.07] hover:bg-transparent">
                <TableHead className="w-14 px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                  STT
                </TableHead>
                <TableHead className="w-[34%] px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                  Tên đăng nhập
                </TableHead>
                <TableHead className="w-auto px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                  Email
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignedUserCount === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="py-10 text-center text-sm text-[#515154]">
                    Chưa có người dùng nào được chỉ định thi.
                  </TableCell>
                </TableRow>
              ) : (
                exam.assignedUsers?.map((u, idx) => (
                  <TableRow
                    key={u.id}
                    className="border-b border-black/[0.06] last:border-b-0 hover:bg-[#F5F5F7]/65 transition-colors"
                  >
                    <TableCell className="px-4 py-3.5 text-sm text-[#515154] tabular-nums">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <div className="truncate font-medium text-[#1D1D1F]" title={u.username}>
                        {u.username}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3.5">
                      <div className="truncate text-sm text-[#3C3C43]" title={u.email}>
                        {u.email}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {/* Select Questions Modal */}
      <Dialog open={isQuestionModalOpen} onOpenChange={setIsQuestionModalOpen}>
        <DialogContent className="sm:max-w-3xl w-[94vw] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1D1D1F]">
              Chọn câu hỏi cho bài thi
            </DialogTitle>
          </DialogHeader>

          {/* Modal Toolbar: Search + Segmented Difficulty Filter + Selection Counter */}
          <div className="space-y-3 pt-1">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#515154]" />
                <Input
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  placeholder="Tìm kiếm câu hỏi theo nội dung hoặc đáp án..."
                  className="h-10 pl-9"
                />
              </div>

              <div className="inline-flex items-center gap-1 rounded-xl bg-[#767680]/12 p-1 shrink-0">
                {DIFFICULTY_FILTERS.map((filter) => {
                  const active = difficultyFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setDifficultyFilter(filter.value)}
                      className={`rounded-[9px] px-2.5 py-1 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 ${
                        active
                          ? 'bg-white text-[#1D1D1F] shadow-[0_1px_3px_rgba(0,0,0,0.08)]'
                          : 'text-[#515154] hover:text-[#1D1D1F]'
                      }`}
                    >
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[#515154] tabular-nums">
                Đã chọn{' '}
                <strong className="text-[#1D1D1F]">{selectedQuestionIds.size}</strong> /{' '}
                {allQuestions?.length ?? 0} câu hỏi
                {filteredQuestions.length !== (allQuestions?.length ?? 0)
                  ? ` (đang hiện ${filteredQuestions.length})`
                  : ''}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={filteredQuestions.length === 0}
                  onClick={handleSelectAllFilteredQuestions}
                >
                  Chọn tất cả
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={filteredQuestions.length === 0}
                  onClick={handleClearFilteredQuestions}
                  className="text-[#515154] hover:text-[#1D1D1F]"
                >
                  Bỏ chọn
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto overflow-x-hidden flex-1 rounded-2xl border border-black/[0.08] bg-white/80 divide-y divide-black/[0.06]">
            {isLoadingAllQuestions ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <Skeleton className="size-4 rounded-[5px] shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-3/5" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full shrink-0" />
                </div>
              ))
            ) : filteredQuestions.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#515154]">
                Không tìm thấy câu hỏi phù hợp.
              </div>
            ) : (
              filteredQuestions.map((q) => {
                const badge = getDifficultyBadge(q.difficulty);
                const checked = selectedQuestionIds.has(q.id);
                return (
                  <label
                    key={q.id}
                    className={`flex items-center justify-between gap-4 px-4 py-3.5 cursor-pointer transition-colors ${
                      checked ? 'bg-[#E8F2FF]/55 hover:bg-[#E8F2FF]/80' : 'hover:bg-[#F5F5F7]/80'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        aria-label={`Chọn câu hỏi ${q.content}`}
                        className="size-4 shrink-0 accent-[#0066CC] cursor-pointer"
                        checked={checked}
                        onChange={() => handleToggleQuestion(q.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[#1D1D1F]" title={q.content}>
                          {q.content}
                        </div>
                        <div
                          className="mt-0.5 truncate text-xs text-[#515154]"
                          title={`${q.options.join(' · ')} (Đúng: ${q.correctAnswer})`}
                        >
                          {q.options.join(' · ')} · Đúng:{' '}
                          <span className="font-semibold text-[#3C3C43]">{q.correctAnswer}</span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 inline-flex items-center justify-center min-w-[80px] rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsQuestionModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => assignQuestionsMutation.mutate(Array.from(selectedQuestionIds))}
              disabled={assignQuestionsMutation.isPending}
            >
              <Save className="size-4 mr-2" />
              Lưu danh sách câu hỏi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Users Modal */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="sm:max-w-2xl w-[94vw] max-h-[88vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1D1D1F]">
              Chỉ định thí sinh cho bài thi
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 pt-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#515154]" />
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Tìm thí sinh theo tên đăng nhập hoặc email..."
                className="h-10 pl-9"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-[#515154] tabular-nums">
                Đã chọn <strong className="text-[#1D1D1F]">{selectedUserIds.size}</strong> /{' '}
                {eligibleUsers.length} thí sinh
                {filteredUsers.length !== eligibleUsers.length
                  ? ` (đang hiện ${filteredUsers.length})`
                  : ''}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={filteredUsers.length === 0}
                  onClick={handleSelectAllFilteredUsers}
                >
                  Chọn tất cả
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  disabled={filteredUsers.length === 0}
                  onClick={handleClearFilteredUsers}
                  className="text-[#515154] hover:text-[#1D1D1F]"
                >
                  Bỏ chọn
                </Button>
              </div>
            </div>
          </div>

          <div className="overflow-y-auto overflow-x-hidden flex-1 rounded-2xl border border-black/[0.08] bg-white/80 divide-y divide-black/[0.06]">
            {isLoadingAllUsers ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <Skeleton className="size-4 rounded-[5px] shrink-0" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                </div>
              ))
            ) : filteredUsers.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#515154]">
                Không tìm thấy thí sinh phù hợp.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const checked = selectedUserIds.has(u.id);
                return (
                  <label
                    key={u.id}
                    className={`flex items-center justify-between gap-4 px-4 py-3.5 cursor-pointer transition-colors ${
                      checked ? 'bg-[#E8F2FF]/55 hover:bg-[#E8F2FF]/80' : 'hover:bg-[#F5F5F7]/80'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        aria-label={`Chọn thí sinh ${u.username}`}
                        className="size-4 shrink-0 accent-[#0066CC] cursor-pointer"
                        checked={checked}
                        onChange={() => handleToggleUser(u.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[#1D1D1F]" title={u.username}>
                          {u.username}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-[#515154]" title={u.email}>
                          {u.email}
                        </div>
                      </div>
                    </div>

                    <span className="shrink-0 inline-flex items-center rounded-full border border-black/[0.08] bg-[#F2F2F7] px-2.5 py-0.5 text-xs font-medium text-[#3C3C43]">
                      Học viên
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsUserModalOpen(false)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              onClick={() => assignUsersMutation.mutate(Array.from(selectedUserIds))}
              disabled={assignUsersMutation.isPending}
            >
              <Save className="size-4 mr-2" />
              Lưu danh sách thí sinh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
