import { BadRequestException, NotFoundException } from '@nestjs/common';
import { School } from './school.entity';
import { SchoolService } from './school.service';

const PRINCIPAL = {
  id: 1,
  schoolId: 10,
  roles: [{ slug: 'principal' }],
} as never;

function makeSchool(): School {
  return {
    id: 10,
    name: 'مدرسة الفرقان',
    address: 'الخليل',
    phone: '022221234',
    logoUrl: null,
    timezone: 'Asia/Hebron',
    status: 'active',
    settings: null,
  } as School;
}

function makeRepo(school: School | null) {
  return {
    findOne: jest.fn().mockResolvedValue(school),
    save: jest.fn().mockImplementation((e: School) => Promise.resolve(e)),
  };
}

function makeAudit() {
  return { log: jest.fn().mockResolvedValue(undefined) };
}

describe('SchoolService', () => {
  it('resolves the school from the actor token, never a caller-supplied id', async () => {
    const repo = makeRepo(makeSchool());
    const service = new SchoolService(repo as never, makeAudit() as never);

    await service.findForActor(10);

    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 10 } });
  });

  it('404s when the school row is missing', async () => {
    const service = new SchoolService(
      makeRepo(null) as never,
      makeAudit() as never,
    );

    await expect(service.findForActor(10)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('applies only the provided fields and trims them', async () => {
    const repo = makeRepo(makeSchool());
    const service = new SchoolService(repo as never, makeAudit() as never);

    const updated = await service.update(
      { name: '  مدرسة النور  ', status: 'inactive' },
      PRINCIPAL,
    );

    expect(updated.name).toBe('مدرسة النور');
    expect(updated.status).toBe('inactive');
    expect(updated.address).toBe('الخليل');
    expect(repo.save).toHaveBeenCalled();
  });

  it('stores blank address / phone as null', async () => {
    const repo = makeRepo(makeSchool());
    const service = new SchoolService(repo as never, makeAudit() as never);

    const updated = await service.update(
      { address: '', phone: '  ' },
      PRINCIPAL,
    );

    expect(updated.address).toBeNull();
    expect(updated.phone).toBeNull();
  });

  it('rejects a whitespace-only name', async () => {
    const service = new SchoolService(
      makeRepo(makeSchool()) as never,
      makeAudit() as never,
    );

    await expect(
      service.update({ name: '   ' }, PRINCIPAL),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('audits the update with before/after values', async () => {
    const audit = makeAudit();
    const service = new SchoolService(
      makeRepo(makeSchool()) as never,
      audit as never,
    );

    await service.update({ name: 'مدرسة النور' }, PRINCIPAL);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'school.update',
        entityType: 'school',
        entityId: 10,
        oldValues: expect.objectContaining({ name: 'مدرسة الفرقان' }),
        newValues: expect.objectContaining({ name: 'مدرسة النور' }),
      }),
    );
  });
});
