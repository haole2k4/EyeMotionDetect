'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { api } from '@/lib/api';
import Link from 'next/link';

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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2, Settings } from 'lucide-react';

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

  const { data: exams, isLoading } = useQuery<Exam[]>({
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
      closeDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ExamFormData) => api.patch(`/exams/${editingExam?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams'] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/exams/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exams'] }),
  });

  const onSubmit = (data: ExamFormData) => {
    if (editingExam) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (e: Exam) => {
    setEditingExam(e);
    reset({
      title: e.title,
      description: e.description || '',
      duration: e.duration,
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

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa bài thi này?')) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) return <div className="p-8 text-gray-500">Đang tải danh sách bài thi...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Quản lý bài thi</h1>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Thêm bài thi
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) closeDialog();
          else setIsDialogOpen(true);
        }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingExam ? 'Sửa bài thi' : 'Thêm bài thi mới'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Tên bài thi</Label>
                <Input {...register('title')} placeholder="Nhập tên bài thi..." />
                {errors.title && <p className="text-red-500 text-sm">{errors.title.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Mô tả (không bắt buộc)</Label>
                <Input {...register('description')} placeholder="Nhập mô tả..." />
                {errors.description && <p className="text-red-500 text-sm">{errors.description.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Thời gian làm bài (phút)</Label>
                <Input type="number" {...register('duration')} placeholder="Ví dụ: 60" />
                {errors.duration && <p className="text-red-500 text-sm">{errors.duration.message}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={closeDialog}>Hủy</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingExam ? 'Cập nhật' : 'Thêm mới'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">STT</TableHead>
              <TableHead>Tên bài thi</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead className="w-48 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exams?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Chưa có bài thi nào.
                </TableCell>
              </TableRow>
            ) : (
              exams?.map((e, idx) => (
                <TableRow key={e.id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{e.title}</div>
                    {e.description && <div className="text-sm text-muted-foreground mt-1 line-clamp-1">{e.description}</div>}
                  </TableCell>
                  <TableCell>{e.duration} phút</TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/exams/${e.id}`}>
                      <Button variant="ghost" size="icon" type="button">
                        <Settings className="h-4 w-4 text-blue-500" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(e)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(e.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
