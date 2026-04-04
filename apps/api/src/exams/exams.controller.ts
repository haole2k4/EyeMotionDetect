import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ExamsService } from './exams.service';
import { Exam } from './entities/exam.entity';

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.examsService.findOne(id);
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
