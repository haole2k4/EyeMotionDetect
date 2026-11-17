'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Check, Plus, Edit2, Trash2 } from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

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

const DIFFICULTY_LABELS: Record<QuestionDifficulty, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
};

const OPTION_LETTERS = ['A', 'B', 'C', 'D'] as const;

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
  const [deletingQuestion, setDeletingQuestion] = useState<Question | null>(null);

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

  const { data: questions, isLoading, isError } = useQuery<Question[]>({
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
      toast.success('Đã thêm câu hỏi vào ngân hàng.');
      closeDialog();
    },
    onError: () => {
      toast.error('Không thể thêm câu hỏi. Vui lòng thử lại.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: QuestionFormData) => api.patch(`/questions/${editingQuestion?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      toast.success('Đã cập nhật câu hỏi.');
      closeDialog();
    },
    onError: () => {
      toast.error('Không thể cập nhật câu hỏi. Vui lòng thử lại.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/questions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['questions'] });
      setDeletingQuestion(null);
      toast.success('Đã xóa câu hỏi.');
    },
    onError: () => {
      setDeletingQuestion(null);
      toast.error('Không thể xóa câu hỏi. Vui lòng thử lại.');
    },
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

  const answerOptions = useMemo(
    () => Array.from(new Set(normalizedOptions.filter((option) => option.length > 0))),
    [normalizedOptions],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
            Quản lý câu hỏi
          </h1>
          <div className="mt-1 text-sm text-[#515154] tabular-nums">
            {isLoading ? (
              <Skeleton className="h-4 w-72" />
            ) : (
              <p>
                Tạo, cập nhật và gán đáp án đúng cho {questions?.length ?? 0} câu hỏi trong ngân hàng.
              </p>
            )}
          </div>
        </div>

        <Button
          type="button"
          onClick={() => setIsDialogOpen(true)}
          className="h-10 px-4"
        >
          <Plus className="mr-1.5 size-4" />
          Thêm câu hỏi
        </Button>
      </div>

      {isError ? (
        <div className="rounded-2xl border border-[#FFB8B5] bg-[#FFECEB] px-4 py-3 text-sm font-medium text-[#D70015]">
          Không thể tải danh sách câu hỏi từ máy chủ.
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
                Nội dung câu hỏi
              </TableHead>
              <TableHead className="w-32 px-4 py-3 text-xs font-semibold text-[#3C3C43]">
                Độ khó
              </TableHead>
              <TableHead className="w-28 px-4 py-3 text-right text-xs font-semibold text-[#3C3C43]">
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
                      <Skeleton className="h-4 w-4/5" />
                      <Skeleton className="h-3.5 w-3/5" />
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <Skeleton className="h-6 w-20 rounded-full" />
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1.5">
                      <Skeleton className="size-8 rounded-[10px]" />
                      <Skeleton className="size-8 rounded-[10px]" />
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : questions?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-sm text-[#515154]">
                  Chưa có câu hỏi nào.
                </TableCell>
              </TableRow>
            ) : (
              questions?.map((q, idx) => (
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
                        title={`${q.options.join(' | ')} (Đúng: ${q.correctAnswer})`}
                      >
                        {q.options.join(' | ')} (Đúng:{' '}
                        <span className="font-semibold text-[#1D1D1F]">{q.correctAnswer}</span>)
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center justify-center min-w-[84px] rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${
                        q.difficulty === 'EASY'
                          ? 'bg-[#ECFDF3] text-[#12783D] border-[#86EFAC]'
                          : q.difficulty === 'MEDIUM'
                            ? 'bg-[#FFF8EB] text-[#9A4600] border-[#FCD34D]'
                            : 'bg-[#FFECEB] text-[#D70015] border-[#FFB8B5]'
                      }`}
                    >
                      {DIFFICULTY_LABELS[q.difficulty] ?? q.difficulty}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-right">
                    <div className="inline-flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Sửa câu hỏi ${idx + 1}`}
                        title="Sửa câu hỏi"
                        onClick={() => openEditDialog(q)}
                        className="text-[#3C3C43] hover:bg-black/[0.05] hover:text-[#1D1D1F]"
                      >
                        <Edit2 className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Xóa câu hỏi ${idx + 1}`}
                        title="Xóa câu hỏi"
                        onClick={() => setDeletingQuestion(q)}
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

      {/* Create / Edit Question Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeDialog();
          else setIsDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-2xl w-[94vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1D1D1F]">
              {editingQuestion ? 'Sửa câu hỏi' : 'Thêm câu hỏi mới'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 mt-2">
            <div className="space-y-2">
              <Label htmlFor="question-content" className="text-sm font-medium text-[#1D1D1F]">
                Nội dung câu hỏi
              </Label>
              <textarea
                id="question-content"
                rows={3}
                {...register('content')}
                placeholder="Nhập nội dung câu hỏi..."
                className="min-h-[92px] w-full rounded-xl border border-black/[0.12] bg-white/90 px-3.5 py-2.5 text-sm leading-relaxed text-[#1D1D1F] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-[border-color,background-color,box-shadow] focus:border-[#0066CC] focus:bg-white focus:ring-3 focus:ring-[#0066CC]/20"
              />
              {errors.content ? (
                <p className="text-sm text-[#D70015]">{errors.content.message}</p>
              ) : null}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium text-[#1D1D1F]">Các đáp án</Label>
                <span className="text-xs text-[#515154]">
                  Nhấn &ldquo;Chọn đúng&rdquo; để gán trực tiếp đáp án đúng
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[0, 1, 2, 3].map((index) => {
                  const letter = OPTION_LETTERS[index];
                  const trimmedValue = normalizedOptions[index] ?? '';
                  const isCorrect = trimmedValue.length > 0 && currentAnswer === trimmedValue;

                  return (
                    <div
                      key={index}
                      className={`rounded-2xl border p-3.5 space-y-2 transition-colors ${
                        isCorrect
                          ? 'border-[#0066CC] bg-[#E8F2FF]/65 shadow-[0_2px_8px_rgba(0,102,204,0.08)]'
                          : 'border-black/[0.08] bg-[#F5F5F7]/70'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Label
                          htmlFor={`question-option-${index}`}
                          className="inline-flex items-center gap-2 text-xs font-semibold text-[#1D1D1F]"
                        >
                          <span
                            className={`inline-flex size-5 items-center justify-center rounded-[7px] text-xs font-bold ${
                              isCorrect
                                ? 'bg-[#0066CC] text-white'
                                : 'bg-white border border-black/[0.12] text-[#3C3C43]'
                            }`}
                          >
                            {letter}
                          </span>
                          Đáp án {letter}
                        </Label>

                        <button
                          type="button"
                          disabled={!trimmedValue}
                          onClick={() =>
                            setValue('correctAnswer', trimmedValue, { shouldValidate: true })
                          }
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            isCorrect
                              ? 'bg-[#0066CC] text-white'
                              : 'border border-black/[0.12] bg-white text-[#3C3C43] hover:border-[#0066CC] hover:text-[#0066CC]'
                          }`}
                        >
                          {isCorrect ? <Check className="size-3" /> : null}
                          {isCorrect ? 'Đáp án đúng' : 'Chọn đúng'}
                        </button>
                      </div>

                      <Input
                        id={`question-option-${index}`}
                        {...register(`options.${index}` as const)}
                        placeholder={`Nhập đáp án ${letter}...`}
                        className="bg-white"
                      />
                      {errors.options?.[index] ? (
                        <p className="text-xs text-[#D70015]">
                          {errors.options[index]?.message}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {errors.correctAnswer ? (
                <p className="text-sm text-[#D70015]">{errors.correctAnswer.message}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#1D1D1F]">Đáp án đúng</Label>
                <Controller
                  name="correctAnswer"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || null}
                      onValueChange={(value) => field.onChange(value ?? '')}
                    >
                      <SelectTrigger className="w-full h-10 bg-white">
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
                <p className="text-xs text-[#515154]">
                  Có thể chọn trực tiếp ở trên hoặc từ danh sách này.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-[#1D1D1F]">Độ khó</Label>
                <Controller
                  name="difficulty"
                  control={control}
                  render={({ field }) => (
                    <Select
                      items={DIFFICULTY_LABELS}
                      onValueChange={field.onChange}
                      value={field.value}
                    >
                      <SelectTrigger className="w-full h-10 bg-white">
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
                {errors.difficulty ? (
                  <p className="text-sm text-[#D70015]">{errors.difficulty.message}</p>
                ) : null}
              </div>
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
                {editingQuestion ? 'Cập nhật' : 'Thêm mới'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation AlertDialog */}
      <AlertDialog
        open={Boolean(deletingQuestion)}
        onOpenChange={(open) => {
          if (!open) setDeletingQuestion(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1D1D1F]">
              Xóa câu hỏi?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#515154]">
              Bạn có chắc chắn muốn xóa câu hỏi{' '}
              <strong className="text-[#1D1D1F]">{deletingQuestion?.content}</strong>? Hành
              động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingQuestion) deleteMutation.mutate(deletingQuestion.id);
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
