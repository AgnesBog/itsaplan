import { Elysia, t } from 'elysia';
import { noContent } from '#shared/http';
import { HttpError } from '#shared/lib';
import { commonErrors } from '#shared/responses';
import { requireUser } from '#shared/access';
import { mcpTool } from '#mcp/generate';
import { db, issue } from '@repo/db';
import { eq } from 'drizzle-orm';
import {
  createRoutineBody,
  EvaluationListResponse,
  EvaluationResult,
  evaluateRoutinesQuery,
  listRoutinesQuery,
  routineParams,
  RoutineListResponse,
  RoutineResponse,
  triggerRoutineBody,
  TriggerRoutineResponse,
  updateRoutineBody,
} from './model';
import {
  createRoutine,
  deleteRoutine,
  evaluateAllRoutines,
  evaluateRoutine,
  getDefaultTeamId,
  getRoutine,
  listRoutines,
  triggerRoutineOccurrence,
  updateRoutine,
} from './service';

export const routineRoutes = new Elysia({
  name: 'routines',
  detail: { tags: ['Routines'] },
})
  // List routines
  .get(
    '/routines',
    async ({ user, query }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return listRoutines(teamId, {
        projectId: query.projectId ? Number(query.projectId) : undefined,
        status: query.status,
      });
    },
    {
      query: listRoutinesQuery,
      response: { 200: RoutineListResponse, ...commonErrors },
      detail: {
        summary: 'List recurring work routines',
        description: 'Returns all recurring work routine definitions for the team or project.',
        ...mcpTool('list_routines', { readOnlyHint: true }),
      },
    },
  )

  // Create routine
  .post(
    '/routines',
    async ({ user, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return createRoutine(teamId, body);
    },
    {
      body: createRoutineBody,
      response: { 200: RoutineResponse, ...commonErrors },
      detail: {
        summary: 'Create recurring work routine',
        description: 'Creates a new recurring work routine definition with cadence and execution policy.',
        ...mcpTool('create_routine'),
      },
    },
  )

  // Get routine by ID
  .get(
    '/routines/:routineId',
    async ({ user, params }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const item = await getRoutine(teamId, Number(params.routineId));
      if (!item) throw new HttpError(404, `Routine ${params.routineId} not found`);
      return item;
    },
    {
      params: routineParams,
      response: { 200: RoutineResponse, ...commonErrors },
      detail: {
        summary: 'Get recurring work routine',
        description: 'Returns full details of a recurring work routine including active occurrence status.',
        ...mcpTool('get_routine', { readOnlyHint: true }),
      },
    },
  )

  // Update routine
  .patch(
    '/routines/:routineId',
    async ({ user, params, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return updateRoutine(teamId, Number(params.routineId), body);
    },
    {
      params: routineParams,
      body: updateRoutineBody,
      response: { 200: RoutineResponse, ...commonErrors },
      detail: {
        summary: 'Update recurring work routine',
        description: 'Updates cadence, execution policy, default inputs, or active status of a routine.',
        ...mcpTool('update_routine'),
      },
    },
  )

  // Delete routine
  .delete(
    '/routines/:routineId',
    async ({ user, params }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const deleted = await deleteRoutine(teamId, Number(params.routineId));
      if (!deleted) throw new HttpError(404, `Routine ${params.routineId} not found`);
      return noContent();
    },
    {
      params: routineParams,
      detail: {
        summary: 'Delete recurring work routine',
        description: 'Permanently removes a recurring work routine definition.',
        ...mcpTool('delete_routine', { destructiveHint: true }),
      },
    },
  )

  // Evaluate single routine
  .post(
    '/routines/:routineId/evaluate',
    async ({ user, params }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return evaluateRoutine(teamId, Number(params.routineId));
    },
    {
      params: routineParams,
      response: { 200: EvaluationResult, ...commonErrors },
      detail: {
        summary: 'Evaluate a routine definition',
        description:
          'Evaluates active occurrence status and materializes the next occurrence if due (single-active model).',
        ...mcpTool('evaluate_routine'),
      },
    },
  )

  // Evaluate all routines
  .post(
    '/routines/evaluate-all',
    async ({ user, query }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const projectId = query.projectId ? Number(query.projectId) : undefined;
      return evaluateAllRoutines(teamId, projectId);
    },
    {
      query: evaluateRoutinesQuery,
      response: { 200: EvaluationListResponse, ...commonErrors },
      detail: {
        summary: 'Evaluate all active routines',
        description:
          'Scans all active routines in workspace or project, advancing lifecycles and materializing due occurrences.',
        ...mcpTool('evaluate_all_routines'),
      },
    },
  )

  // Trigger capability execution for active routine occurrence (3-tier input resolution)
  .post(
    '/routines/:routineId/trigger',
    async ({ user, params, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return triggerRoutineOccurrence(
        teamId,
        Number(params.routineId),
        body.overrides,
        u.id,
      );
    },
    {
      params: routineParams,
      body: triggerRoutineBody,
      response: { 200: TriggerRoutineResponse, ...commonErrors },
      detail: {
        summary: 'Trigger capability for routine occurrence',
        description:
          'Executes the capability attached to a routine occurrence with 3-tier inputs (defaults + overrides).',
        ...mcpTool('trigger_routine'),
      },
    },
  )

  // Trigger capability directly from an issue occurrence
  .post(
    '/issues/:issueId/trigger-routine',
    async ({ user, params, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const issueId = Number(params.issueId);

      // Find the issue to get its routineId
      const [issueRow] = await db
        .select({ id: issue.id, routineId: issue.routineId })
        .from(issue)
        .where(eq(issue.id, issueId))
        .limit(1);

      if (!issueRow) throw new HttpError(404, `Issue #${issueId} not found`);
      if (!issueRow.routineId) {
        throw new HttpError(400, `Issue #${issueId} is not linked to any recurring routine`);
      }

      return triggerRoutineOccurrence(
        teamId,
        issueRow.routineId,
        body.overrides,
        u.id,
      );
    },
    {
      params: t.Object({ issueId: t.Numeric() }),
      body: triggerRoutineBody,
      response: { 200: TriggerRoutineResponse, ...commonErrors },
      detail: {
        summary: 'Trigger routine capability from issue',
        description:
          'Triggers the capability for an issue occurrence linked to a routine, passing Tier 2/3 overrides.',
        ...mcpTool('trigger_issue_routine'),
      },
    },
  );
