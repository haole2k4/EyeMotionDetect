import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Relation,
} from 'typeorm';
import { User } from '../users/user.entity';

@Entity('gaze_weights')
export class GazeWeights {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User)
  @JoinColumn()
  user!: Relation<User>;

  @Column('jsonb', { nullable: true })
  polyCoeffsX!: number[] | null;

  @Column('jsonb', { nullable: true })
  polyCoeffsY!: number[] | null;

  @Column('text', { nullable: true })
  mlpWeightsJson!: string | null;

  @Column('bytea', { nullable: true })
  mlpWeightsBin!: Buffer | null;

  @Column('float', { default: 0.21 })
  earThreshold!: number;

  @Column('int', { default: 0 })
  calibrationPoints!: number;

  @Column('float', { nullable: true })
  lastMaePixels!: number;

  @UpdateDateColumn()
  updatedAt!: Date;
}
