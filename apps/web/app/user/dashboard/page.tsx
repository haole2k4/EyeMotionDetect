'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
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

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold mb-6 text-slate-800">Bài Thi Của Tôi</h1>
        {assignedExams.length === 0 ? (
          <p className="text-sm text-slate-500 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            Bạn chưa được giao bài thi nào.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {assignedExams.map((exam) => {
              // Tìm xem đã có session nào chưa (có thể đang làm dở)
              const session = sessions.find((s) => s.exam.id === exam.id && s.status === 'IN_PROGRESS');

              return (
                <Card key={exam.id} className="hover:shadow-md transition-all rounded-xl p-5 bg-white flex flex-col justify-between h-auto gap-6 border-slate-200 border">
                  <div className="space-y-2">
                    <h2 className="text-lg font-semibold text-slate-900">{exam.title}</h2>
                    {exam.timeLimit && (
                      <p className="text-sm text-slate-500">
                        Thời gian: <span className="font-medium text-slate-700">{exam.timeLimit} phút</span>
                      </p>
                    )}
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <Link href={`/user/exams/${exam.id}/start`} className="block w-full">
                      <Button size="default" className="w-full shadow-sm font-medium">
                        {session ? 'Tiếp tục làm bài' : 'Bắt đầu ngay'}
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-6 text-slate-800 pt-6">Lịch Sử Làm Bài</h2>
        {sessions.filter(s => s.status === 'COMPLETED').length === 0 ? (
          <p className="text-sm text-slate-500 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            Chưa có lịch sử làm bài.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions
              .filter(s => s.status === 'COMPLETED')
              .map((session) => (
              <Card key={session.id} className="p-5 rounded-xl bg-white border border-slate-200 hover:shadow-md transition-all">
                <div className="flex flex-col space-y-1">
                  <h3 className="text-base font-semibold text-slate-800">{session.exam.title}</h3>
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs text-slate-500">
                      Thi ngày: {new Date(session.startTime).toLocaleDateString('vi-VN')}
                    </p>
                    <span className="font-bold text-green-600 text-lg">
                      {session.score?.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}