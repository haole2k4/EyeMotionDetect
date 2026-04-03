import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Put,
  Delete,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import * as bcrypt from 'bcryptjs';

type UserRole = 'admin' | 'user';

interface CreateUserBody {
  email: string;
  password: string;
  role?: UserRole;
}

interface UpdateUserBody {
  email?: string;
  password?: string;
  role?: UserRole;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  private ensureValidRole(role?: string) {
    if (role && role !== 'admin' && role !== 'user') {
      throw new BadRequestException('Role must be admin or user');
    }
  }

  @Get()
  @Roles('admin')
  async getAllUsers() {
    return this.usersService.findAllWithCalibration();
  }

  @Post()
  @Roles('admin')
  async createUser(@Body() body: CreateUserBody) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password are required');
    }

    this.ensureValidRole(body.role);

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(body.password, salt);
    const user = await this.usersService.create({
      email: body.email,
      passwordHash,
      role: body.role ?? 'user',
    });
    return { id: user.id, email: user.email, role: user.role };
  }

  @Put(':id')
  @Roles('admin')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserBody) {
    if (!body.email && !body.password && !body.role) {
      throw new BadRequestException('At least one field is required');
    }

    this.ensureValidRole(body.role);

    const updateData: { email?: string; role?: UserRole; passwordHash?: string } = {};

    if (body.email) {
      updateData.email = body.email;
    }

    if (body.role) {
      updateData.role = body.role;
    }

    if (body.password) {
      const salt = await bcrypt.genSalt();
      updateData.passwordHash = await bcrypt.hash(body.password, salt);
    }

    const user = await this.usersService.update(id, updateData);
    return { id: user.id, email: user.email, role: user.role };
  }

  @Delete(':id')
  @Roles('admin')
  async deleteUser(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { success: true };
  }
}
