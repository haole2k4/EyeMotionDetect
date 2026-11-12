import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../../users/user.entity';
import { Exam } from './exam.entity';
import { UserAnswer } from './user-answer.entity';

export enum ExamStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export interface GazeHeatmapPoint {
  x: number;
  y: number;
  t: number;
  qIdx?: number;
}

@Entity('exam_sessions')
export class ExamSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<User>;

  @ManyToOne(() => Exam, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'exam_id' })
  exam!: Relation<Exam>;

  @Column({ type: 'enum', enum: ExamStatus, default: ExamStatus.IN_PROGRESS })
  status!: ExamStatus;

  @Column({ type: 'int', nullable: true })
  score?: number;

  @Column({ type: 'timestamp', nullable: true })
  startTime!: Date;

  @Column({ type: 'timestamp', nullable: true })
  endTime?: Date;

  @Column('jsonb', { nullable: true })
  gazeHeatmap?: GazeHeatmapPoint[] | null;

  @Column({ type: 'int', default: 0 })
  faceLossPauseCount!: number;

  @OneToMany(() => UserAnswer, (answer) => answer.session, { cascade: true })
  answers!: Relation<UserAnswer[]>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
