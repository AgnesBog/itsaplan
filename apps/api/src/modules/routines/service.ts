import {
  db,
  routineDefinition,
  issue,
  project,
  projectColumn,
  cycle,
  capability,
  team,
  teamMember,
  type RoutineDefinition,
} from '@repo/db';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { invokeCapability } from '#modules/capabilities/service';
import { calculateNextDueDate, type CadenceConfig, type CadenceType, type CycleReference } from './cadence';

export interface ActiveIssueSummary {
  id: number;
  identifier: string;
  title: string;
  stateType: string;
  columnId: number;
  columnName: string;
}

export function mapRoutine(
  row: RoutineDefinition,
  activeIssueSummary?: ActiveIssueSummary | null,
  capabilityInfo?: { slug: string; name: string } | null,
) {
  return {
    id: row.id,
    teamId: row.teamId,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    slug: row.slug,
    cadenceType: row.cadenceType as CadenceType,
    cadenceConfig: (row.cadenceConfig ?? {}) as Record<string, unknown>,
    executionPolicy: row.executionPolicy as 'human_task' | 'human_triggered' | 'automated_capability',
    capabilityId: row.capabilityId,
    capabilitySlug: capabilityInfo?.slug ?? null,
    capabilityName: capabilityInfo?.name ?? null,
    defaultInputPayload: (row.defaultInputPayload ?? {}) as Record<string, unknown>,
    issueTemplate: (row.issueTemplate ?? {}) as Record<string, unknown>,
    targetInitiativeId: row.targetInitiativeId,
    targetColumnId: row.targetColumnId,
    status: row.status as 'active' | 'paused' | 'archived',
    activeIssueId: row.activeIssueId,
    activeIssue: activeIssueSummary ?? null,
    nextDueDate: row.nextDueDate ? iso(row.nextDueDate) : null,
    lastCompletedAt: row.lastCompletedAt ? iso(row.lastCompletedAt) : null,
    lastEvaluatedAt: row.lastEvaluatedAt ? iso(row.lastEvaluatedAt) : null,
    brandId: row.brandId,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function getDefaultTeamId(userId: string): Promise<number> {
  const memberRows = await db
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .where(eq(teamMember.userId, userId))
    .limit(1);
  if (memberRows[0]?.teamId) return memberRows[0].teamId;

  const teamRows = await db.select({ id: team.id }).from(team).limit(1);
  if (teamRows[0]?.id) return teamRows[0].id;

  throw new HttpError(400, 'No team found for user');
}

/**
 * Loads active issue details and capability metadata for routines in bulk.
 */
async function enrichRoutines(routines: RoutineDefinition[]) {
  if (routines.length === 0) return [];

  const activeIssueIds = routines.map((r) => r.activeIssueId).filter((id): id is number => id != null);
  const capabilityIds = routines.map((r) => r.capabilityId).filter((id): id is string => id != null);

  const activeIssueMap = new Map<number, ActiveIssueSummary>();
  if (activeIssueIds.length > 0) {
    const issueRows = await db
      .select({
        id: issue.id,
        sequenceNumber: issue.sequenceNumber,
        title: issue.title,
        columnId: issue.columnId,
        projectKey: project.key,
        columnName: projectColumn.name,
        stateType: projectColumn.stateType,
      })
      .from(issue)
      .innerJoin(project, eq(issue.projectId, project.id))
      .innerJoin(projectColumn, eq(issue.columnId, projectColumn.id))
      .where(inArray(issue.id, activeIssueIds));

    for (const r of issueRows) {
      activeIssueMap.set(r.id, {
        id: r.id,
        identifier: `${r.projectKey}-${r.sequenceNumber}`,
        title: r.title,
        stateType: r.stateType,
        columnId: r.columnId,
        columnName: r.columnName,
      });
    }
  }

  const capabilityMap = new Map<string, { slug: string; name: string }>();
  if (capabilityIds.length > 0) {
    const capRows = await db
      .select({
        id: capability.id,
        slug: capability.slug,
        name: capability.name,
      })
      .from(capability)
      .where(inArray(capability.id, capabilityIds));

    for (const cap of capRows) {
      capabilityMap.set(cap.id, { slug: cap.slug, name: cap.name });
    }
  }

  return routines.map((r) => {
    const issueSummary = r.activeIssueId ? activeIssueMap.get(r.activeIssueId) ?? null : null;
    const capInfo = r.capabilityId ? capabilityMap.get(r.capabilityId) ?? null : null;
    return mapRoutine(r, issueSummary, capInfo);
  });
}

export async function listRoutines(
  teamId: number,
  opts?: { projectId?: number; status?: string },
) {
  const conditions = [eq(routineDefinition.teamId, teamId)];
  if (opts?.projectId) {
    conditions.push(eq(routineDefinition.projectId, opts.projectId));
  }
  if (opts?.status) {
    conditions.push(eq(routineDefinition.status, opts.status));
  }

  const rows = await db
    .select()
    .from(routineDefinition)
    .where(and(...conditions))
    .orderBy(desc(routineDefinition.createdAt));

  return enrichRoutines(rows);
}

export async function getRoutine(teamId: number, id: number) {
  const rows = await db
    .select()
    .from(routineDefinition)
    .where(and(eq(routineDefinition.teamId, teamId), eq(routineDefinition.id, id)))
    .limit(1);

  if (!rows[0]) return null;
  const enriched = await enrichRoutines(rows);
  return enriched[0] ?? null;
}

export async function createRoutine(
  teamId: number,
  input: {
    projectId: number;
    title: string;
    description?: string;
    slug?: string;
    cadenceType: CadenceType;
    cadenceConfig?: Record<string, unknown>;
    executionPolicy?: 'human_task' | 'human_triggered' | 'automated_capability';
    capabilityId?: string | null;
    defaultInputPayload?: Record<string, unknown>;
    issueTemplate?: Record<string, unknown>;
    targetInitiativeId?: number | null;
    targetColumnId?: number | null;
    status?: 'active' | 'paused' | 'archived';
    brandId?: string | null;
    nextDueDate?: string | null;
  },
) {
  // Verify project belongs to team
  const proj = await db
    .select({ id: project.id })
    .from(project)
    .where(and(eq(project.id, input.projectId), eq(project.teamId, teamId)))
    .limit(1);
  if (!proj[0]) throw new HttpError(404, `Project ${input.projectId} not found in team`);

  // If capabilityId provided by slug, resolve to actual ID
  let resolvedCapabilityId = input.capabilityId ?? null;
  if (resolvedCapabilityId) {
    const cap = await db
      .select({ id: capability.id })
      .from(capability)
      .where(and(eq(capability.teamId, teamId), sql`(${capability.id} = ${resolvedCapabilityId} OR ${capability.slug} = ${resolvedCapabilityId})`))
      .limit(1);
    if (!cap[0]) throw new HttpError(404, `Capability '${resolvedCapabilityId}' not found`);
    resolvedCapabilityId = cap[0].id;
  }

  const cadenceConfig = input.cadenceConfig ?? {};
  let initialNextDue: Date | null = null;
  if (input.nextDueDate) {
    initialNextDue = new Date(input.nextDueDate);
  } else if (input.status !== 'paused' && input.status !== 'archived') {
    initialNextDue = calculateNextDueDate({
      cadenceType: input.cadenceType,
      cadenceConfig: cadenceConfig as CadenceConfig,
      fromTime: new Date(),
    });
  }

  const [row] = await db
    .insert(routineDefinition)
    .values({
      teamId,
      projectId: input.projectId,
      title: input.title,
      description: input.description ?? '',
      slug: input.slug ?? null,
      cadenceType: input.cadenceType,
      cadenceConfig,
      executionPolicy: input.executionPolicy ?? 'human_triggered',
      capabilityId: resolvedCapabilityId,
      defaultInputPayload: input.defaultInputPayload ?? {},
      issueTemplate: input.issueTemplate ?? {},
      targetInitiativeId: input.targetInitiativeId ?? null,
      targetColumnId: input.targetColumnId ?? null,
      status: input.status ?? 'active',
      nextDueDate: initialNextDue,
      brandId: input.brandId ?? null,
    })
    .returning();

  const enriched = await enrichRoutines([row]);
  return enriched[0];
}

export async function updateRoutine(
  teamId: number,
  id: number,
  patch: {
    title?: string;
    description?: string;
    slug?: string | null;
    cadenceType?: CadenceType;
    cadenceConfig?: Record<string, unknown>;
    executionPolicy?: 'human_task' | 'human_triggered' | 'automated_capability';
    capabilityId?: string | null;
    defaultInputPayload?: Record<string, unknown>;
    issueTemplate?: Record<string, unknown>;
    targetInitiativeId?: number | null;
    targetColumnId?: number | null;
    status?: 'active' | 'paused' | 'archived';
    brandId?: string | null;
    nextDueDate?: string | null;
  },
) {
  const current = await db
    .select()
    .from(routineDefinition)
    .where(and(eq(routineDefinition.id, id), eq(routineDefinition.teamId, teamId)))
    .limit(1);
  if (!current[0]) throw new HttpError(404, `Routine ${id} not found`);

  const set: Partial<typeof routineDefinition.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.title !== undefined) set.title = patch.title;
  if (patch.description !== undefined) set.description = patch.description;
  if (patch.slug !== undefined) set.slug = patch.slug;
  if (patch.cadenceType !== undefined) set.cadenceType = patch.cadenceType;
  if (patch.cadenceConfig !== undefined) set.cadenceConfig = patch.cadenceConfig;
  if (patch.executionPolicy !== undefined) set.executionPolicy = patch.executionPolicy;
  if (patch.capabilityId !== undefined) {
    if (patch.capabilityId) {
      const cap = await db
        .select({ id: capability.id })
        .from(capability)
        .where(and(eq(capability.teamId, teamId), sql`(${capability.id} = ${patch.capabilityId} OR ${capability.slug} = ${patch.capabilityId})`))
        .limit(1);
      if (!cap[0]) throw new HttpError(404, `Capability '${patch.capabilityId}' not found`);
      set.capabilityId = cap[0].id;
    } else {
      set.capabilityId = null;
    }
  }
  if (patch.defaultInputPayload !== undefined) set.defaultInputPayload = patch.defaultInputPayload;
  if (patch.issueTemplate !== undefined) set.issueTemplate = patch.issueTemplate;
  if (patch.targetInitiativeId !== undefined) set.targetInitiativeId = patch.targetInitiativeId;
  if (patch.targetColumnId !== undefined) set.targetColumnId = patch.targetColumnId;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.brandId !== undefined) set.brandId = patch.brandId;
  if (patch.nextDueDate !== undefined) {
    set.nextDueDate = patch.nextDueDate ? new Date(patch.nextDueDate) : null;
  }

  const [updated] = await db
    .update(routineDefinition)
    .set(set)
    .where(eq(routineDefinition.id, id))
    .returning();

  const enriched = await enrichRoutines([updated]);
  return enriched[0];
}

