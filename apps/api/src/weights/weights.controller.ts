import {
  Controller,
  Get,
  Put,
  Delete,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WeightsService } from './weights.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface CalibrationStatsBody {
  calibrationPoints?: number;
  lastMaePixels?: number | null;
  earThreshold?: number;
}

@Controller('weights')
@UseGuards(JwtAuthGuard)
export class WeightsController {
  constructor(private readonly weightsService: WeightsService) {}

  @Get('me')
  getWeightsMe(@Request() req) {
    return this.weightsService.getWeightsWithoutBin(req.user.id);
  }

  @Get()
  getWeights(@Request() req) {
    return this.weightsService.getWeights(req.user.id);
  }

  @Put('poly')
  updatePoly(@Request() req, @Body() body: any) {
    return this.weightsService.updatePoly(req.user.id, body);
  }

  @Put('mlp')
  updateMlp(@Request() req, @Body() body: any) {
    return this.weightsService.updateMlp(req.user.id, body);
  }

  @Put('stats')
  updateStats(@Request() req, @Body() body: CalibrationStatsBody) {
    return this.weightsService.updateCalibrationStats(req.user.id, body);
  }

  @Delete('me')
  resetWeightsMe(@Request() req) {
    return this.weightsService.resetWeights(req.user.id);
  }

  @Delete()
  resetWeights(@Request() req) {
    return this.weightsService.resetWeights(req.user.id);
  }
}
