'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import { Plus, Edit2, Trash2, Settings } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

export interface Exam {
  id: string;
  title: string;
  description: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
}

const examSchema = z.object({
  title: z.string().min(1, 'Tên bài thi không được để trống'),
  description: z.string().optional(),
  duration: z.coerce.number().min(1, 'Thời gian làm bài phải > 0'),
});

type ExamFormData = z.infer<typeof examSchema>;

export default function ExamsPage() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [deletingExam, setDeletingExam] = useState<Exam | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ExamFormData>({
    resolver: zodResolver(examSchema),
    defaultValues: {
      title: '',
      description: '',
      duration: 60,
    },
  });

  const { data: exams, isLoading, isError } = useQuery<Exam[]>({
    queryKey: ['exams'],
    queryFn: async () => {
      const res = await api.get('/exams');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ExamFormData) => api.post('/exams', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast.success('Đã tạo bài thi mới.');
      closeDialog();
    },
    onError: () => {
      toast.error('Không thể tạo bài thi. Vui lòng thử lại.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ExamFormData) => api.patch(`/exams/${editingExam?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      toast.success('Đã cập nhật thông tin bài thi.');
      closeDialog();
    },
    onError: () => {
      toast.error('Không thể cập nhật bài thi. Vui lòng thử lại.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/exams/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      setDeletingExam(null);
      toast.success('Đã xóa bài thi.');
    },
    onError: () => {
      setDeletingExam(null);
      toast.error('Không thể xóa bài thi. Vui lòng thử lại.');
    },
  });

  const onSubmit = (data: ExamFormData) => {
    if (editingExam) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (exam: Exam) => {
    setEditingExam(exam);
    reset({
      title: exam.title,
      description: exam.description || '',
      duration: exam.duration,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingExam(null);
    reset({
      title: '',
      description: '',
      duration: 60,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
            Quản lý bài thi
          </h1>
          <p className="mt-1 text-sm text-[#515154]">
            Tạo bài thi, thiết lập thời lượng và cấu hình câu hỏi hoặc thí sinh tham dự.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          className="h-10 px-4"
        >
          <Plus className="mr-1.5 size-4" />
          Thêm bài thi
        </Button>
      </div>

      {isError ? (
        <div className="rounded-2xl border border-[#FFB8B5] bg-[#FFECEB] px-4 py-3 text-sm font-medium text-[#D70015]">
          Không thể tải danh sách bài thi từ máy chủ.
        </div>
      ) : null}

      <div className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
        <Table className="w-full table-fixed">
          <TableHeader className="bg-[#F5F5F7]/80">
            <TableRow className="border-b border-black/[0.07] hover:bg-transparent">
              <TableHead className="w-14 px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                STT
              </TableHead>
              <TableHead className="w-auto px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                Tên bài thi
              </TableHead>
              <TableHead className="w-32 px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                Thời gian
              </TableHead>
              <TableHead className="w-36 px-4 py-3 text-right text-xs font-semibold text-[#3C3C43]">
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, idx) => (
                <TableRow key={idx} className="border-b border-black/[0.06] last:border-b-0">
                  <TableCell className="px-4 py-3.5">
                    <Skeleton className="h-4 w-6" />
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-2/3" />
                      <Skeleton className="h-3.5 w-1/2" />
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Skeleton className="size-8 rounded-[10px]" />
                      <Skeleton className="size-8 rounded-[10px]" />
                      <Skeleton className="size-8 rounded-[10px]" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : exams?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-[#515154]">
                  Chưa có bài thi nào.
                </TableCell>
              </TableRow>
            ) : (
              exams?.map((exam, idx) => (
                <TableRow
                  key={exam.id}
                  className="border-b border-black/[0.06] last:border-b-0 hover:bg-[#F5F5F7]/65 transition-colors"
                >
                  <TableCell className="px-4 py-3.5 text-sm text-[#515154] tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[#1D1D1F]" title={exam.title}>
                        {exam.title}
                      </div>
                      {exam.description ? (
                        <div
                          className="mt-0.5 truncate text-sm text-[#515154]"
                          title={exam.description}
                        >
                          {exam.description}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-sm text-[#3C3C43] tabular-nums">
                    {exam.duration} phút
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Link href={`/admin/exams/${exam.id}`}>
                        <Button
                          variant="ghost"
                          size="icon"
                          type="button"
                          aria-label={`Cấu hình bài thi ${exam.title}`}
                          title="Cấu hình câu hỏi & thí sinh"
                          className="text-[#0066CC] hover:bg-[#E8F2FF] hover:text-[#0066CC]"
                        >
                          <Settings className="size-4" />
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Sửa bài thi ${exam.title}`}
                        title="Sửa bài thi"
                        onClick={() => openEditDialog(exam)}
                        className="text-[#3C3C43] hover:bg-black/[0.05] hover:text-[#1D1D1F]"
                      >
                        <Edit2 className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Xóa bài thi ${exam.title}`}
                        title="Xóa bài thi"
                        onClick={() => setDeletingExam(exam)}
                        className="text-[#D70015] hover:bg-[#FFECEB] hover:text-[#D70015]"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create / Edit Exam Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setIsDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1D1D1F]">
              {editingExam ? 'Sửa bài thi' : 'Thêm bài thi mới'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="exam-title" className="text-sm font-medium text-[#1D1D1F]">
                Tên bài thi
              </Label>
              <Input
                id="exam-title"
                {...register('title')}
                placeholder="Nhập tên bài thi..."
                className="bg-white"
              />
              {errors.title ? (
                <p className="text-sm text-[#D70015]">{errors.title.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="exam-description" className="text-sm font-medium text-[#1D1D1F]">
                Mô tả (không bắt buộc)
              </Label>
              <Input
                id="exam-description"
                {...register('description')}
                placeholder="Nhập mô tả..."
                className="bg-white"
              />
              {errors.description ? (
                <p className="text-sm text-[#D70015]">{errors.description.message}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="exam-duration" className="text-sm font-medium text-[#1D1D1F]">
                Thời gian làm bài (phút)
              </Label>
              <Input
                id="exam-duration"
                type="number"
                {...register('duration')}
                placeholder="Ví dụ: 60"
                className="bg-white tabular-nums"
              />
              {errors.duration ? (
                <p className="text-sm text-[#D70015]">{errors.duration.message}</p>
              ) : null}
            </div>

            <div className="-mx-6 -mb-6 flex justify-end gap-2.5 rounded-b-[24px] border-t border-black/[0.07] bg-[#F5F5F7]/80 px-6 py-4 backdrop-blur-md">
              <Button
                type="button"
                variant="outline"
                onClick={closeDialog}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {editingExam ? 'Cập nhật' : 'Thêm mới'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog
        open={Boolean(deletingExam)}
        onOpenChange={(open) => {
          if (!open) setDeletingExam(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1D1D1F]">
              Xóa bài thi?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#515154]">
              Bạn có chắc chắn muốn xóa bài thi{' '}
              <strong className="text-[#1D1D1F]">{deletingExam?.title}</strong>? Hành động này
              không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingExam) deleteMutation.mutate(deletingExam.id);
              }}
              disabled={deleteMutation.isPending}
              className="bg-none bg-[#D70015] text-white shadow-[0_2px_6px_rgba(215,0,21,0.28)] hover:bg-[#B80012]"
            >
              {deleteMutation.isPending ? 'Đang xóa...' : 'Xác nhận xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