export async function deleteRoutine(teamId: number, id: number) {
  const res = await db
    .delete(routineDefinition)
    .where(and(eq(routineDefinition.id, id), eq(routineDefinition.teamId, teamId)))
    .returning({ id: routineDefinition.id });
  return res.length > 0;
}

/**
 * Loads cycle references for a project.
 */
async function loadCyclesForProject(projectId: number): Promise<{
  activeCycle: CycleReference | null;
  nextCycle: CycleReference | null;
}> {
  const rows = await db
    .select({
      id: cycle.id,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      completedAt: cycle.completedAt,
    })
    .from(cycle)
    .where(eq(cycle.projectId, projectId))
    .orderBy(asc(cycle.startDate));

  const today = new Date().toISOString().slice(0, 10);
  let activeCycle: CycleReference | null = null;
  let nextCycle: CycleReference | null = null;

  for (const c of rows) {
    let status: 'upcoming' | 'active' | 'completed' = 'upcoming';
    if (c.completedAt || today > c.endDate) {
      status = 'completed';
    } else if (today >= c.startDate && today <= c.endDate) {
      status = 'active';
    }

    const ref: CycleReference = {
      id: c.id,
      startDate: c.startDate,
      endDate: c.endDate,
      status,
    };

    if (status === 'active' && !activeCycle) {
      activeCycle = ref;
    } else if (status === 'upcoming' && !nextCycle) {
      nextCycle = ref;
    }
  }

  return { activeCycle, nextCycle };
}

