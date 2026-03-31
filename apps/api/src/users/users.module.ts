import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { GazeWeights } from '../weights/weights.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, GazeWeights])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
