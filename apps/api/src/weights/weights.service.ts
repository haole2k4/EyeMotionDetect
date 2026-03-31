import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GazeWeights } from './weights.entity';
import { User } from '../users/user.entity';

@Injectable()
export class WeightsService {
  constructor(
    @InjectRepository(GazeWeights)
    private weightsRepo: Repository<GazeWeights>,
  ) {}

  async getWeights(userId: string) {
    let weights = await this.weightsRepo.findOne({ where: { user: { id: userId } } });
    if (!weights) {
      weights = this.weightsRepo.create({ user: { id: userId } as User });
      await this.weightsRepo.save(weights);
    }
    return weights;
  }

  async updatePoly(userId: string, data: any) {
    const weights = await this.getWeights(userId);
    weights.polyCoeffsX = data.coeffsX;
    weights.polyCoeffsY = data.coeffsY;
    return this.weightsRepo.save(weights);
  }

  async updateMlp(userId: string, data: any) {
    const weights = await this.getWeights(userId);
    weights.mlpWeightsJson = data.mlpWeightsJson;
    weights.mlpWeightsBin = data.mlpWeightsBin; 
    return this.weightsRepo.save(weights);
  }

  async resetWeights(userId: string) {
    const weights = await this.getWeights(userId);
    weights.polyCoeffsX = null;
    weights.polyCoeffsY = null;
    weights.mlpWeightsJson = null;
    weights.mlpWeightsBin = null;
    weights.calibrationPoints = 0;
    return this.weightsRepo.save(weights);
  }
}