/**
 * Evaluates a single routine definition:
 * 1. Checks active occurrence state (Strict Single-Active Guarantee).
 * 2. If active occurrence is completed/canceled, clears activeIssueId, records lastCompletedAt, and updates nextDueDate.
 * 3. If due (and no active occurrence blocking), materializes the next occurrence.
 * 4. Dispatches according to execution policy (automated_capability, human_triggered, human_task).
 */
export async function evaluateRoutine(
  teamId: number,
  id: number,
  now: Date = new Date(),
): Promise<{
  routineId: number;
  routineTitle: string;
  action: 'materialized' | 'materialized_and_invoked' | 'skipped';
  reason?: string;
  issueId?: number | null;
  invocationId?: number | null;
  nextDueDate?: string | null;
}> {
  const [routine] = await db
    .select()
    .from(routineDefinition)
    .where(and(eq(routineDefinition.id, id), eq(routineDefinition.teamId, teamId)))
    .limit(1);

  if (!routine) throw new HttpError(404, `Routine ${id} not found`);

  // Check active occurrence if one is currently recorded
  if (routine.activeIssueId != null) {
    const [activeIssueRow] = await db
      .select({
        id: issue.id,
        columnId: issue.columnId,
        archivedAt: issue.archivedAt,
        updatedAt: issue.updatedAt,
        stateType: projectColumn.stateType,
      })
      .from(issue)
      .innerJoin(projectColumn, eq(issue.columnId, projectColumn.id))
      .where(eq(issue.id, routine.activeIssueId))
      .limit(1);

    if (activeIssueRow) {
      const isTerminal =
        activeIssueRow.archivedAt != null ||
        activeIssueRow.stateType === 'completed' ||
        activeIssueRow.stateType === 'canceled';

      if (!isTerminal) {
        // Active occurrence is in progress -> blocks generation of next occurrence!
        return {
          routineId: routine.id,
          routineTitle: routine.title,
          action: 'skipped',
          reason: `active_occurrence_in_progress (#${activeIssueRow.id} in '${activeIssueRow.stateType}')`,
          issueId: activeIssueRow.id,
          nextDueDate: routine.nextDueDate ? iso(routine.nextDueDate) : null,
        };
      }

      // Previous active occurrence has completed/canceled!
      const lastCompletedAt = activeIssueRow.updatedAt ?? now;
      const { activeCycle, nextCycle } = await loadCyclesForProject(routine.projectId);

      const nextDue = calculateNextDueDate({
        cadenceType: routine.cadenceType as CadenceType,
        cadenceConfig: routine.cadenceConfig as CadenceConfig,
        fromTime: now,
        lastCompletedAt,
        activeCycle,
        nextCycle,
      });

      await db
        .update(routineDefinition)
        .set({
          activeIssueId: null,
          lastCompletedAt,
          nextDueDate: nextDue,
          lastEvaluatedAt: now,
          updatedAt: now,
        })
        .where(eq(routineDefinition.id, routine.id));

      routine.activeIssueId = null;
      routine.lastCompletedAt = lastCompletedAt;
      routine.nextDueDate = nextDue;
    } else {
      // Active issue was deleted
      await db
        .update(routineDefinition)
        .set({ activeIssueId: null, lastEvaluatedAt: now, updatedAt: now })
        .where(eq(routineDefinition.id, routine.id));
      routine.activeIssueId = null;
    }
  }

  // If routine is not active, do not materialize
  if (routine.status !== 'active') {
    return {
      routineId: routine.id,
      routineTitle: routine.title,
      action: 'skipped',
      reason: `routine_${routine.status}`,
      nextDueDate: routine.nextDueDate ? iso(routine.nextDueDate) : null,
    };
  }

  // Check if routine is due
  const isDue = routine.nextDueDate != null && routine.nextDueDate.getTime() <= now.getTime();
  if (!isDue) {
    return {
      routineId: routine.id,
      routineTitle: routine.title,
      action: 'skipped',
      reason: 'not_due',
      nextDueDate: routine.nextDueDate ? iso(routine.nextDueDate) : null,
    };
  }

  // Due and no active occurrence blocking -> Materialize occurrence!
  // 1. Increment sequence number on project atomically
  const [seqRow] = await db
    .update(project)
    .set({ nextSequence: sql`next_sequence + 1` })
    .where(eq(project.id, routine.projectId))
    .returning({ seq: sql<number>`next_sequence - 1` });
  const sequenceNumber = Number(seqRow.seq);

  // 2. Resolve target column
  let targetColumnId = routine.targetColumnId;
  if (!targetColumnId) {
    const columns = await db
      .select({ id: projectColumn.id, stateType: projectColumn.stateType })
      .from(projectColumn)
      .where(eq(projectColumn.projectId, routine.projectId))
      .orderBy(asc(projectColumn.position));

    const defaultCol = columns.find((c) => c.stateType === 'unstarted') || columns[0];
    if (!defaultCol) throw new HttpError(400, 'No workflow column found for project');
    targetColumnId = defaultCol.id;
  }

  // 3. Resolve template properties
  const tpl = (routine.issueTemplate ?? {}) as Record<string, unknown>;
  const typeId = typeof tpl.typeId === 'number' ? tpl.typeId : null;
  const initiativeId = routine.targetInitiativeId ?? (typeof tpl.initiativeId === 'number' ? tpl.initiativeId : null);
  const priority = typeof tpl.priority === 'string' ? tpl.priority : null;
  const assigneeUserId = typeof tpl.assigneeUserId === 'string' ? tpl.assigneeUserId : null;
  const delegateUserId = typeof tpl.delegateUserId === 'string' ? tpl.delegateUserId : null;
  const dueDateStr = routine.nextDueDate ? routine.nextDueDate.toISOString().slice(0, 10) : null;

  // 4. Insert new issue (Tier 2: initial routineOverridePayload is empty object)
  const [newIssue] = await db
    .insert(issue)
    .values({
      projectId: routine.projectId,
      sequenceNumber,
      columnId: targetColumnId,
      typeId,
      initiativeId,
      routineId: routine.id,
      routineOverridePayload: {},
      title: routine.title,
      description: routine.description,
      priority,
      assigneeUserId,
      delegateUserId,
      dueDate: dueDateStr,
      position: 1000,
    })
    .returning();

  // 5. Update routine definition with active occurrence
  await db
    .update(routineDefinition)
    .set({
      activeIssueId: newIssue.id,
      lastEvaluatedAt: now,
      updatedAt: now,
    })
    .where(eq(routineDefinition.id, routine.id));

  // 6. Handle Execution Policy
  if (routine.executionPolicy === 'automated_capability') {
    if (routine.capabilityId) {
      const [cap] = await db
        .select()
        .from(capability)
        .where(eq(capability.id, routine.capabilityId))
        .limit(1);

      if (cap) {
        // Tier 3: Immutable invocation payload = Tier 1 defaults + Tier 2 overrides
        const mergedPayload = {
          ...((routine.defaultInputPayload ?? {}) as Record<string, unknown>),
        };

        const invocation = await invokeCapability(
          teamId,
          {
            capabilitySlug: cap.slug,
            issueId: newIssue.id,
            brandId: routine.brandId,
            inputPayload: mergedPayload,
          },
          null,
        );

        return {
          routineId: routine.id,
          routineTitle: routine.title,
          action: 'materialized_and_invoked',
          issueId: newIssue.id,
          invocationId: invocation.id,
          nextDueDate: routine.nextDueDate ? iso(routine.nextDueDate) : null,
        };
      }
    }
  }

  // For human_triggered and human_task: occurrence is materialized in QMW / TaskFlow,
  // waiting for human action (review/override and run, or manual completion).
  return {
    routineId: routine.id,
    routineTitle: routine.title,
    action: 'materialized',
    reason: `policy_${routine.executionPolicy}`,
    issueId: newIssue.id,
    nextDueDate: routine.nextDueDate ? iso(routine.nextDueDate) : null,
  };
}

