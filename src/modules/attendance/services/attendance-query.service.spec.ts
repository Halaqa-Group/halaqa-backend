import { Repository } from 'typeorm';
import { StudentAttendance } from '../entities/student-attendance.entity';
import { AttendanceQueryService } from './attendance-query.service';

function build(findOneResult: Partial<StudentAttendance> | null) {
  const repo = {
    findOne: jest.fn().mockResolvedValue(findOneResult),
  } as unknown as Repository<StudentAttendance>;
  return new AttendanceQueryService(repo);
}

describe('AttendanceQueryService.findForStudentOnDate', () => {
  it('returns the stored row when present', async () => {
    const service = build({ id: 5, status: 'absent' });
    await expect(
      service.findForStudentOnDate(10, 3, '2026-07-07'),
    ).resolves.toEqual({
      id: 5,
      status: 'absent',
    });
  });

  it('treats a missing row as present so the achievements gate does not block', async () => {
    const service = build(null);
    await expect(
      service.findForStudentOnDate(10, 3, '2026-07-07'),
    ).resolves.toEqual({
      id: null,
      status: 'present',
    });
  });
});
