import { IsDateString, IsOptional, Matches, validate } from 'class-validator';
import { ActingSubstituteDto } from '../../modules/halaqat/dto/acting-substitute.dto';
import { ScheduleEntryDto } from '../../modules/halaqat/dto/create-halaqa.dto';
import { SetActingDto } from '../../modules/halaqat/dto/set-acting.dto';
import { IsAfterField } from './is-after-field.decorator';

// ─── Minimal test classes ─────────────────────────────────────────────────────

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;

class TimeRangeDto {
  @IsOptional()
  @Matches(TIME_RE)
  start_time?: string;

  @IsOptional()
  @Matches(TIME_RE)
  @IsAfterField('start_time')
  end_time?: string;
}

class TimeRangeCustomMessageDto {
  @IsOptional()
  start_time?: string;

  @IsOptional()
  @IsAfterField('start_time', { message: 'end must come after start' })
  end_time?: string;
}

class DateRangeDto {
  @IsDateString()
  starts_at!: string;

  @IsDateString()
  @IsAfterField('starts_at')
  ends_at!: string;
}

function make<T extends object>(Cls: new () => T, fields: Partial<T>): T {
  return Object.assign(new Cls(), fields);
}

// ─── Decorator unit tests ─────────────────────────────────────────────────────

describe('@IsAfterField', () => {
  describe('time strings', () => {
    it('passes when end_time is strictly after start_time', async () => {
      const errors = await validate(
        make(TimeRangeDto, { start_time: '05:00:00', end_time: '06:00:00' }),
      );
      expect(errors).toHaveLength(0);
    });

    it('fails when end_time is before start_time', async () => {
      const errors = await validate(
        make(TimeRangeDto, { start_time: '06:00:00', end_time: '05:00:00' }),
      );
      const endErrors = errors.find((e) => e.property === 'end_time');
      expect(endErrors?.constraints).toHaveProperty('isAfterField');
    });

    it('fails when end_time equals start_time', async () => {
      const errors = await validate(
        make(TimeRangeDto, { start_time: '05:00:00', end_time: '05:00:00' }),
      );
      const endErrors = errors.find((e) => e.property === 'end_time');
      expect(endErrors?.constraints).toHaveProperty('isAfterField');
    });
  });

  describe('date strings', () => {
    it('passes when ends_at is strictly after starts_at', async () => {
      const errors = await validate(
        make(DateRangeDto, { starts_at: '2026-05-10', ends_at: '2026-05-20' }),
      );
      expect(errors).toHaveLength(0);
    });

    it('fails when ends_at is before starts_at', async () => {
      const errors = await validate(
        make(DateRangeDto, { starts_at: '2026-05-20', ends_at: '2026-05-10' }),
      );
      const endErrors = errors.find((e) => e.property === 'ends_at');
      expect(endErrors?.constraints).toHaveProperty('isAfterField');
    });

    it('fails when ends_at equals starts_at', async () => {
      const errors = await validate(
        make(DateRangeDto, { starts_at: '2026-05-10', ends_at: '2026-05-10' }),
      );
      const endErrors = errors.find((e) => e.property === 'ends_at');
      expect(endErrors?.constraints).toHaveProperty('isAfterField');
    });
  });

  describe('optional sibling behaviour', () => {
    it('passes when sibling (start_time) is absent', async () => {
      const errors = await validate(make(TimeRangeDto, { end_time: '05:00:00' }));
      expect(errors).toHaveLength(0);
    });

    it('passes when decorated field (end_time) is absent', async () => {
      const errors = await validate(make(TimeRangeDto, { start_time: '05:00:00' }));
      expect(errors).toHaveLength(0);
    });

    it('passes when both fields are absent', async () => {
      const errors = await validate(make(TimeRangeDto, {}));
      expect(errors).toHaveLength(0);
    });
  });

  describe('messages', () => {
    it('uses the default message when none is supplied', async () => {
      const errors = await validate(
        make(TimeRangeDto, { start_time: '06:00:00', end_time: '05:00:00' }),
      );
      const endErrors = errors.find((e) => e.property === 'end_time');
      expect(endErrors?.constraints?.isAfterField).toBe('end_time must be after start_time');
    });

    it('honors a custom message', async () => {
      const errors = await validate(
        make(TimeRangeCustomMessageDto, { start_time: '06:00:00', end_time: '05:00:00' }),
      );
      const endErrors = errors.find((e) => e.property === 'end_time');
      expect(endErrors?.constraints?.isAfterField).toBe('end must come after start');
    });
  });

  // ─── DTO integration ────────────────────────────────────────────────────────

  describe('ScheduleEntryDto integration', () => {
    function schedule(fields: Record<string, unknown>) {
      return Object.assign(new ScheduleEntryDto(), { day_of_week: 0, ...fields });
    }

    it('passes when end_time is after start_time', async () => {
      const errors = await validate(schedule({ start_time: '05:00:00', end_time: '06:00:00' }));
      expect(errors).toHaveLength(0);
    });

    it('fails when end_time is before start_time', async () => {
      const errors = await validate(schedule({ start_time: '06:00:00', end_time: '05:00:00' }));
      const err = errors.find((e) => e.property === 'end_time');
      expect(err?.constraints).toHaveProperty('isAfterField');
    });

    it('fails when end_time equals start_time', async () => {
      const errors = await validate(schedule({ start_time: '05:00:00', end_time: '05:00:00' }));
      const err = errors.find((e) => e.property === 'end_time');
      expect(err?.constraints).toHaveProperty('isAfterField');
    });

    it('passes when start_time is absent and end_time is present', async () => {
      const errors = await validate(schedule({ end_time: '06:00:00' }));
      expect(errors).toHaveLength(0);
    });
  });

  describe('SetActingDto integration', () => {
    function acting(fields: Record<string, unknown>) {
      return Object.assign(new SetActingDto(), fields);
    }

    it('passes when acting_ends_at is after acting_starts_at', async () => {
      const errors = await validate(acting({ acting_starts_at: '2026-05-10', acting_ends_at: '2026-05-20' }));
      expect(errors).toHaveLength(0);
    });

    it('fails when acting_ends_at is before acting_starts_at', async () => {
      const errors = await validate(acting({ acting_starts_at: '2026-05-20', acting_ends_at: '2026-05-10' }));
      const err = errors.find((e) => e.property === 'acting_ends_at');
      expect(err?.constraints).toHaveProperty('isAfterField');
    });

    it('fails when acting_ends_at equals acting_starts_at', async () => {
      const errors = await validate(acting({ acting_starts_at: '2026-05-10', acting_ends_at: '2026-05-10' }));
      const err = errors.find((e) => e.property === 'acting_ends_at');
      expect(err?.constraints).toHaveProperty('isAfterField');
    });
  });

  describe('ActingSubstituteDto integration', () => {
    function sub(fields: Record<string, unknown>) {
      return Object.assign(new ActingSubstituteDto(), { teacher_user_id: 18, ...fields });
    }

    it('passes when acting_ends_at is after acting_starts_at', async () => {
      const errors = await validate(sub({ acting_starts_at: '2026-05-10', acting_ends_at: '2026-05-20' }));
      expect(errors).toHaveLength(0);
    });

    it('fails when acting_ends_at is before acting_starts_at', async () => {
      const errors = await validate(sub({ acting_starts_at: '2026-05-20', acting_ends_at: '2026-05-10' }));
      const err = errors.find((e) => e.property === 'acting_ends_at');
      expect(err?.constraints).toHaveProperty('isAfterField');
    });

    it('fails when acting_ends_at equals acting_starts_at', async () => {
      const errors = await validate(sub({ acting_starts_at: '2026-05-10', acting_ends_at: '2026-05-10' }));
      const err = errors.find((e) => e.property === 'acting_ends_at');
      expect(err?.constraints).toHaveProperty('isAfterField');
    });
  });
});
