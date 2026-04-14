import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(username: string, email: string, pass: string) {
    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(pass, salt);

    const user = await this.usersService.create({
      username,
      email,
      passwordHash,
    });

    return this.login(user);
  }

  async validateUser(
    email: string,
    pass: string,
  ): Promise<Partial<User> | null> {
    const user = await this.usersService.findByEmail(email);
    if (user && (await bcrypt.compare(pass, user.passwordHash))) {
      const result: Partial<User> = { ...user };
      delete result.passwordHash;
      return result;
    }
    return null;
  }

  login(user: Partial<User>) {
    const payload = {
      username: user.username,
      email: user.email,
      sub: user.id,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }
}
