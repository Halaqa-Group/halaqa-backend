import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { ErrorEnvelope } from '../../auth/dto/auth.responses';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  GuardianView,
  StudentDetailEnvelope,
  StudentDetailView,
  StudentListEnvelope,
  StudentListResult,
} from '../dto/student.responses';
import { StudentGuardian } from '../entities/student-guardian.entity';
import { Student } from '../entities/student.entity';
import { StudentsService } from '../services/students.service';

@ApiTags('My Children')
@ApiBearerAuth('access-token')
@Controller('me/children')
@Roles('parent')
export class MyChildrenController {
  constructor(
    private readonly studentsService: StudentsService,
    @InjectRepository(StudentGuardian)
    private readonly sgRepo: Repository<StudentGuardian>,
    @InjectRepository(Student)
    private readonly studentRepo: Repository<Student>,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List own children (parent only)',
    description:
      'Returns all students for which the authenticated parent has a `student_guardians` entry. ' +
      '**Cross-school exception**: this is the only endpoint in the system that returns students from multiple schools. ' +
      'A parent\'s children may be enrolled at different schools, so the school-scope rule is intentionally bypassed here. ' +
      'Soft-deleted students are excluded. No pagination — returns all children in one response. ' +
      'Does NOT write an audit log.',
  })
  @ApiResponse({ status: 200, type: StudentListEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, description: 'Caller does not have the parent role', type: ErrorEnvelope })
  async list(@CurrentUser() actor: AuthenticatedUser): Promise<StudentListResult> {
    const rows = await this.studentRepo
      .createQueryBuilder('s')
      .where(
        's.deletedAt IS NULL AND s.id IN (' +
          'SELECT sg.student_id FROM student_guardians sg WHERE sg.guardian_user_id = :userId)',
        { userId: actor.id },
      )
      .orderBy('s.createdAt', 'DESC')
      .getManyAndCount();

    return {
      items: rows[0].map((s) => this.studentsService.toView(s)),
      total: rows[1],
      page: 1,
      limit: rows[1],
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a child by ID (parent only)',
    description:
      'Returns the full student record including all guardians. ' +
      'Returns **404** if the student does not exist or the caller is not linked to the student as a guardian — ' +
      'never 403, to avoid leaking student existence. ' +
      '**Cross-school exception**: parent may access a child in a different school than their own. ' +
      'Does NOT write an audit log.',
  })
  @ApiParam({ name: 'id', description: 'Student ID' })
  @ApiResponse({ status: 200, type: StudentDetailEnvelope })
  @ApiResponse({ status: 401, type: ErrorEnvelope })
  @ApiResponse({ status: 403, description: 'Caller does not have the parent role', type: ErrorEnvelope })
  @ApiResponse({ status: 404, description: 'Student not found or caller is not the student\'s guardian', type: ErrorEnvelope })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<StudentDetailView> {
    const student = await this.studentRepo.findOne({ where: { id } });
    if (!student) throw new NotFoundException();

    const isChild = await this.sgRepo.findOne({
      where: { studentId: id, guardianUserId: actor.id },
    });
    if (!isChild) throw new NotFoundException();

    const guardianLinks = await this.sgRepo.find({
      where: { studentId: id },
      relations: { guardian: true },
      order: { createdAt: 'ASC' },
    });

    const guardians: GuardianView[] = guardianLinks.map((sg) => ({
      user: {
        id: sg.guardian.id,
        name: sg.guardian.name,
        email: sg.guardian.email,
        phone: sg.guardian.phone,
      },
      relation: sg.relation,
      is_primary: !!sg.isPrimary,
      can_pickup: !!sg.canPickup,
    }));

    return { ...this.studentsService.toView(student), guardians };
  }
}
