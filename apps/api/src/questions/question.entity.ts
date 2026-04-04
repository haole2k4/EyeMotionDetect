import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum QuestionDifficulty {
  EASY = 'EASY',
  MEDIUM = 'MEDIUM',
  HARD = 'HARD',
}

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb' })
  options!: string[];

  @Column({ type: 'varchar' })
  correctAnswer!: string;

  @Column({ type: 'enum', enum: QuestionDifficulty, default: QuestionDifficulty.MEDIUM })
  difficulty!: QuestionDifficulty;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
