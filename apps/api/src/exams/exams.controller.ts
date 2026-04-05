import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { Exam } from './entities/exam.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
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
  findAssignedExams(@Request() req: any) {
    return this.examsService.findAssignedExams(req.user.id);
  }

  @Get('sessions/my')
  getMySessions(@Request() req: any) {
    return this.examsService.getMySessions(req.user.id);
  }

  @Get('sessions/:sessionId/active')
  getActiveSession(@Param('sessionId') sessionId: string, @Request() req: any) {
    return this.examsService.getSession(sessionId, req.user.id);
  }

  @Post('sessions/:sessionId/answer')
  submitAnswer(
    @Param('sessionId') sessionId: string,
    @Body() body: { questionId: string; selectedOption: string; dwellTimeMs: number },
    @Request() req: any,
  ) {
    return this.examsService.submitAnswer(sessionId, req.user.id, body.questionId, body.selectedOption, body.dwellTimeMs);
  }

  @Post('sessions/:sessionId/finish')
  finishExam(@Param('sessionId') sessionId: string, @Request() req: any) {
    return this.examsService.finishExam(sessionId, req.user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
  }

  @Post(':id/start')
  startExam(@Param('id') examId: string, @Request() req: any) {
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
  assignQuestions(@Param('id') id: string, @Body() body: { questionIds: string[] }) {
    return this.examsService.assignQuestions(id, body.questionIds);
  }

  @Post(':id/assign')
  assignUsers(@Param('id') id: string, @Body() body: { userIds: string[] }) {
    return this.examsService.assignUsers(id, body.userIds);
  }
}
