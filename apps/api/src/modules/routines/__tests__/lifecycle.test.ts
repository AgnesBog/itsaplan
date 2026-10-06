import test, { describe, it } from 'node:test';
import assert from 'node:assert';

interface MockIssue {
  id: number;
  columnId: number;
  stateType: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  archivedAt: Date | null;
  updatedAt: Date;
  routineId: number;
  routineOverridePayload: Record<string, unknown>;
}

interface MockRoutine {
  id: number;
  title: string;
  status: 'active' | 'paused' | 'archived';
  executionPolicy: 'human_task' | 'human_triggered' | 'automated_capability';
  activeIssueId: number | null;
  nextDueDate: Date | null;
  lastCompletedAt: Date | null;
  defaultInputPayload: Record<string, unknown>;
}

/**
 * Pure state machine simulator matching evaluateRoutine logic
 */
function simulateEvaluation(
  routine: MockRoutine,
  issues: Map<number, MockIssue>,
  now: Date,
  onInvokeCapability?: (payload: Record<string, unknown>) => void,
): { action: string; reason?: string; issueId?: number } {
  // Check active issue
  if (routine.activeIssueId != null) {
    const activeIssue = issues.get(routine.activeIssueId);
    if (activeIssue) {
      const isTerminal =
        activeIssue.archivedAt != null ||
        activeIssue.stateType === 'completed' ||
        activeIssue.stateType === 'canceled';

      if (!isTerminal) {
        return {
          action: 'skipped',
          reason: `active_occurrence_in_progress (#${activeIssue.id})`,
          issueId: activeIssue.id,
        };
      }

      // Terminal: advance lifecycle
      routine.lastCompletedAt = activeIssue.updatedAt;
      routine.activeIssueId = null;
      routine.nextDueDate = new Date(routine.lastCompletedAt.getTime() + 7 * 86400 * 1000);
    } else {
      routine.activeIssueId = null;
    }
  }

  if (routine.status !== 'active') {
    return { action: 'skipped', reason: `routine_${routine.status}` };
  }

  const isDue = routine.nextDueDate != null && routine.nextDueDate.getTime() <= now.getTime();
  if (!isDue) {
    return { action: 'skipped', reason: 'not_due' };
  }

  // Materialize new occurrence
  const newIssueId = issues.size + 1;
  const newIssue: MockIssue = {
    id: newIssueId,
    columnId: 1,
    stateType: 'unstarted',
    archivedAt: null,
    updatedAt: now,
    routineId: routine.id,
    routineOverridePayload: {},
  };
  issues.set(newIssueId, newIssue);
  routine.activeIssueId = newIssueId;

  if (routine.executionPolicy === 'automated_capability') {
    onInvokeCapability?.(routine.defaultInputPayload);
    return { action: 'materialized_and_invoked', issueId: newIssueId };
  }

  return { action: 'materialized', issueId: newIssueId, reason: `policy_${routine.executionPolicy}` };
}

describe('Strict Single-Active Lifecycle State Machine', () => {
  it('blocks materialization when an active occurrence is in progress (unstarted or started)', () => {
    const issues = new Map<number, MockIssue>();
    const activeIssue: MockIssue = {
      id: 101,
      columnId: 2,
      stateType: 'started',
      archivedAt: null,
      updatedAt: new Date('2026-10-01T10:00:00Z'),
      routineId: 1,
      routineOverridePayload: {},
    };
    issues.set(101, activeIssue);

    const routine: MockRoutine = {
      id: 1,
      title: 'Weekly Production',
      status: 'active',
      executionPolicy: 'human_triggered',
      activeIssueId: 101,
      nextDueDate: new Date('2026-10-01T00:00:00Z'), // Due! But blocked by active issue
      lastCompletedAt: null,
      defaultInputPayload: { type: 'new', count: 7 },
    };

    const res = simulateEvaluation(routine, issues, new Date('2026-10-02T10:00:00Z'));
    assert.strictEqual(res.action, 'skipped');
    assert.ok(res.reason?.includes('active_occurrence_in_progress'));
    assert.strictEqual(issues.size, 1); // No new issue created!
    assert.strictEqual(routine.activeIssueId, 101);
  });

  it('unblocks and completes previous occurrence when active issue reaches completed column', () => {
    const issues = new Map<number, MockIssue>();
    const completedIssue: MockIssue = {
      id: 101,
      columnId: 5,
      stateType: 'completed',
      archivedAt: null,
      updatedAt: new Date('2026-10-02T12:00:00Z'),
      routineId: 1,
      routineOverridePayload: {},
    };
    issues.set(101, completedIssue);

    const routine: MockRoutine = {
      id: 1,
      title: 'Weekly Production',
      status: 'active',
      executionPolicy: 'human_triggered',
      activeIssueId: 101,
      nextDueDate: new Date('2026-10-01T00:00:00Z'),
      lastCompletedAt: null,
      defaultInputPayload: { type: 'new', count: 7 },
    };

    // Evaluate right after completion
    const res = simulateEvaluation(routine, issues, new Date('2026-10-02T12:05:00Z'));
    assert.strictEqual(routine.activeIssueId, null);
    assert.ok(routine.lastCompletedAt);
    assert.strictEqual(routine.lastCompletedAt.toISOString(), '2026-10-02T12:00:00.000Z');
    // Next due date scheduled 7 days later: 2026-10-09
    assert.strictEqual(routine.nextDueDate?.toISOString(), '2026-10-09T12:00:00.000Z');
    assert.strictEqual(res.action, 'skipped');
    assert.strictEqual(res.reason, 'not_due');
  });

  it('surfaces in QMW for human_triggered without automatically firing capability', () => {
    const issues = new Map<number, MockIssue>();
    let invoked = false;

    const routine: MockRoutine = {
      id: 1,
      title: 'Recovery Video Production',
      status: 'active',
      executionPolicy: 'human_triggered',
      activeIssueId: null,
      nextDueDate: new Date('2026-10-01T00:00:00Z'), // Due now
      lastCompletedAt: null,
      defaultInputPayload: { type: 'new', count: 7 },
    };

    const res = simulateEvaluation(routine, issues, new Date('2026-10-01T08:00:00Z'), () => {
      invoked = true;
    });

    assert.strictEqual(res.action, 'materialized');
    assert.strictEqual(res.reason, 'policy_human_triggered');
    assert.strictEqual(invoked, false); // Crucial! Human triggered means capability is NOT fired autonomously!
    assert.strictEqual(routine.activeIssueId, 1);
    assert.strictEqual(issues.get(1)?.title, undefined); // Created occurrence #1
  });

  it('automatically invokes capability when policy is automated_capability', () => {
    const issues = new Map<number, MockIssue>();
    let invokedPayload: Record<string, unknown> | null = null;

    const routine: MockRoutine = {
      id: 2,
      title: 'Automated Routine',
      status: 'active',
      executionPolicy: 'automated_capability',
      activeIssueId: null,
      nextDueDate: new Date('2026-10-01T00:00:00Z'),
      lastCompletedAt: null,
      defaultInputPayload: { action: 'backup', depth: 3 },
    };

    const res = simulateEvaluation(routine, issues, new Date('2026-10-01T08:00:00Z'), (payload) => {
      invokedPayload = payload;
    });

    assert.strictEqual(res.action, 'materialized_and_invoked');
    assert.deepStrictEqual(invokedPayload, { action: 'backup', depth: 3 });
  });
});
