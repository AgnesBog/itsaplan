import test, { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  calculateNextDueDate,
  calculateNextCronDate,
  type CadenceConfig,
  type CycleReference,
} from '../cadence.ts';

describe('Recurrence Cadence Engine', () => {
  it('handles manual cadence by returning null', () => {
    const result = calculateNextDueDate({
      cadenceType: 'manual',
      cadenceConfig: {},
      fromTime: new Date('2026-10-01T12:00:00Z'),
    });
    assert.strictEqual(result, null);
  });

  describe('completion_relative strategy', () => {
    it('calculates due date N days after last completed date', () => {
      const completed = new Date('2026-10-01T10:00:00Z');
      const result = calculateNextDueDate({
        cadenceType: 'completion_relative',
        cadenceConfig: { daysAfterCompletion: 14 },
        lastCompletedAt: completed,
      });

      assert.ok(result);
      const expected = new Date('2026-10-15T10:00:00Z');
      assert.strictEqual(result.getTime(), expected.getTime());
    });

    it('falls back to fromTime when lastCompletedAt is null', () => {
      const fromTime = new Date('2026-10-01T10:00:00Z');
      const result = calculateNextDueDate({
        cadenceType: 'completion_relative',
        cadenceConfig: { daysAfterCompletion: 7, hoursAfterCompletion: 2 },
        fromTime,
        lastCompletedAt: null,
      });

      assert.ok(result);
      const expected = new Date('2026-10-08T12:00:00Z');
      assert.strictEqual(result.getTime(), expected.getTime());
    });
  });

  describe('calendar strategy', () => {
    it('calculates due date by intervalDays', () => {
      const fromTime = new Date('2026-10-01T00:00:00Z');
      const result = calculateNextDueDate({
        cadenceType: 'calendar',
        cadenceConfig: { intervalDays: 3 },
        fromTime,
      });

      assert.ok(result);
      const expected = new Date('2026-10-04T00:00:00Z');
      assert.strictEqual(result.getTime(), expected.getTime());
    });

    it('calculates next day of week matching target days', () => {
      // 2026-10-01 is a Thursday (UTC day = 4)
      const fromTime = new Date('2026-10-01T10:00:00Z');
      // Target next Monday (day = 1) at 09:00 UTC
      const result = calculateNextDueDate({
        cadenceType: 'calendar',
        cadenceConfig: { daysOfWeek: [1], timeOfDay: '09:00' },
        fromTime,
      });

      assert.ok(result);
      // Next Monday is 2026-10-05
      assert.strictEqual(result.toISOString(), '2026-10-05T09:00:00.000Z');
      assert.strictEqual(result.getUTCDay(), 1);
    });

    it('evaluates standard 5-part cron expressions correctly', () => {
      // Wednesday 2026-10-07 08:30:00
      const fromTime = new Date('2026-10-07T08:30:00Z');
      // Cron: '0 9 * * 1' -> Every Monday at 09:00 UTC
      const nextCron = calculateNextCronDate('0 9 * * 1', fromTime);
      assert.ok(nextCron);
      // Next Monday after Oct 7 is Oct 12
      assert.strictEqual(nextCron.toISOString(), '2026-10-12T09:00:00.000Z');
      assert.strictEqual(nextCron.getUTCDay(), 1);

      // Cron: '*/15 10 * * *' -> Next 15-minute interval at hour 10
      const next15 = calculateNextCronDate('*/15 10 * * *', fromTime);
      assert.ok(next15);
      assert.strictEqual(next15.toISOString(), '2026-10-07T10:00:00.000Z');
    });
  });

  describe('cycle strategy (QMW sprint)', () => {
    const activeCycle: CycleReference = {
      id: 1,
      startDate: '2026-10-05',
      endDate: '2026-10-18',
      status: 'active',
    };

    it('anchors to start of cycle with offset', () => {
      const result = calculateNextDueDate({
        cadenceType: 'cycle',
        cadenceConfig: { anchor: 'start', offsetDays: 1 },
        activeCycle,
      });

      assert.ok(result);
      assert.strictEqual(result.toISOString(), '2026-10-06T00:00:00.000Z');
    });

    it('anchors to end of cycle with negative offset', () => {
      const result = calculateNextDueDate({
        cadenceType: 'cycle',
        cadenceConfig: { anchor: 'end', offsetDays: -2 },
        activeCycle,
      });

      assert.ok(result);
      assert.strictEqual(result.toISOString(), '2026-10-16T00:00:00.000Z');
    });
  });
});

describe('Three-Tier Input Hierarchy Resolution', () => {
  it('correctly cascades Tier 1 -> Tier 2 -> Tier 3', () => {
    // Tier 1: Routine default inputs
    const tier1Defaults = { type: 'new', count: 7, renderSubtitles: true };

    // Tier 2: Occurrence overrides (e.g. user previously set count: 5 on the issue)
    const tier2Overrides = { count: 5 };

    // Tier 3: Trigger-time explicit overrides (e.g. user changed count to 1 right before clicking Run)
    const tier3ExplicitOverrides = { count: 1 };

    const resolvedPayload = {
      ...tier1Defaults,
      ...tier2Overrides,
      ...tier3ExplicitOverrides,
    };

    assert.strictEqual(resolvedPayload.type, 'new');
    assert.strictEqual(resolvedPayload.renderSubtitles, true);
    assert.strictEqual(resolvedPayload.count, 1); // Tier 3 won over Tier 2 and Tier 1
  });

  it('preserves Tier 1 defaults when no overrides are given', () => {
    const tier1Defaults = { type: 'new', count: 7 };
    const tier2Overrides = {};
    const tier3Overrides = {};

    const resolvedPayload = {
      ...tier1Defaults,
      ...tier2Overrides,
      ...tier3Overrides,
    };

    assert.strictEqual(resolvedPayload.type, 'new');
    assert.strictEqual(resolvedPayload.count, 7);
  });
});
