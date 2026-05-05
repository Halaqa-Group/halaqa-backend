import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { CreateStudentDto } from '../dto/create-student.dto';
import { GraduateStudentDto } from '../dto/graduate-student.dto';
import { ListStudentsQuery } from '../dto/list-students.query';
import { UpdateStudentDto } from '../dto/update-student.dto';
import { StudentScopeGuard } from '../guards/student-scope.guard';
import { StudentsService } from '../services/students.service';

@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  list(@Query() query: ListStudentsQuery, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.list(query, actor);
  }

  @Get(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'supervisor', 'teacher', 'parent')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.findOne(id, actor);
  }

  @Post()
  @Roles('principal', 'vice_principal')
  create(@Body() dto: CreateStudentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal', 'teacher')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const roles = actor.roles.map((r) => r.slug);
    const isTeacherOnly =
      roles.includes('teacher') &&
      !roles.includes('principal') &&
      !roles.includes('vice_principal');
    return this.service.update(id, dto, actor, isTeacherOnly);
  }

  @Delete(':id')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal')
  @HttpCode(204)
  softDelete(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.softDelete(id, actor);
  }

  @Post(':id/restore')
  @Roles('principal', 'vice_principal')
  restore(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.restore(id, actor);
  }

  @Post(':id/graduate')
  @UseGuards(StudentScopeGuard)
  @Roles('principal', 'vice_principal')
  graduate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GraduateStudentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.service.graduate(id, dto, actor);
  }
}