export async function evaluateAllRoutines(
  teamId: number,
  projectId?: number,
  now: Date = new Date(),
) {
  const conditions = [
    eq(routineDefinition.teamId, teamId),
    eq(routineDefinition.status, 'active'),
  ];
  if (projectId) {
    conditions.push(eq(routineDefinition.projectId, projectId));
  }

  const routines = await db
    .select({ id: routineDefinition.id })
    .from(routineDefinition)
    .where(and(...conditions));

  const results = [];
  for (const r of routines) {
    const res = await evaluateRoutine(teamId, r.id, now);
    results.push(res);
  }
  return results;
}

/**
 * Triggers capability execution for a routine occurrence with 3-tier input resolution:
 * Tier 1: Routine Defaults (routine_definition.default_input_payload)
 * Tier 2: Occurrence Overrides (issue.routine_override_payload)
 * Tier 3: Trigger Overrides (passed in explicitOverrides)
 * -> Stored immutably on capability_invocation.input_payload!
 */
export async function triggerRoutineOccurrence(
  teamId: number,
  routineId: number,
  explicitOverrides?: Record<string, unknown>,
  userId?: string,
) {
  const [routine] = await db
    .select()
    .from(routineDefinition)
    .where(and(eq(routineDefinition.id, routineId), eq(routineDefinition.teamId, teamId)))
    .limit(1);

  if (!routine) throw new HttpError(404, `Routine ${routineId} not found`);
  if (!routine.capabilityId) {
    throw new HttpError(400, `Routine '${routine.title}' has no capability attached`);
  }

  // If no active issue exists, evaluate first to materialize one if due
  let activeIssueId = routine.activeIssueId;
  if (!activeIssueId) {
    const evalRes = await evaluateRoutine(teamId, routineId, new Date());
    if (evalRes.issueId) {
      activeIssueId = evalRes.issueId;
    } else {
      throw new HttpError(
        400,
        `Routine '${routine.title}' has no active occurrence and is not currently due to materialize one`,
      );
    }
  }

  // Load the active issue
  const [issueRow] = await db
    .select()
    .from(issue)
    .where(eq(issue.id, activeIssueId))
    .limit(1);

  if (!issueRow) {
    throw new HttpError(404, `Active issue #${activeIssueId} not found`);
  }

  // Load the attached capability
  const [cap] = await db
    .select()
    .from(capability)
    .where(eq(capability.id, routine.capabilityId))
    .limit(1);

  if (!cap) {
    throw new HttpError(404, `Attached capability '${routine.capabilityId}' not found`);
  }

  // Resolve 3-Tier Input Hierarchy
  const tier1Defaults = (routine.defaultInputPayload ?? {}) as Record<string, unknown>;
  const tier2OccurrenceOverrides = (issueRow.routineOverridePayload ?? {}) as Record<string, unknown>;
  const triggerOverrides = explicitOverrides ?? {};

  const effectivePayload: Record<string, unknown> = {
    ...tier1Defaults,
    ...tier2OccurrenceOverrides,
    ...triggerOverrides,
  };

  // If explicit overrides were supplied at trigger time, persist them to issue.routineOverridePayload
  if (explicitOverrides && Object.keys(explicitOverrides).length > 0) {
    const updatedTier2 = { ...tier2OccurrenceOverrides, ...explicitOverrides };
    await db
      .update(issue)
      .set({ routineOverridePayload: updatedTier2 })
      .where(eq(issue.id, issueRow.id));
  }

  // Invoke capability (creates immutable Tier 3 invocation payload on capability_invocation)
  const invocation = await invokeCapability(
    teamId,
    {
      capabilitySlug: cap.slug,
      issueId: issueRow.id,
      brandId: routine.brandId,
      inputPayload: effectivePayload,
    },
    userId,
  );

  return {
    routineId: routine.id,
    issueId: issueRow.id,
    capabilitySlug: cap.slug,
    effectivePayload,
    invocation,
  };
}

