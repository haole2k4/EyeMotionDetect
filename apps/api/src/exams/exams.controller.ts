import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ExamsService } from './exams.service';
import { Exam } from './entities/exam.entity';
import { GazeHeatmapPoint } from './entities/exam-session.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/roles.guard';
import type { RequestWithUser } from '../auth/interfaces/request-with-user.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exams')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Post()
  create(@Body() createExamDto: Partial<Exam>) {
    return this.examsService.create(createExamDto);
  }

  @Get()
  findAll() {
    return this.examsService.findAll();
  }

  @Get('user/assigned')
  findAssignedExams(@Request() req: RequestWithUser) {
    return this.examsService.findAssignedExams(req.user.id);
  }

  @Get('sessions/my')
  getMySessions(@Request() req: RequestWithUser) {
    return this.examsService.getMySessions(req.user.id);
  }

  @Get('sessions/:sessionId/active')
  getActiveSession(
    @Param('sessionId') sessionId: string,
    @Request() req: RequestWithUser,
  ) {
    return this.examsService.getSession(sessionId, req.user.id);
  }

  @Post('sessions/:sessionId/answer')
  submitAnswer(
    @Param('sessionId') sessionId: string,
    @Body()
    body: { questionId: string; selectedOption: string; dwellTimeMs: number },
    @Request() req: RequestWithUser,
  ) {
    return this.examsService.submitAnswer(
      sessionId,
      req.user.id,
      body.questionId,
      body.selectedOption,
      body.dwellTimeMs,
    );
  }

  @Post('sessions/:sessionId/finish')
  finishExam(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      gazeHeatmap?: GazeHeatmapPoint[];
      faceLossPauseCount?: number;
    },
    @Request() req: RequestWithUser,
  ) {
    return this.examsService.finishExam(sessionId, req.user.id, body);
  }

  @Put('sessions/:sessionId/telemetry')
  updateTelemetry(
    @Param('sessionId') sessionId: string,
    @Body()
    body: {
      gazeHeatmap?: GazeHeatmapPoint[];
      faceLossPauseCount?: number;
    },
    @Request() req: RequestWithUser,
  ) {
    return this.examsService.updateTelemetry(sessionId, req.user.id, body);
  }

  @Get('sessions/:sessionId/heatmap')
  @Roles('admin')
  getSessionHeatmap(@Param('sessionId') sessionId: string) {
    return this.examsService.getSessionHeatmap(sessionId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
  }

  @Post(':id/start')
  startExam(@Param('id') examId: string, @Request() req: RequestWithUser) {
    return this.examsService.startExam(examId, req.user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateExamDto: Partial<Exam>) {
    return this.examsService.update(id, updateExamDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.examsService.remove(id);
  }

  @Post(':id/questions')
  assignQuestions(
    @Param('id') id: string,
    @Body() body: { questionIds: string[] },
  ) {
    return this.examsService.assignQuestions(id, body.questionIds);
  }

  @Post(':id/assign')
  assignUsers(@Param('id') id: string, @Body() body: { userIds: string[] }) {
    return this.examsService.assignUsers(id, body.userIds);
  }
}
