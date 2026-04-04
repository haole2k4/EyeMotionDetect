import {
  Injectable,
  ConflictException,
  OnModuleInit,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async onModuleInit() {
    const adminUsername = 'admin';
    const adminEmail = 'admin@eyemotiondetect.dev';
    const existingAdmin = await this.findByEmail(adminEmail);
    
    if (!existingAdmin) {
      const salt = await bcrypt.genSalt();
      const passwordHash = await bcrypt.hash('admin', salt);
      
      const adminUser = this.usersRepository.create({
        username: adminUsername,
        email: adminEmail,
        passwordHash,
        role: 'admin'
      });
      
      await this.usersRepository.save(adminUser);
      this.logger.log('Default admin user created.');
      return;
    }

    if (existingAdmin.username !== adminUsername) {
      const existedUsername = await this.findByUsername(adminUsername);
      if (!existedUsername || existedUsername.id === existingAdmin.id) {
        existingAdmin.username = adminUsername;
        await this.usersRepository.save(existingAdmin);
        this.logger.log('Default admin username normalized to admin.');
      }
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findAllWithCalibration(): Promise<any[]> {
    const users = await this.usersRepository.find({ relations: ['gazeWeights'] });
    return users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      calibrated: !!user.gazeWeights,
    }));
  }

  async create(user: Partial<User>): Promise<User> {
    if (!user.username) throw new ConflictException('Username required');
    if (!user.email) throw new ConflictException('Email required');

    const existingByUsername = await this.findByUsername(user.username);
    if (existingByUsername) {
      throw new ConflictException('Username already in use');
    }

    const existing = await this.findByEmail(user.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const newUser = this.usersRepository.create(user);
    return this.usersRepository.save(newUser);
  }

  async update(id: string, user: Partial<User>): Promise<User> {
    const existingUser = await this.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (user.email && user.email !== existingUser.email) {
      const userWithSameEmail = await this.findByEmail(user.email);
      if (userWithSameEmail && userWithSameEmail.id !== id) {
        throw new ConflictException('Email already in use');
      }
    }

    if (user.username && user.username !== existingUser.username) {
      const userWithSameUsername = await this.findByUsername(user.username);
      if (userWithSameUsername && userWithSameUsername.id !== id) {
        throw new ConflictException('Username already in use');
      }
    }

    Object.assign(existingUser, user);
    return this.usersRepository.save(existingUser);
  }

  async remove(id: string): Promise<void> {
    const result = await this.usersRepository.delete(id);
    if (!result.affected) {
      throw new NotFoundException('User not found');
    }
  }
}
