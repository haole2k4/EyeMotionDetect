import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { WeightsService } from './weights.service';
import { GazeWeights } from './weights.entity';

type MockRepo = Pick<
  Repository<GazeWeights>,
  'findOne' | 'create' | 'save' | 'findAndCount'
>;

describe('WeightsService', () => {
  let service: WeightsService;
  let repo: jest.Mocked<MockRepo>;
  let persisted: GazeWeights;

  beforeEach(() => {
    persisted = {
      id: 'weights-1',
      user: { id: 'user-1' } as never,
      polyCoeffsX: null,
      polyCoeffsY: null,
      mlpWeightsJson: null,
      mlpWeightsBin: null,
      earThreshold: 0.21,
      calibrationPoints: 0,
      lastMaePixels: null,
      updatedAt: new Date(),
    };

    repo = {
      findOne: jest.fn().mockResolvedValue(persisted),
      create: jest.fn(),
      save: jest.fn(async (value) => value),
      findAndCount: jest.fn(),
    } as unknown as jest.Mocked<MockRepo>;

    service = new WeightsService(repo as unknown as Repository<GazeWeights>);
  });

  describe('updatePoly', () => {
    it('persists poly coeffs with calibration stats', async () => {
      await service.updatePoly('user-1', {
        coeffsX: [0.1, 0.2],
        coeffsY: [0.3, 0.4],
        calibrationPoints: 135,
        earThreshold: 0.18,
      });

      expect(persisted.polyCoeffsX).toEqual([0.1, 0.2]);
      expect(persisted.polyCoeffsY).toEqual([0.3, 0.4]);
      expect(persisted.calibrationPoints).toBe(135);
      expect(persisted.earThreshold).toBe(0.18);
    });
  });

  describe('updateMlp', () => {
    it('decodes base64 payload into Buffer before save', async () => {
      const encoded = Buffer.from([1, 2, 3, 4]).toString('base64');

      await service.updateMlp('user-1', {
        mlpWeightsJson: '{"modelTopology":{}}',
        mlpWeightsBin: encoded,
        mlpWeightsEncoding: 'base64',
      } as never);

      expect(Buffer.isBuffer(persisted.mlpWeightsBin)).toBe(true);
      expect(Array.from(persisted.mlpWeightsBin ?? Buffer.alloc(0))).toEqual([
        1, 2, 3, 4,
      ]);
    });

    it('supports Node Buffer JSON payload shape', async () => {
      await service.updateMlp('user-1', {
        mlpWeightsJson: '{"modelTopology":{}}',
        mlpWeightsBin: { type: 'Buffer', data: [9, 8, 7] },
      } as never);

      expect(Array.from(persisted.mlpWeightsBin ?? Buffer.alloc(0))).toEqual([
        9, 8, 7,
      ]);
    });

    it('throws BadRequestException for unsupported payload shape', async () => {
      await expect(
        service.updateMlp('user-1', {
          mlpWeightsJson: '{"modelTopology":{}}',
          mlpWeightsBin: { notSupported: true },
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
