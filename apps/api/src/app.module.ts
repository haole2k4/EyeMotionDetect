import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { WeightsModule } from './weights/weights.module';
import { User } from './users/user.entity';
import { GazeWeights } from './weights/weights.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'gaze',
      password: process.env.DB_PASSWORD || 'gaze_dev_pass',
      database: process.env.DB_DATABASE || 'gaze_dev',
      entities: [User, GazeWeights],
      synchronize: false,
    }),
    UsersModule,
    AuthModule,
    WeightsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
