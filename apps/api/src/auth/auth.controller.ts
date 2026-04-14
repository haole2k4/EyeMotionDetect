import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  Get,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { RequestWithUser } from './interfaces/request-with-user.interface';

interface AuthBody {
  username?: string;
  email: string;
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  async register(@Body() body: AuthBody) {
    if (!body.username || !body.email || !body.password) {
      throw new UnauthorizedException('Username, email and password required');
    }
    return this.authService.register(body.username, body.email, body.password);
  }

  @Post('login')
  async login(@Body() body: AuthBody) {
    const user = await this.authService.validateUser(body.email, body.password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.authService.login(user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: RequestWithUser) {
    return req.user;
  }
}
