import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WeightsController } from './weights.controller';
import { AdminGazeController } from './admin-gaze.controller';
import { WeightsService } from './weights.service';
import { GazeWeights } from './weights.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([GazeWeights]), UsersModule],
  controllers: [WeightsController, AdminGazeController],
  providers: [WeightsService],
})
export class WeightsModule {}
