import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(user: Partial<User>): Promise<User> {
    if (!user.email) throw new ConflictException('Email required');
    const existing = await this.findByEmail(user.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }
    const newUser = this.usersRepository.create(user);
    return this.usersRepository.save(newUser);
  }
}
