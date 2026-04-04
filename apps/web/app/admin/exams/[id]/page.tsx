'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

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

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Save } from 'lucide-react';

export default function ExamDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'questions' | 'users'>('questions');
  
  // Modals state
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

  // Selection state inside Modals
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  // Queries
  const { data: exam, isLoading: isLoadingExam } = useQuery<any>({
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

  // Mutations
  const assignQuestionsMutation = useMutation({
    mutationFn: (questionIds: string[]) => api.post(`/exams/${id}/questions`, { questionIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
      setIsQuestionModalOpen(false);
    },
  });

  const assignUsersMutation = useMutation({
    mutationFn: (userIds: string[]) => api.post(`/exams/${id}/assign`, { userIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exams', id] });
      setIsUserModalOpen(false);
    },
  });

  const openQuestionModal = () => {
    const currentIds = (exam?.questions || []).map((q: Question) => q.id);
    setSelectedQuestionIds(new Set(currentIds));
    setIsQuestionModalOpen(true);
  };

  const openUserModal = () => {
    const currentIds = (exam?.assignedUsers || []).map((u: User) => u.id);
    setSelectedUserIds(new Set(currentIds));
    setIsUserModalOpen(true);
  };

  const handleToggleQuestion = (questionId: string) => {
    const newSet = new Set(selectedQuestionIds);
    if (newSet.has(questionId)) newSet.delete(questionId);
    else newSet.add(questionId);
    setSelectedQuestionIds(newSet);
  };

  const handleToggleUser = (userId: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(userId)) newSet.delete(userId);
    else newSet.add(userId);
    setSelectedUserIds(newSet);
  };

  if (isLoadingExam) return <div className="p-8 text-gray-500">Đang tải cấu hình bài thi...</div>;
  if (!exam) return <div className="p-8 text-red-500">Không tìm thấy bài thi</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/admin/exams')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Cấu hình: {exam.title}</h1>
          <p className="text-sm text-gray-500">Thời gian: {exam.duration} phút</p>
        </div>
      </div>

      <div className="flex space-x-1 border-b">
        <button
          className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
            activeTab === 'questions' ? 'bg-primary text-primary-foreground' : 'text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setActiveTab('questions')}
        >
          Câu hỏi ({exam?.questions?.length || 0})
        </button>
        <button
          className={`px-4 py-2 font-medium text-sm rounded-t-lg transition-colors ${
            activeTab === 'users' ? 'bg-primary text-primary-foreground' : 'text-gray-500 hover:text-gray-900'
          }`}
          onClick={() => setActiveTab('users')}
        >
          Phân quyền thí sinh ({exam?.assignedUsers?.length || 0})
        </button>
      </div>

      {activeTab === 'questions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openQuestionModal}>Chỉnh sửa câu hỏi trong đề</Button>
          </div>
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">STT</TableHead>
                  <TableHead>Nội dung câu hỏi</TableHead>
                  <TableHead>Độ khó</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exam.questions?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Chưa có câu hỏi nào trong đề thi này.
                    </TableCell>
                  </TableRow>
                ) : (
                  exam.questions?.map((q: Question, idx: number) => (
                    <TableRow key={q.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell>
                        <div className="font-medium">{q.content}</div>
                        <div className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {q.options.join(' | ')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          q.difficulty === 'EASY' ? 'bg-green-100 text-green-800' :
                          q.difficulty === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {q.difficulty}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={openUserModal}>Chỉ định thẻ dự thi</Button>
          </div>
          <div className="rounded-lg border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">STT</TableHead>
                  <TableHead>Tên đăng nhập</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exam.assignedUsers?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Chưa có người dùng nào được chỉ định thi.
                    </TableCell>
                  </TableRow>
                ) : (
                  exam.assignedUsers?.map((u: User, idx: number) => (
                    <TableRow key={u.id}>
                      <TableCell>{idx + 1}</TableCell>
                      <TableCell className="font-medium">{u.username}</TableCell>
                      <TableCell>{u.email}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Select Questions Modal */}
      <Dialog open={isQuestionModalOpen} onOpenChange={setIsQuestionModalOpen}>
        <DialogContent className="sm:max-w-2xl w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Chọn câu hỏi cho bài thi</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 mt-4 border rounded-md">
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-12">Chọn</TableHead>
                  <TableHead>Nội dung câu hỏi</TableHead>
                  <TableHead className="w-24">Độ khó</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingAllQuestions ? (
                  <TableRow><TableCell colSpan={3}>Đang tải...</TableCell></TableRow>
                ) : allQuestions?.map((q) => (
                  <TableRow key={q.id}>
                    <TableCell>
                      <input 
                        type="checkbox" 
                        className="w-4 h-4"
                        checked={selectedQuestionIds.has(q.id)}
                        onChange={() => handleToggleQuestion(q.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{q.content}</div>
                    </TableCell>
                    <TableCell>{q.difficulty}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsQuestionModalOpen(false)}>Hủy</Button>
            <Button 
               onClick={() => assignQuestionsMutation.mutate(Array.from(selectedQuestionIds))}
               disabled={assignQuestionsMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" /> Lưu danh sách câu hỏi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Users Modal */}
      <Dialog open={isUserModalOpen} onOpenChange={setIsUserModalOpen}>
        <DialogContent className="sm:max-w-4xl w-[90vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Chỉ định thí sinh cho bài thi</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 mt-4 border rounded-md">
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                <TableRow>
                  <TableHead className="w-12">Chọn</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Email</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingAllUsers ? (
                  <TableRow><TableCell colSpan={3}>Đang tải...</TableCell></TableRow>
                ) : allUsers?.filter(u => u.role !== 'admin').map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <input 
                        type="checkbox" 
                        className="w-4 h-4"
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => handleToggleUser(u.id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell>{u.email}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsUserModalOpen(false)}>Hủy</Button>
            <Button 
               onClick={() => assignUsersMutation.mutate(Array.from(selectedUserIds))}
               disabled={assignUsersMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" /> Lưu danh sách thí sinh
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
