import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Question } from '../../questions/question.entity';
import { User } from '../../users/user.entity';

@Entity('exams')
export class Exam {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'int', default: 60 })
  duration!: number;

  @ManyToMany(() => Question)
  @JoinTable({
    name: 'exam_questions',
    joinColumn: { name: 'exam_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'question_id', referencedColumnName: 'id' },
  })
  questions!: Question[];

  @ManyToMany(() => User)
  @JoinTable({
    name: 'exam_users',
    joinColumn: { name: 'exam_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'user_id', referencedColumnName: 'id' },
  })
  assignedUsers!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
