import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Exam } from './entities/exam.entity';
import { Question } from '../questions/question.entity';
import { User } from '../users/user.entity';

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(Exam)
    private readonly examRepo: Repository<Exam>,
    @InjectRepository(Question)
    private readonly questionRepo: Repository<Question>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
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
}
