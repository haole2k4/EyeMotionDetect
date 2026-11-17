import { Repository } from 'typeorm';
import { ExamsService } from './exams.service';
import { Exam } from './entities/exam.entity';
import { Question } from '../questions/question.entity';
import { User } from '../users/user.entity';
import {
  ExamSession,
  ExamStatus,
  GazeHeatmapPoint,
} from './entities/exam-session.entity';
import { UserAnswer } from './entities/user-answer.entity';

describe('ExamsService - Telemetry & Heatmap', () => {
  let service: ExamsService;
  let sessionRepo: jest.Mocked<Partial<Repository<ExamSession>>>;
  let sampleSession: ExamSession;

  beforeEach(() => {
    sampleSession = {
      id: 'session-1',
      status: ExamStatus.IN_PROGRESS,
      score: 0,
      startTime: new Date(),
      user: { id: 'user-1', username: 'student' } as User,
      exam: { id: 'exam-1', title: 'Math 101', questions: [] } as Exam,
      answers: [],
      gazeHeatmap: null,
      faceLossPauseCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    sessionRepo = {
      findOne: jest
        .fn()
        .mockImplementation((options?: { where?: { id?: string } }) => {
          if (options?.where?.id === 'session-1') {
            return Promise.resolve(sampleSession);
          }
          return Promise.resolve(null);
        }),
      save: jest.fn((s: ExamSession) => Promise.resolve(s)),
    };

    service = new ExamsService(
      {} as unknown as Repository<Exam>,
      {} as unknown as Repository<Question>,
      {} as unknown as Repository<User>,
      sessionRepo as unknown as Repository<ExamSession>,
      {} as unknown as Repository<UserAnswer>,
    );
  });

  it('updates telemetry and caps heatmap points to 500', async () => {
    // Generate 600 points
    const points: GazeHeatmapPoint[] = Array.from({ length: 600 }, (_, i) => ({
      x: i,
      y: i * 2,
      t: 1000 + i,
      qIdx: 0,
    }));

    const result = await service.updateTelemetry('session-1', 'user-1', {
      gazeHeatmap: points,
      faceLossPauseCount: 3,
    });

    expect(result.success).toBe(true);
    expect(result.pointCount).toBe(500);
    expect(result.faceLossPauseCount).toBe(3);
    expect(sampleSession.gazeHeatmap?.length).toBe(500);
    // Should keep the latest points
    expect(sampleSession.gazeHeatmap?.[499].x).toBe(599);
  });

  it('retrieves heatmap for admin with getSessionHeatmap', async () => {
    sampleSession.gazeHeatmap = [{ x: 100, y: 200, t: 5000, qIdx: 1 }];
    sampleSession.faceLossPauseCount = 2;

    const heatmap = await service.getSessionHeatmap('session-1');
    expect(heatmap.sessionId).toBe('session-1');
    expect(heatmap.username).toBe('student');
    expect(heatmap.examTitle).toBe('Math 101');
    expect(heatmap.faceLossPauseCount).toBe(2);
    expect(heatmap.gazeHeatmap.length).toBe(1);
    expect(heatmap.gazeHeatmap[0].x).toBe(100);
  });
});
