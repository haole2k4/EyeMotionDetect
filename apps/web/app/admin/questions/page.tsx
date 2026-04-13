'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Plus, Edit2, Trash2 } from 'lucide-react';

export type QuestionDifficulty = 'EASY' | 'MEDIUM' | 'HARD';

export interface Question {
  id: string;
  content: string;
  options: string[];
  correctAnswer: string;
  difficulty: QuestionDifficulty;
  createdAt: string;
  updatedAt: string;
}

const questionSchema = z.object({
  content: z.string().min(1, 'Nội dung câu hỏi không được để trống'),
  options: z.array(z.string().min(1, 'Đáp án không để trống')).length(4, 'Cần đúng 4 đáp án'),
  correctAnswer: z.string().min(1, 'Vui lòng chọn đáp án đúng'),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
});

type QuestionFormData = z.infer<typeof questionSchema>;

export default function Questions() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<QuestionFormData>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      content: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      difficulty: 'MEDIUM',
    },
  });

  const { data: questions, isLoading } = useQuery<Question[]>({
    queryKey: ['questions'],
    queryFn: async () => {
      const res = await api.get('/questions');
      return res.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: QuestionFormData) => api.post('/questions', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      closeDialog();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: QuestionFormData) => api.patch(`/questions/${editingQuestion?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/questions/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['questions'] }),
  });

  const onSubmit = (data: QuestionFormData) => {
    if (editingQuestion) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  const openEditDialog = (q: Question) => {
    setEditingQuestion(q);
    reset({
      content: q.content,
      options: q.options,
      correctAnswer: q.correctAnswer,
      difficulty: q.difficulty,
    });
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
    setEditingQuestion(null);
    reset({
      content: '',
      options: ['', '', '', ''],
      correctAnswer: '',
      difficulty: 'MEDIUM',
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa câu hỏi này?')) {
      deleteMutation.mutate(id);
    }
  };

  const option0 = watch('options.0');
  const option1 = watch('options.1');
  const option2 = watch('options.2');
  const option3 = watch('options.3');
  
  const currentAnswer = watch('correctAnswer');

  const normalizedOptions = useMemo(
    () => [option0 || '', option1 || '', option2 || '', option3 || ''].map((option) => option.trim()),
    [option0, option1, option2, option3],
  );

  useEffect(() => {
    const isCurrentAnswerValid = normalizedOptions.some(
      (option) => option.length > 0 && option === currentAnswer,
    );

    if (currentAnswer && !isCurrentAnswerValid) {
      setValue('correctAnswer', '');
    }
  }, [currentAnswer, normalizedOptions, setValue]);

  const answerOptions = normalizedOptions.filter((option) => option.length > 0);

  if (isLoading) return <div className="p-8 text-muted-foreground">Đang tải danh sách câu hỏi...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">Quản lý câu hỏi</h1>
          <p className="text-sm text-muted-foreground">Tạo, cập nhật và gán đáp án đúng cho ngân hàng câu hỏi.</p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Thêm câu hỏi
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          if (!open) closeDialog();
          else setIsDialogOpen(true);
        }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingQuestion ? 'Sửa câu hỏi' : 'Thêm câu hỏi mới'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
              <div className="space-y-2">
                <Label>Nội dung câu hỏi</Label>
                <Input {...register('content')} placeholder="Nhập nội dung câu hỏi..." />
                {errors.content && <p className="text-destructive text-sm">{errors.content.message}</p>}
              </div>

              <div className="space-y-4">
                <Label>Các đáp án</Label>
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Lựa chọn {index + 1}</Label>
                    <div>
                      <Input {...register(`options.${index}` as const)} placeholder={`Nhập đáp án ${index + 1}...`} />
                      {errors.options?.[index] && <p className="text-destructive text-sm">{errors.options[index]?.message}</p>}
                    </div>
                  </div>
                ))}
                {errors.correctAnswer && <p className="text-destructive text-sm">{errors.correctAnswer.message}</p>}
              </div>

              <div className="space-y-2">
                <Label>Đáp án đúng</Label>
                <Controller
                  name="correctAnswer"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || undefined}
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn đáp án đúng" />
                      </SelectTrigger>
                      <SelectContent>
                        {answerOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Bạn cần nhập nội dung đáp án trước khi có thể chọn đáp án đúng.
                </p>
              </div>

              <div className="max-w-52 space-y-2">
                <Label>Độ khó</Label>
                <Controller
                  name="difficulty"
                  control={control}
                  render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn độ khó" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EASY">Dễ</SelectItem>
                        <SelectItem value="MEDIUM">Trung bình</SelectItem>
                        <SelectItem value="HARD">Khó</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.difficulty && <p className="text-destructive text-sm">{errors.difficulty.message}</p>}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={closeDialog}>Hủy</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingQuestion ? 'Cập nhật' : 'Thêm mới'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách câu hỏi</CardTitle>
          <CardDescription>{questions?.length || 0} câu hỏi trong ngân hàng hiện tại.</CardDescription>
        </CardHeader>
        <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">STT</TableHead>
              <TableHead>Nội dung câu hỏi</TableHead>
              <TableHead className="w-32">Độ khó</TableHead>
              <TableHead className="w-24 text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {questions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Chưa có câu hỏi nào.
                </TableCell>
              </TableRow>
            ) : (
              questions?.map((q, idx) => (
                <TableRow key={q.id}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{q.content}</div>
                    <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                      {q.options.join(' | ')} (Đúng: <span className="font-semibold">{q.correctAnswer}</span>)
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center justify-center min-w-[76px] rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      q.difficulty === 'EASY' 
                        ? 'border border-emerald-500/30 bg-emerald-500/20 text-emerald-400' 
                        : q.difficulty === 'MEDIUM'
                        ? 'border border-amber-500/30 bg-amber-500/20 text-amber-400'
                        : 'border border-rose-500/30 bg-rose-500/20 text-rose-400'
                    }`}>
                      {q.difficulty === 'EASY' ? 'Dễ' : q.difficulty === 'MEDIUM' ? 'Trung bình' : 'Khó'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(q)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(q.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        </CardContent>
      </Card>
    </div>
  );
}