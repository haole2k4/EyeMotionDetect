import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GazeWeights } from './weights.entity';
import { User } from '../users/user.entity';

interface CalibrationStatsPayload {
  calibrationPoints?: number;
  lastMaePixels?: number | null;
  earThreshold?: number;
}

@Injectable()
export class WeightsService {
  constructor(
    @InjectRepository(GazeWeights)
    private weightsRepo: Repository<GazeWeights>,
  ) {}

  async getWeights(userId: string) {
    let weights = await this.weightsRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!weights) {
      weights = this.weightsRepo.create({ user: { id: userId } as User });
      await this.weightsRepo.save(weights);
    }
    return weights;
  }

  async getWeightsWithoutBin(userId: string) {
    let weights = await this.weightsRepo.findOne({
      where: { user: { id: userId } },
      select: [
        'id',
        'polyCoeffsX',
        'polyCoeffsY',
        'earThreshold',
        'calibrationPoints',
        'lastMaePixels',
        'updatedAt',
      ],
      relations: ['user'],
    });
    if (!weights) {
      weights = this.weightsRepo.create({ user: { id: userId } as User });
      await this.weightsRepo.save(weights);
      // Remove bin fields manually before return
      delete (weights as any).mlpWeightsJson;
      delete (weights as any).mlpWeightsBin;
    }
    return weights;
  }

  async getAdminGazeData(page: number, limit: number) {
    const [data, total] = await this.weightsRepo.findAndCount({
      select: [
        'id',
        'earThreshold',
        'calibrationPoints',
        'lastMaePixels',
        'updatedAt',
      ],
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { updatedAt: 'DESC' },
    });

    return {
      data: data.map((item) => ({
        id: item.id,
        userEmail: item.user.email,
        userId: item.user.id,
        earThreshold: item.earThreshold,
        calibrationPoints: item.calibrationPoints,
        lastMaePixels: item.lastMaePixels,
        updatedAt: item.updatedAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
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

  async updateCalibrationStats(userId: string, data: CalibrationStatsPayload) {
    const weights = await this.getWeights(userId);

    if (
      typeof data.calibrationPoints === 'number' &&
      Number.isFinite(data.calibrationPoints)
    ) {
      weights.calibrationPoints = Math.max(0, Math.round(data.calibrationPoints));
    }

    if (data.lastMaePixels === null) {
      weights.lastMaePixels = null;
    } else if (
      typeof data.lastMaePixels === 'number' &&
      Number.isFinite(data.lastMaePixels)
    ) {
      weights.lastMaePixels = data.lastMaePixels;
    }

    if (typeof data.earThreshold === 'number' && Number.isFinite(data.earThreshold)) {
      weights.earThreshold = data.earThreshold;
    }

    return this.weightsRepo.save(weights);
  }

  async resetWeights(userId: string) {
    const weights = await this.getWeights(userId);
    weights.polyCoeffsX = null;
    weights.polyCoeffsY = null;
    weights.mlpWeightsJson = null;
    weights.mlpWeightsBin = null;
    weights.calibrationPoints = 0;
    weights.lastMaePixels = null;
    weights.earThreshold = 0.21;
    return this.weightsRepo.save(weights);
  }
}
