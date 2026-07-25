import { DomainEvents } from '../../../common/events/domain-events';
import { HistoricalRecalcListener } from './historical-recalc.listener';

function build(opts: {
  header?: Record<string, unknown> | null;
  evalRows?: { halaqaId: number }[];
  halaqa?: Record<string, unknown> | null;
}) {
  const events = new DomainEvents();
  const reports = { persistDay: jest.fn().mockResolvedValue(undefined) };
  const headers = {
    findOne: jest.fn().mockResolvedValue(opts.header ?? null),
  };
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['innerJoin', 'select', 'where', 'andWhere'])
    qb[m] = jest.fn(() => qb);
  qb.getRawMany = jest.fn().mockResolvedValue(opts.evalRows ?? []);
  const evaluations = { createQueryBuilder: jest.fn(() => qb) };
  const halaqat = {
    findOne: jest.fn().mockResolvedValue(opts.halaqa ?? { id: 10 }),
  };
  const listener = new HistoricalRecalcListener(
    events,
    reports as never,
    headers as never,
    evaluations as never,
    halaqat as never,
  );
  return { listener, events, reports, headers, halaqat };
}

const flush = () => new Promise((r) => setImmediate(r));

describe('HistoricalRecalcListener', () => {
  it('recalculates when a snapshot exists for (halaqa, date)', async () => {
    const { listener, reports } = build({ header: { id: 1 } });
    await listener.handle({ halaqaId: 10, date: '2020-01-06' });
    expect(reports.persistDay).toHaveBeenCalledWith(
      { id: 10 },
      '2020-01-06',
      null,
      'auto: source data changed',
    );
  });

  it('does nothing when no snapshot exists (current-week days are live)', async () => {
    const { listener, reports } = build({ header: null });
    await listener.handle({ halaqaId: 10, date: '2026-07-20' });
    expect(reports.persistDay).not.toHaveBeenCalled();
  });

  it('resolves affected halaqat from a student edit', async () => {
    const { listener, reports } = build({ evalRows: [{ halaqaId: 10 }] });
    await listener.handle({ studentId: 55, date: '2020-01-06' });
    expect(reports.persistDay).toHaveBeenCalledTimes(1);
  });

  it('swallows recalc errors (never breaks the caller)', async () => {
    const { listener, reports } = build({ header: { id: 1 } });
    reports.persistDay.mockRejectedValueOnce(new Error('x'));
    await expect(
      listener.handle({ halaqaId: 10, date: '2020-01-06' }),
    ).resolves.toBeUndefined();
  });

  it('subscribes on init and reacts to emitted events', async () => {
    const { listener, events, reports } = build({ header: { id: 1 } });
    listener.onModuleInit();
    events.emitReportSourceChanged({ halaqaId: 10, date: '2020-01-06' });
    await flush();
    expect(reports.persistDay).toHaveBeenCalled();
  });
});
