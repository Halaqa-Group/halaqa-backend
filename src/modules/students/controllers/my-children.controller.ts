import { Controller, Get, NotFoundException, Param, ParseIntPipe } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { GuardianView, StudentDetailView, StudentListResult } from '../dto/student.responses';
import { StudentGuardian } from '../entities/student-guardian.entity';
import { Student } from '../entities/student.entity';
import { StudentsService } from '../services/students.service';

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