/**
 * Hook called when an issue transitions to another column.
 * If the issue belongs to a routine and reaches a terminal state (completed/canceled),
 * advances the routine's lifecycle: records lastCompletedAt, clears activeIssueId,
 * and schedules nextDueDate.
 */
export async function handleIssueStatusChange(issueId: number, columnId: number) {
  const [issueRow] = await db
    .select({
      id: issue.id,
      routineId: issue.routineId,
      stateType: projectColumn.stateType,
    })
    .from(issue)
    .innerJoin(projectColumn, eq(projectColumn.id, columnId))
    .where(eq(issue.id, issueId))
    .limit(1);

  if (!issueRow || !issueRow.routineId) return;

  const isTerminal = issueRow.stateType === 'completed' || issueRow.stateType === 'canceled';
  if (!isTerminal) return;

  const [routine] = await db
    .select()
    .from(routineDefinition)
    .where(eq(routineDefinition.id, issueRow.routineId))
    .limit(1);

  if (!routine || routine.activeIssueId !== issueId) return;

  const now = new Date();
  const { activeCycle, nextCycle } = await loadCyclesForProject(routine.projectId);

  const nextDue = calculateNextDueDate({
    cadenceType: routine.cadenceType as CadenceType,
    cadenceConfig: routine.cadenceConfig as CadenceConfig,
    fromTime: now,
    lastCompletedAt: now,
    activeCycle,
    nextCycle,
  });

  await db
    .update(routineDefinition)
    .set({
      activeIssueId: null,
      lastCompletedAt: now,
      nextDueDate: nextDue,
      lastEvaluatedAt: now,
      updatedAt: now,
    })
    .where(eq(routineDefinition.id, routine.id));
}
