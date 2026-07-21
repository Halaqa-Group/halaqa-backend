import { DataSource } from 'typeorm';
import { ErrorHeatmapService } from './error-heatmap.service';

function makeService(queryResults: unknown[][]) {
  const query = jest.fn();
  for (const r of queryResults) query.mockResolvedValueOnce(r);
  const ds = { manager: { query } } as unknown as DataSource;
  return { service: new ErrorHeatmapService(ds), query };
}

describe('ErrorHeatmapService', () => {
  it('aggregates hotspots and coerces MySQL string counts to numbers', async () => {
    const { service, query } = makeService([
      [
        {
          surah: '2',
          ayah: '5',
          mistakes_count: '3',
          warnings_count: '1',
          tajweed_errors_count: '0',
          harakat_errors_count: '2',
          total: '6',
        },
        {
          surah: '2',
          ayah: '42',
          mistakes_count: '2',
          warnings_count: '0',
          tajweed_errors_count: '1',
          harakat_errors_count: '0',
          total: '3',
        },
      ],
      [{ total: '9' }],
    ]);

    const res = await service.getHeatmap(5, 10, 56, 20);

    expect(res.student_id).toBe(5);
    expect(res.days).toBe(56);
    expect(res.total_errors).toBe(9); // grand total, not just the sum of returned rows
    expect(res.hotspots).toHaveLength(2);
    expect(res.hotspots[0]).toEqual({
      surah: 2,
      ayah: 5,
      mistakes_count: 3,
      warnings_count: 1,
      tajweed_errors_count: 0,
      harakat_errors_count: 2,
      total: 6,
    });

    // Scoped by student + school, with the limit passed through.
    const [, params] = query.mock.calls[0];
    expect(params[0]).toBe(5); // studentId
    expect(params[1]).toBe(10); // schoolId
    expect(params[3]).toBe(20); // limit
  });

  it('returns empty hotspots and zero total when the student has no errors', async () => {
    const { service } = makeService([[], [{ total: '0' }]]);
    const res = await service.getHeatmap(5, 10);
    expect(res.hotspots).toEqual([]);
    expect(res.total_errors).toBe(0);
    expect(res.days).toBe(56); // default window
  });
});
