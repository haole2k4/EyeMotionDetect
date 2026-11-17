import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { NotFoundException } from '@nestjs/common';

describe('UsersService - Accessibility', () => {
  let service: UsersService;
  let repo: jest.Mocked<Partial<Repository<User>>>;
  let sampleUser: User;

  beforeEach(() => {
    sampleUser = {
      id: 'u-1',
      username: 'student1',
      email: 'student1@school.edu',
      passwordHash: 'hashed',
      role: 'user',
      createdAt: new Date(),
      accessibilityProfile: null,
    };

    repo = {
      findOne: jest.fn().mockResolvedValue(sampleUser),
      findOneBy: jest
        .fn()
        .mockImplementation(({ id }) =>
          id === sampleUser.id
            ? Promise.resolve(sampleUser)
            : Promise.resolve(null),
        ),
      find: jest.fn().mockResolvedValue([sampleUser]),
      save: jest.fn((u: User) => Promise.resolve(u)),
    };

    service = new UsersService(repo as unknown as Repository<User>);
  });

  it('updates accessibility profile and fills missing fields with defaults', async () => {
    const updated = await service.updateAccessibility('u-1', {
      triggerMode: 'dwell',
      dwellTimeMs: 1200,
      dominantEye: 'left',
    });

    expect(updated.triggerMode).toBe('dwell');
    expect(updated.dwellTimeMs).toBe(1200);
    expect(updated.dominantEye).toBe('left');
    expect(updated.blinkDurationMs).toBe(350);
    expect(updated.ttsEnabled).toBe(true);
    expect(updated.magneticStrength).toBe(0.8);
    expect(repo.save).toHaveBeenCalled();
  });

  it('throws NotFoundException when updating non-existent user', async () => {
    await expect(
      service.updateAccessibility('non-existent', { dwellTimeMs: 1000 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('includes accessibilityProfile in findAllWithCalibration', async () => {
    sampleUser.accessibilityProfile = {
      dominantEye: 'right',
      triggerMode: 'dwell',
      dwellTimeMs: 800,
      blinkDurationMs: 400,
      ttsEnabled: false,
      magneticStrength: 0.5,
    };

    const list = await service.findAllWithCalibration();
    expect(list.length).toBe(1);
    const firstUser = list[0] as { accessibilityProfile?: unknown };
    expect(firstUser.accessibilityProfile).toEqual(
      sampleUser.accessibilityProfile,
    );
  });
});
