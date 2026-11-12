import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { GazeWeights } from '../weights/weights.entity';

export interface AccessibilityProfile {
  dominantEye: 'both' | 'left' | 'right';
  triggerMode: 'blink' | 'dwell';
  dwellTimeMs: number;
  blinkDurationMs: number;
  ttsEnabled: boolean;
  magneticStrength: number;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: 'user' })
  role!: string;

  @Column('jsonb', { nullable: true })
  accessibilityProfile?: AccessibilityProfile | null;

  @CreateDateColumn()
  createdAt!: Date;

  @OneToOne(() => GazeWeights, (weights) => weights.user, { cascade: true })
  gazeWeights?: Relation<GazeWeights>;
}
