import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

// App startup (DB connect + DevSeeder) can take > 5 s in CI
jest.setTimeout(60_000);

// ── helpers ───────────────────────────────────────────────────────────────────

async function createTestApp(): Promise<INestApplication> {
  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());
  await app.init();
  return app;
}

async function loginAs(
  app: INestApplication,
  email: string,
  password = 'Passw0rd!',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ email, password })
    .expect(200);
  return res.body.data.accessToken as string;
}

interface StudentPayload {
  first_name: string;
  second_name: string;
  third_name: string;
  family_name: string;
  gender: 'male' | 'female';
  join_date: string;
  id_number?: string;
}

/**
 * All four name parts are required. Tests vary only the first name (it carries
 * the unique RUN tag); the rest are fixed so the derived `name` is predictable.
 */
function nameParts(first: string) {
  return {
    first_name: first,
    second_name: 'ثاني',
    third_name: 'ثالث',
    family_name: 'العائلة',
  };
}

/** The `name` the database derives for a payload built by {@link nameParts}. */
function fullName(first: string): string {
  return `${first} ثاني ثالث العائلة`;
}

function post(app: INestApplication, token: string, body: StudentPayload) {
  return request(app.getHttpServer())
    .post('/api/students')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

function get(app: INestApplication, token: string, id: number) {
  return request(app.getHttpServer())
    .get(`/api/students/${id}`)
    .set('Authorization', `Bearer ${token}`);
}

function patch(app: INestApplication, token: string, id: number, body: object) {
  return request(app.getHttpServer())
    .patch(`/api/students/${id}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

// Hard-delete test fixtures so id_number slots are truly freed between runs.
// The uniqueness check uses withDeleted:true, so soft-delete is not enough.
async function hardDelete(ds: DataSource, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  // Remove audit rows first (FK safety in case of cascade)
  await ds.query(
    `DELETE FROM audit_logs WHERE entity_type = 'student' AND entity_id IN (${ids.map(() => '?').join(',')})`,
    ids.map(String),
  );
  await ds.query(
    `DELETE FROM students WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids,
  );
}

// Run ID makes student names unique across concurrent CI jobs.
const RUN = `e2e-${Date.now()}`;

/*
 * Valid Palestinian IDs used per suite (checksum verified):
 *   100000009  — POST suite
 *   555555556  — POST suite (principal create)
 *   666666664  — POST suite (VP create)
 *   111111118  — visibility suite
 *   222222226  — filter suite
 *   333333334  — search suite
 *   444444442  — lock/PATCH suite
 *
 * Checksum formula: sum of d[i]*[1,2,1,2,1,2,1,2]; check = (10 - sum%10)%10
 */

// ── suite ─────────────────────────────────────────────────────────────────────

describe('Students (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  let principalToken: string;
  let vpToken: string;
  let supervisorToken: string;
  let teacherToken: string;
  let parentToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);

    [principalToken, vpToken, supervisorToken, teacherToken, parentToken] =
      await Promise.all([
        loginAs(app, 'principal@school.com'),
        loginAs(app, 'vp@school.com'),
        loginAs(app, 'supervisor@school.com'),
        loginAs(app, 'teacher@school.com'),
        loginAs(app, 'parent@school.com'),
      ]);
  });

  afterAll(async () => {
    await app.close();
  });

  // ── POST /api/students ────────────────────────────────────────────────────

  describe('POST /api/students', () => {
    const ids: number[] = [];

    afterAll(() => hardDelete(ds, ids));

    it('201 — principal creates a student', async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-basic`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '555555556',
      });
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        first_name: `${RUN}-basic`,
        name: fullName(`${RUN}-basic`),
        gender: 'male',
      });
      ids.push(res.body.data.id as number);
    });

    it('201 — VP creates a student', async () => {
      const res = await post(app, vpToken, {
        ...nameParts(`${RUN}-by-vp`),
        gender: 'female',
        join_date: '2024-09-01',
        id_number: '666666664',
      });
      expect(res.status).toBe(201);
      ids.push(res.body.data.id as number);
    });

    it('403 — teacher cannot create a student', async () => {
      const res = await post(app, teacherToken, {
        ...nameParts(`${RUN}-by-teacher`),
        gender: 'male',
        join_date: '2024-09-01',
      });
      expect(res.status).toBe(403);
    });

    it('403 — parent cannot create a student', async () => {
      const res = await post(app, parentToken, {
        ...nameParts(`${RUN}-by-parent`),
        gender: 'male',
        join_date: '2024-09-01',
      });
      expect(res.status).toBe(403);
    });

    it('403 — supervisor cannot create a student', async () => {
      const res = await post(app, supervisorToken, {
        ...nameParts(`${RUN}-by-supervisor`),
        gender: 'male',
        join_date: '2024-09-01',
      });
      expect(res.status).toBe(403);
    });

    it('400 — missing required field (gender)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/students')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({ ...nameParts(`${RUN}-no-gender`), join_date: '2024-09-01' });
      expect(res.status).toBe(400);
    });

    it('400 — missing required field (id_number)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/students')
        .set('Authorization', `Bearer ${principalToken}`)
        .send({
          ...nameParts(`${RUN}-no-id`),
          gender: 'male',
          join_date: '2024-09-01',
        });
      expect(res.status).toBe(400);
    });

    it('401 — unauthenticated request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/students')
        .send({
          ...nameParts(`${RUN}-unauth`),
          gender: 'male',
          join_date: '2024-09-01',
        });
      expect(res.status).toBe(401);
    });

    // id_number ---------------------------------------------------------------

    it('201 — valid 9-digit id_number, no warnings', async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-valid-id`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '100000009',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.id_number).toBe('100000009');
      expect(res.body.warnings).toBeUndefined();
      ids.push(res.body.data.id as number);
    });

    it('201 — bad checksum → stored with warnings in envelope', async () => {
      // 100000000: correct check digit is 9, not 0 → checksum_invalid warning
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-bad-csum`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '100000000',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.id_number).toBe('100000000');
      expect(res.body.warnings).toEqual(['checksum_invalid']);
      ids.push(res.body.data.id as number);
    });

    it('201 — Arabic-Indic digits normalized before storage', async () => {
      // ٣٠٠١٢٣٤٥٢ → 300123452 (valid checksum per validator spec)
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-arabic`),
        gender: 'female',
        join_date: '2024-09-01',
        id_number: '٣٠٠١٢٣٤٥٢',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.id_number).toBe('300123452');
      expect(res.body.warnings).toBeUndefined();
      ids.push(res.body.data.id as number);
    });

    it('400 — 8-digit id_number is rejected (format invalid)', async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-8digit`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '12345678',
      });
      expect(res.status).toBe(400);
    });

    it('409 — duplicate id_number in the same school', async () => {
      const first = await post(app, principalToken, {
        ...nameParts(`${RUN}-dup-a`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '200000002',
      });
      expect(first.status).toBe(201);
      ids.push(first.body.data.id as number);

      const second = await post(app, principalToken, {
        ...nameParts(`${RUN}-dup-b`),
        gender: 'female',
        join_date: '2024-09-01',
        id_number: '200000002',
      });
      expect(second.status).toBe(409);
    });
  });

  // ── GET /api/students/:id — id_number visibility ──────────────────────────

  describe('GET /api/students/:id — id_number visibility per role', () => {
    let studentId: number;

    beforeAll(async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-vis`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '111111118',
      });
      expect(res.status).toBe(201);
      studentId = res.body.data.id as number;
    });

    afterAll(() => hardDelete(ds, [studentId]));

    it('principal — id_number key present', async () => {
      const res = await get(app, principalToken, studentId).expect(200);
      expect(res.body.data).toHaveProperty('id_number', '111111118');
    });

    it('VP — id_number key present', async () => {
      const res = await get(app, vpToken, studentId).expect(200);
      expect(res.body.data).toHaveProperty('id_number', '111111118');
    });

    it('supervisor — 404 (no shared halaqa → out of scope)', async () => {
      await get(app, supervisorToken, studentId).expect(404);
    });

    it('teacher — 404 (no shared halaqa → out of scope)', async () => {
      await get(app, teacherToken, studentId).expect(404);
    });

    it('parent — 404 (no guardian link → out of scope)', async () => {
      await get(app, parentToken, studentId).expect(404);
    });

    it('404 for non-existent student ID', async () => {
      await request(app.getHttpServer())
        .get('/api/students/999999999')
        .set('Authorization', `Bearer ${principalToken}`)
        .expect(404);
    });
  });

  // ── PATCH /api/students/:id — id_number lock mechanics ───────────────────

  describe('PATCH /api/students/:id — id_number lock', () => {
    let studentId: number;

    beforeAll(async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-lock`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '444444442',
      });
      expect(res.status).toBe(201);
      studentId = res.body.data.id as number;
    });

    afterAll(() => hardDelete(ds, [studentId]));

    it('400 — changing a set id_number without force_id_number_change', async () => {
      const res = await patch(app, principalToken, studentId, {
        id_number: '333333334',
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/locked/i);
    });

    it('400 — clearing id_number (null) without force_id_number_change', async () => {
      const res = await patch(app, principalToken, studentId, {
        id_number: null,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/locked/i);
    });

    it('400 — invalid format with force flag (8 digits)', async () => {
      const res = await patch(app, principalToken, studentId, {
        id_number: '12345678',
        force_id_number_change: true,
      });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/format/i);
    });

    it('200 — changing id_number with force flag emits two audit rows', async () => {
      const res = await patch(app, principalToken, studentId, {
        id_number: '222222226',
        force_id_number_change: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.id_number).toBe('222222226');

      const rows: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity_type = 'student' AND entity_id = ? ORDER BY created_at DESC LIMIT 5`,
        [String(studentId)],
      );
      const actions = rows.map((r) => r.action);
      expect(actions).toContain('student.update');
      expect(actions).toContain('student.id_number.force_changed');
    });

    it('200 — bad-checksum value returns warnings in envelope', async () => {
      // Current: 222222226 (valid). Change to 100000000 (bad checksum) with force.
      const res = await patch(app, principalToken, studentId, {
        id_number: '100000000',
        force_id_number_change: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.warnings).toEqual(['checksum_invalid']);
      expect(res.body.data.id_number).toBe('100000000');
    });

    it('409 — conflict: another student already owns the target id_number', async () => {
      // Create a sibling student with 333333334 to cause the conflict
      const sibling = await post(app, principalToken, {
        ...nameParts(`${RUN}-sibling`),
        gender: 'female',
        join_date: '2024-09-01',
        id_number: '333333334',
      });
      expect(sibling.status).toBe(201);
      const siblingId = sibling.body.data.id as number;

      const res = await patch(app, principalToken, studentId, {
        id_number: '333333334',
        force_id_number_change: true,
      });
      expect(res.status).toBe(409);

      await hardDelete(ds, [siblingId]);
    });

    it('200 — clearing id_number with force_id_number_change: true', async () => {
      // Current value is 100000000 after previous tests
      const res = await patch(app, principalToken, studentId, {
        id_number: null,
        force_id_number_change: true,
      });
      expect(res.status).toBe(200);
      expect(res.body.data.id_number).toBeNull();
    });
  });

  // ── GET /api/students?id_number= — id_number filter ──────────────────────

  describe('GET /api/students?id_number= — id_number filter', () => {
    let studentId: number;

    beforeAll(async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-filter`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '222222226',
      });
      expect(res.status).toBe(201);
      studentId = res.body.data.id as number;
    });

    afterAll(() => hardDelete(ds, [studentId]));

    it('200 — principal can filter by id_number', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/students?id_number=222222226')
        .set('Authorization', `Bearer ${principalToken}`)
        .expect(200);
      const found = (res.body.data.items as { id: number }[]).some(
        (s) => s.id === studentId,
      );
      expect(found).toBe(true);
    });

    it('200 — principal list items include id_number field', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/students?id_number=222222226')
        .set('Authorization', `Bearer ${principalToken}`)
        .expect(200);
      const match = (
        res.body.data.items as { id: number; id_number?: string }[]
      ).find((s) => s.id === studentId);
      expect(match).toBeDefined();
      expect(match!.id_number).toBe('222222226');
    });

    it('200 — supervisor can filter by id_number (scope limits results)', async () => {
      await request(app.getHttpServer())
        .get('/api/students?id_number=222222226')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
    });

    it('200 — teacher can filter by id_number (scope limits results)', async () => {
      await request(app.getHttpServer())
        .get('/api/students?id_number=222222226')
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(200);
    });
  });

  // ── GET /api/students?q= — search branching ───────────────────────────────

  describe('GET /api/students?q= — search by id_number vs name', () => {
    let studentId: number;

    beforeAll(async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-srch`),
        gender: 'male',
        join_date: '2024-09-01',
        id_number: '333333334',
      });
      expect(res.status).toBe(201);
      studentId = res.body.data.id as number;
    });

    afterAll(() => hardDelete(ds, [studentId]));

    it('principal: searching id_number via q returns the student', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/students?q=333333334')
        .set('Authorization', `Bearer ${principalToken}`)
        .expect(200);
      const found = (res.body.data.items as { id: number }[]).some(
        (s) => s.id === studentId,
      );
      expect(found).toBe(true);
    });

    it('principal: searching by name returns the student', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/students?q=${encodeURIComponent(`${RUN}-srch`)}`)
        .set('Authorization', `Bearer ${principalToken}`)
        .expect(200);
      const found = (res.body.data.items as { id: number }[]).some(
        (s) => s.id === studentId,
      );
      expect(found).toBe(true);
    });

    it('supervisor: searching by id_number via q does NOT return the out-of-scope student', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/students?q=333333334')
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(200);
      const found = (res.body.data.items as { id: number }[]).some(
        (s) => s.id === studentId,
      );
      // Supervisor is not in any halaqa with this student → out of scope regardless of q
      expect(found).toBe(false);
    });
  });

  // ── Soft-delete / restore / graduate lifecycle ────────────────────────────

  describe('Lifecycle: delete, restore, graduate', () => {
    let studentId: number;

    beforeAll(async () => {
      const res = await post(app, principalToken, {
        ...nameParts(`${RUN}-lifecycle`),
        gender: 'female',
        join_date: '2024-09-01',
        id_number: '777777778',
      });
      expect(res.status).toBe(201);
      studentId = res.body.data.id as number;
    });

    afterAll(() => hardDelete(ds, [studentId]));

    it('403 — teacher cannot delete a student', async () => {
      await request(app.getHttpServer())
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .expect(403);
    });

    it('403 — supervisor cannot delete a student', async () => {
      await request(app.getHttpServer())
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${supervisorToken}`)
        .expect(403);
    });

    it('204 — principal soft-deletes the student', async () => {
      await request(app.getHttpServer())
        .delete(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${principalToken}`)
        .expect(204);
    });

    it('404 — soft-deleted student not visible via GET', async () => {
      await get(app, principalToken, studentId).expect(404);
    });

    it('200 — principal restores the student', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/students/${studentId}/restore`)
        .set('Authorization', `Bearer ${principalToken}`)
        .expect(200);
      expect(res.body.data.id).toBe(studentId);
    });

    it('200 — principal graduates the student', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/students/${studentId}/graduate`)
        .set('Authorization', `Bearer ${principalToken}`)
        .send({ graduation_date: '2025-06-01', notes: 'Completed Quran.' })
        .expect(200);
      expect(res.body.data.status).toBe('graduated');
    });

    it('400 — graduating an already-graduated student', async () => {
      await request(app.getHttpServer())
        .post(`/api/students/${studentId}/graduate`)
        .set('Authorization', `Bearer ${principalToken}`)
        .send({})
        .expect(400);
    });

    it('audit row student.create written on POST', async () => {
      const rows: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity_type = 'student' AND entity_id = ? AND action = 'student.create' LIMIT 1`,
        [String(studentId)],
      );
      expect(rows.length).toBe(1);
    });

    it('audit row student.graduate written on graduate', async () => {
      const rows: { action: string }[] = await ds.query(
        `SELECT action FROM audit_logs WHERE entity_type = 'student' AND entity_id = ? AND action = 'student.graduate' LIMIT 1`,
        [String(studentId)],
      );
      expect(rows.length).toBe(1);
    });
  });
});
