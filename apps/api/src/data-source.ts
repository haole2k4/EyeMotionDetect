import { DataSource } from 'typeorm';
import { User } from './users/user.entity';
import { GazeWeights } from './weights/weights.entity';
import { Question } from './questions/question.entity';
import { Exam } from './exams/entities/exam.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USERNAME || 'gaze',
  password: process.env.DB_PASSWORD || 'gaze_dev_pass',
  database: process.env.DB_DATABASE || 'gaze_dev',
  synchronize: false,
  entities: [User, GazeWeights, Question, Exam],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
});
