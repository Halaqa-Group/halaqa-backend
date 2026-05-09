import { Repository } from 'typeorm';
import { HalaqaActivityLog } from '../entities/halaqa-activity-log.entity';
import { HalaqaActivityLogService, LogParams } from './halaqa-activity-log.service';

function makeRepo() {
  return {
    create: jest.fn().mockImplementation((d: unknown) => ({ ...d as object })),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

function makeEm(repo = makeRepo()) {
  return {
    getRepository: jest.fn().mockReturnValue(repo),
    _repo: repo,
  };
}

function makeService(repo = makeRepo()) {
  return {
    service: new HalaqaActivityLogService(repo as unknown as Repository<HalaqaActivityLog>),
    repo,
  };
}

const BASE_PARAMS: LogParams = {
  schoolId: 1,
  halaqaId: 17,
  action: 'teacher_assigned',
  actorUserId: 5,
  targetUserId: 12,
};

describe('HalaqaActivityLogService', () => {
  describe('log()', () => {
    it('calls create() with all provided params mapped to entity fields', async () => {
      const { service, repo } = makeService();
      const params: LogParams = {
        ...BASE_PARAMS,
        targetStudentId: 42,
        fromHalaqaId: 10,
        toHalaqaId: 11,
        metadata: { reason: 'test' },
        notes: 'some note',
      };

      await service.log(params);

      expect(repo.create).toHaveBeenCalledWith({
        schoolId: 1,
        halaqaId: 17,
        action: 'teacher_assigned',
        actorUserId: 5,
        targetUserId: 12,
        targetStudentId: 42,
        fromHalaqaId: 10,
        toHalaqaId: 11,
        metadata: { reason: 'test' },
        notes: 'some note',
      });
    });

    it('maps omitted optional fields to null', async () => {
      const { service, repo } = makeService();

      await service.log({ schoolId: 1, action: 'halaqa_created' });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          halaqaId: null,
          actorUserId: null,
          targetUserId: null,
          targetStudentId: null,
          fromHalaqaId: null,
          toHalaqaId: null,
          metadata: null,
          notes: null,
        }),
      );
    });

    it('calls save() with the entity returned by create()', async () => {
      const repo = makeRepo();
      const fakeEntity = { schoolId: 1, action: 'halaqa_created', _tag: 'entity' };
      repo.create.mockReturnValue(fakeEntity);
      const { service } = makeService(repo);

      await service.log({ schoolId: 1, action: 'halaqa_created' });

      expect(repo.save).toHaveBeenCalledWith(fakeEntity);
    });

    it('uses the injected repo when no em is provided', async () => {
      const { service, repo } = makeService();

      await service.log(BASE_PARAMS);

      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledTimes(1);
    });

    it('uses em.getRepository() when em is provided, not the injected repo', async () => {
      const { service, repo: injectedRepo } = makeService();
      const emRepo = makeRepo();
      const em = makeEm(emRepo);

      await service.log(BASE_PARAMS, em as never);

      expect(em.getRepository).toHaveBeenCalledWith(HalaqaActivityLog);
      expect(emRepo.create).toHaveBeenCalledTimes(1);
      expect(emRepo.save).toHaveBeenCalledTimes(1);
      expect(injectedRepo.create).not.toHaveBeenCalled();
      expect(injectedRepo.save).not.toHaveBeenCalled();
    });

    it('passes explicitly-null optional fields through as null (not undefined)', async () => {
      const { service, repo } = makeService();

      await service.log({ ...BASE_PARAMS, halaqaId: null, metadata: null, notes: null });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ halaqaId: null, metadata: null, notes: null }),
      );
    });
  });
});
