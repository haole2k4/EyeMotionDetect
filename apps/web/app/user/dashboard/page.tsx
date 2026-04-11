'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [examsRes, sessionsRes] = await Promise.all([
          api.get('/exams/user/assigned'),
          api.get('/exams/sessions/my')
        ]);
        setAssignedExams(examsRes.data);
        setSessions(sessionsRes.data);
      } catch (error) {
        console.error('Failed to fetch user data', error);
      }
    };
    fetchData();
  }, []);

  const completedSessions = sessions.filter((session) => session.status === 'COMPLETED');

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-6 space-y-1">
          <h1 className="text-2xl font-semibold">Bài thi của tôi</h1>
          <p className="text-sm text-muted-foreground">Chọn bài thi được giao và bắt đầu ngay trong chế độ focus.</p>
        </div>

        {assignedExams.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">Bạn chưa được giao bài thi nào.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {assignedExams.map((exam) => {
              const session = sessions.find((s) => s.exam.id === exam.id && s.status === 'IN_PROGRESS');

              return (
                <Card key={exam.id} className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{exam.title}</CardTitle>
                    <CardDescription>
                      {exam.timeLimit ? `Thời gian: ${exam.timeLimit} phút` : 'Không giới hạn thời gian'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="inline-flex rounded-full border bg-muted px-2 py-1 text-xs text-muted-foreground">
                      {session ? 'Đang có phiên làm bài đang dở' : 'Sẵn sàng bắt đầu phiên mới'}
                    </div>
                  </CardContent>
                  <CardFooter className="justify-end">
                    <Link href={`/user/exams/${exam.id}/start`} className="block w-full">
                      <Button size="default" className="w-full">
                        {session ? 'Tiếp tục làm bài' : 'Bắt đầu ngay'}
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <div className="mb-6 space-y-1 border-t pt-6">
          <h2 className="text-xl font-semibold">Lịch sử làm bài</h2>
          <p className="text-sm text-muted-foreground">Tổng hợp kết quả các bài thi đã hoàn thành.</p>
        </div>

        {completedSessions.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">Chưa có lịch sử làm bài.</CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {completedSessions.map((session) => (
              <Card key={session.id} className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">{session.exam.title}</CardTitle>
                  <CardDescription>
                    Thi ngày: {new Date(session.startTime).toLocaleDateString('vi-VN')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                    <span className="text-sm text-muted-foreground">Điểm số</span>
                    <span className="text-lg font-semibold">{session.score?.toFixed(1)}%</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}