import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Exam } from './entities/exam.entity';
import { Question } from '../questions/question.entity';
import { User } from '../users/user.entity';
import { ExamSession, ExamStatus } from './entities/exam-session.entity';
import { UserAnswer } from './entities/user-answer.entity';

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(Exam)
    private readonly examRepo: Repository<Exam>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ExamSession)
    private readonly sessionRepo: Repository<ExamSession>,
    @InjectRepository(UserAnswer)
    private readonly answerRepo: Repository<UserAnswer>,
  ) {}

  async create(data: Partial<Exam>) {
    const exam = this.examRepo.create(data);
    return this.examRepo.save(exam);
  }

  async findAll() {
    return this.examRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['questions', 'assignedUsers'],
    });
  }

  async findOne(id: string) {
    const exam = await this.examRepo.findOne({
      where: { id },
      relations: ['questions', 'assignedUsers'],
    });
    if (!exam) throw new NotFoundException('Không tìm thấy bài thi');
    return exam;
  }

  async update(id: string, data: Partial<Exam>) {
    await this.examRepo.update(id, data);
    return this.findOne(id);
  }

  async remove(id: string) {
    const exam = await this.findOne(id);
    return this.examRepo.remove(exam);
  }

  async assignQuestions(id: string, questionIds: string[]) {
    const exam = await this.findOne(id);
    if (!questionIds || questionIds.length === 0) {
      exam.questions = [];
    } else {
      const questions = await this.questionRepo.findBy({ id: In(questionIds) });
      exam.questions = questions;
    }
    return this.examRepo.save(exam);
  }

  async assignUsers(id: string, userIds: string[]) {
    const exam = await this.findOne(id);
    if (!userIds || userIds.length === 0) {
      exam.assignedUsers = [];
    } else {
      const users = await this.userRepo.findBy({ id: In(userIds) });
      exam.assignedUsers = users;
    }
    return this.examRepo.save(exam);
  }

  // --- USER API ---
  async findAssignedExams(userId: string) {
    return this.examRepo.find({
      where: {
        assignedUsers: { id: userId },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async getMySessions(userId: string) {
    return this.sessionRepo.find({
      where: { user: { id: userId } },
      relations: ['exam'],
      order: { startTime: 'DESC' },
    });
  }

  async getSession(sessionId: string, userId: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, user: { id: userId } },
      relations: ['exam', 'exam.questions', 'answers', 'answers.question'],
    });
    if (!session) throw new NotFoundException('Không tìm thấy phiên làm bài');
    return session;
  }

  async startExam(examId: string, userId: string) {
    await this.findOne(examId);

    // Check if user already has an IN_PROGRESS session
    let session = await this.sessionRepo.findOne({
      where: {
        exam: { id: examId },
        user: { id: userId },
        status: ExamStatus.IN_PROGRESS,
      },
      relations: ['answers', 'exam', 'exam.questions'],
    });

    if (!session) {
      session = this.sessionRepo.create({
        exam: { id: examId },
        user: { id: userId },
        status: ExamStatus.IN_PROGRESS,
        score: 0,
        startTime: new Date(),
      });
      await this.sessionRepo.save(session);
      // Re-fetch to get relations
      session = await this.getSession(session.id, userId);
    }
    return session;
  }

  async submitAnswer(
    sessionId: string,
    userId: string,
    questionId: string,
    selectedOption: string,
    dwellTimeMs: number,
  ) {
    const session = await this.getSession(sessionId, userId);
    if (session.status !== ExamStatus.IN_PROGRESS) {
      throw new BadRequestException('Phiên làm bài đã kết thúc');
    }

    const question = session.exam.questions.find((q) => q.id === questionId);
    if (!question)
      throw new NotFoundException('Câu hỏi không thuộc bài thi này');

    const isCorrect = question.correctAnswer === selectedOption;

    let answer = session.answers?.find((a) => a.question?.id === questionId);
    if (answer) {
      answer.selectedOption = selectedOption;
      answer.isCorrect = isCorrect;
      answer.dwellTimeMs = dwellTimeMs;
    } else {
      answer = this.answerRepo.create({
        session: { id: sessionId },
        question: { id: questionId },
        selectedOption,
        isCorrect,
        dwellTimeMs,
      });
    }

    await this.answerRepo.save(answer);
    return answer;
  }

  async finishExam(sessionId: string, userId: string) {
    const session = await this.getSession(sessionId, userId);
    if (session.status === ExamStatus.COMPLETED) return session;

    const totalQuestions = session.exam.questions.length;
    const correctAnswers =
      session.answers?.reduce(
        (count, answer) => count + (answer.isCorrect ? 1 : 0),
        0,
      ) || 0;

    const score =
      totalQuestions > 0
        ? Math.round((correctAnswers / totalQuestions) * 100)
        : 0;

    await this.sessionRepo.update(sessionId, {
      endTime: new Date(),
      status: ExamStatus.COMPLETED,
      score,
    });

    return this.getSession(sessionId, userId);
  }
}
