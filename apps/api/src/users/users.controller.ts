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
  Request,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User, AccessibilityProfile } from './user.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';
import * as bcrypt from 'bcryptjs';

type UserRole = 'admin' | 'user';

interface CreateUserBody {
  username: string;
  email: string;
  password: string;
  role?: UserRole;
  accessibilityProfile?: Partial<AccessibilityProfile>;
}

interface UpdateUserBody {
  username?: string;
  email?: string;
  password?: string;
  role?: UserRole;
  accessibilityProfile?: Partial<AccessibilityProfile>;
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

  @Get('me')
  async getMyProfile(@Request() req: RequestWithUser) {
    const user = await this.usersService.findByIdWithCalibration(req.user.id);
    if (!user) throw new BadRequestException('User not found');
    const result: Partial<User> = { ...user };
    delete result.passwordHash;
    return result;
  }

  @Get('me/accessibility')
  async getMyAccessibility(@Request() req: RequestWithUser) {
    const user = await this.usersService.findById(req.user.id);
    if (!user) throw new BadRequestException('User not found');
    return (
      user.accessibilityProfile ?? {
        dominantEye: 'both',
        triggerMode: 'blink',
        dwellTimeMs: 900,
        blinkDurationMs: 350,
        ttsEnabled: true,
        magneticStrength: 0.8,
      }
    );
  }

  @Put('me/accessibility')
  async updateMyAccessibility(
    @Request() req: RequestWithUser,
    @Body() body: Partial<AccessibilityProfile>,
  ) {
    return this.usersService.updateAccessibility(req.user.id, body);
  }

  @Put('me')
  async updateMyProfile(
    @Request() req: RequestWithUser,
    @Body() body: UpdateUserBody,
  ) {
    if (
      !body.username &&
      !body.email &&
      !body.password &&
      !body.accessibilityProfile
    ) {
      throw new BadRequestException('At least one field is required');
    }

    const updateData: {
      username?: string;
      email?: string;
      passwordHash?: string;
      accessibilityProfile?: any;
    } = {};

    if (body.username) updateData.username = body.username;
    if (body.email) updateData.email = body.email;
    if (body.password) {
      const salt = await bcrypt.genSalt();
      updateData.passwordHash = await bcrypt.hash(body.password, salt);
    }
    if (body.accessibilityProfile) {
      updateData.accessibilityProfile = body.accessibilityProfile;
    }
    const user = await this.usersService.update(req.user.id, updateData);
    if (!user) throw new BadRequestException('User not found');
    const result: Partial<User> = { ...user };
    delete result.passwordHash;
    return result;
  }

  @Post()
  @Roles('admin')
  async createUser(@Body() body: CreateUserBody) {
    if (!body.username || !body.email || !body.password) {
      throw new BadRequestException(
        'Username, email and password are required',
      );
    }

    this.ensureValidRole(body.role);

    const salt = await bcrypt.genSalt();
    const passwordHash = await bcrypt.hash(body.password, salt);
    const user = await this.usersService.create({
      username: body.username,
      email: body.email,
      passwordHash,
      role: body.role ?? 'user',
    });
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
  }

  @Put(':id')
  @Roles('admin')
  async updateUser(@Param('id') id: string, @Body() body: UpdateUserBody) {
    if (
      !body.username &&
      !body.email &&
      !body.password &&
      !body.role &&
      !body.accessibilityProfile
    ) {
      throw new BadRequestException('At least one field is required');
    }

    this.ensureValidRole(body.role);

    const updateData: {
      username?: string;
      email?: string;
      role?: UserRole;
      passwordHash?: string;
      accessibilityProfile?: any;
    } = {};

    if (body.username) {
      updateData.username = body.username;
    }

    if (body.email) {
      updateData.email = body.email;
    }

    if (body.role) {
      updateData.role = body.role;
    }

    if (body.accessibilityProfile) {
      updateData.accessibilityProfile = body.accessibilityProfile;
    }

    if (body.password) {
      const salt = await bcrypt.genSalt();
      updateData.passwordHash = await bcrypt.hash(body.password, salt);
    }

    const user = await this.usersService.update(id, updateData);
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      accessibilityProfile: user.accessibilityProfile ?? null,
    };
  }

  @Put(':id/accessibility')
  @Roles('admin')
  async updateUserAccessibility(
    @Param('id') id: string,
    @Body() body: Partial<AccessibilityProfile>,
  ) {
    return this.usersService.updateAccessibility(id, body);
  }

  @Delete(':id')
  @Roles('admin')
  async deleteUser(@Param('id') id: string) {
    await this.usersService.remove(id);
    return { success: true };
  }
}
