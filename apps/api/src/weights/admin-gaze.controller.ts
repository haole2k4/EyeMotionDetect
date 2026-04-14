import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WeightsService } from './weights.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';

@Controller('admin/gaze-data')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminGazeController {
  constructor(private readonly weightsService: WeightsService) {}

  @Get()
  async getGazeData(@Query('page') page = '1', @Query('limit') limit = '20') {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 20;
    return this.weightsService.getAdminGazeData(pageNum, limitNum);
  }

  @Delete(':userId')
  async deleteGazeData(@Param('userId') userId: string) {
    return this.weightsService.resetWeights(userId);
  }
}
