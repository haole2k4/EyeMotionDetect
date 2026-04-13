import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Relation,
} from 'typeorm';
import { ExamSession } from './exam-session.entity';
import { Question } from '../../questions/question.entity';

@Entity('user_answers')
export class UserAnswer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => ExamSession, (session) => session.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'session_id' })
  session!: Relation<ExamSession>;

  @ManyToOne(() => Question, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'question_id' })
  question!: Relation<Question>;

  @Column({ type: 'varchar', nullable: true })
  selectedOption?: string;

  @Column({ type: 'boolean', default: false })
  isCorrect!: boolean;

  @Column({
    type: 'int',
    nullable: true,
    comment: 'Time spent looking at this answer/question in ms',
  })
  dwellTimeMs?: number;

  @CreateDateColumn()
  createdAt!: Date;
}
