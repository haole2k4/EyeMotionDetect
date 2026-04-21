import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GazeWeights } from './weights.entity';
import { User } from '../users/user.entity';
import type {
  BufferJsonPayload,
  MlpUpdatePayload,
  PolyUpdatePayload,
} from '../auth/interfaces/request-with-user.interface';

interface CalibrationStatsPayload {
  calibrationPoints?: number;
  lastMaePixels?: number | null;
  earThreshold?: number;
}

type WeightsWithoutBin = Pick<
  GazeWeights,
  | 'id'
  | 'polyCoeffsX'
  | 'polyCoeffsY'
  | 'earThreshold'
  | 'calibrationPoints'
  | 'lastMaePixels'
  | 'updatedAt'
>;

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

  async getWeightsWithoutBin(userId: string): Promise<WeightsWithoutBin> {
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
    });

    if (!weights) {
      const created = this.weightsRepo.create({ user: { id: userId } as User });
      await this.weightsRepo.save(created);
      const reloaded = await this.weightsRepo.findOne({
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
      });

      if (!reloaded) {
        throw new BadRequestException('Unable to initialize weights for user');
      }

      weights = reloaded;
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

  async updatePoly(userId: string, data: PolyUpdatePayload) {
    const weights = await this.getWeights(userId);
    weights.polyCoeffsX = data.coeffsX;
    weights.polyCoeffsY = data.coeffsY;

    if (
      typeof data.calibrationPoints === 'number' &&
      Number.isFinite(data.calibrationPoints)
    ) {
      weights.calibrationPoints = Math.max(
        0,
        Math.round(data.calibrationPoints),
      );
    }

    if (
      typeof data.earThreshold === 'number' &&
      Number.isFinite(data.earThreshold)
    ) {
      weights.earThreshold = data.earThreshold;
    }

    return this.weightsRepo.save(weights);
  }

  async updateMlp(userId: string, data: MlpUpdatePayload) {
    const weights = await this.getWeights(userId);
    weights.mlpWeightsJson = data.mlpWeightsJson;
    weights.mlpWeightsBin = this.normalizeMlpWeightsBin(
      data.mlpWeightsBin,
      data.mlpWeightsEncoding,
    );
    return this.weightsRepo.save(weights);
  }

  async updateCalibrationStats(userId: string, data: CalibrationStatsPayload) {
    const weights = await this.getWeights(userId);

    if (data.calibrationPoints !== undefined) {
      if (
        typeof data.calibrationPoints !== 'number' ||
        !Number.isFinite(data.calibrationPoints)
      ) {
        throw new BadRequestException('calibrationPoints must be a finite number');
      }

      weights.calibrationPoints = Math.max(
        0,
        Math.round(data.calibrationPoints),
      );
    }

    if (data.lastMaePixels !== undefined) {
      if (data.lastMaePixels === null) {
        weights.lastMaePixels = null;
      } else if (
        typeof data.lastMaePixels === 'number' &&
        Number.isFinite(data.lastMaePixels)
      ) {
        weights.lastMaePixels = data.lastMaePixels;
      } else {
        throw new BadRequestException('lastMaePixels must be a finite number or null');
      }
    }

    if (
      typeof data.earThreshold === 'number' &&
      Number.isFinite(data.earThreshold)
    ) {
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

  private normalizeMlpWeightsBin(
    value: MlpUpdatePayload['mlpWeightsBin'],
    encoding?: MlpUpdatePayload['mlpWeightsEncoding'],
  ): Buffer {
    if (Buffer.isBuffer(value)) {
      return value;
    }

    if (typeof value === 'string') {
      if (encoding && encoding !== 'base64') {
        throw new BadRequestException(
          'Unsupported mlpWeightsEncoding, only base64 is allowed',
        );
      }

      const compact = value.trim();
      if (!compact) {
        throw new BadRequestException('mlpWeightsBin base64 payload is empty');
      }

      const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
      if (!base64Pattern.test(compact)) {
        throw new BadRequestException('mlpWeightsBin must be a valid base64 string');
      }

      return Buffer.from(compact, 'base64');
    }

    if (this.isBufferJsonPayload(value)) {
      return Buffer.from(value.data);
    }

    throw new BadRequestException(
      'mlpWeightsBin must be Buffer, base64 string, or Buffer JSON payload',
    );
  }

  private isBufferJsonPayload(value: unknown): value is BufferJsonPayload {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const payload = value as Partial<BufferJsonPayload>;
    return (
      payload.type === 'Buffer' &&
      Array.isArray(payload.data) &&
      payload.data.every(
        (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
      )
    );
  }
}
