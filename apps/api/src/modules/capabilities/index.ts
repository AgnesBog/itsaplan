import { Elysia, t } from 'elysia';
import { noContent } from '#shared/http';
import { HttpError } from '#shared/lib';
import { commonErrors, errors } from '#shared/responses';
import { requireUser } from '#shared/access';
import { mcpTool } from '#mcp/generate';
import {
  CapabilityListResponse,
  CapabilityResponse,
  createCapabilityBody,
  InvocationResponse,
  invokeCapabilityBody,
  requestIdParams,
  RunnerClaimResponse,
  runnerHeartbeatBody,
  runnerJobParams,
  runnerStatusBody,
} from './model';
import {
  claimRunnerJob,
  createCapability,
  getDefaultTeamId,
  getInvocationByRequestId,
  heartbeatRunnerJob,
  listCapabilities,
  invokeCapability,
  updateRunnerStatus,
} from './service';

export const capabilityRoutes = new Elysia({
  name: 'capabilities',
  detail: { tags: ['Capabilities'] },
})
  // List all registered capabilities for the caller's team
  .get(
    '/capabilities',
    async ({ user }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return listCapabilities(teamId);
    },
    {
      response: { 200: CapabilityListResponse, ...commonErrors },
      detail: {
        summary: 'List registered capabilities',
        description: 'Returns all external capabilities available to execute in the workspace.',
        ...mcpTool('list_capabilities', { readOnlyHint: true }),
      },
    },
  )

  // Register or update an external capability
  .post(
    '/capabilities',
    async ({ user, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return createCapability(teamId, body);
    },
    {
      body: createCapabilityBody,
      response: { 200: CapabilityResponse, ...commonErrors },
      detail: {
        summary: 'Register or update a capability',
        description: 'Registers an external tool, runner script, or cloud webhook with its schema.',
        ...mcpTool('register_capability'),
      },
    },
  )

  // Invoke a capability
  .post(
    '/capabilities/invoke',
    async ({ user, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      return invokeCapability(teamId, body, u.id);
    },
    {
      body: invokeCapabilityBody,
      response: { 200: InvocationResponse, ...commonErrors },
      detail: {
        summary: 'Invoke an external capability',
        description:
          'Triggers an external capability (local runner script or cloud webhook), creating a tracked job with an idempotent requestId.',
        ...mcpTool('invoke_capability'),
      },
    },
  )

  // Check the status of a capability invocation
  .get(
    '/capabilities/invocations/:requestId',
    async ({ user, params }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const item = await getInvocationByRequestId(teamId, params.requestId);
      if (!item) throw new HttpError(404, `Invocation '${params.requestId}' not found`);
      return item;
    },
    {
      params: requestIdParams,
      response: { 200: InvocationResponse, ...commonErrors },
      detail: {
        summary: 'Get capability invocation status',
        description: 'Retrieves execution state, reviewUrl, output, and exitCode for a capability run.',
        ...mcpTool('get_capability_status', { readOnlyHint: true }),
      },
    },
  )

  // Local Runner: Claim the next queued job
  .post(
    '/capabilities/runner/claim',
    async ({ user }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const job = await claimRunnerJob(teamId);
      return { job };
    },
    {
      response: { 200: RunnerClaimResponse, ...commonErrors },
      detail: {
        summary: 'Claim the next local capability job',
        description:
          'Drains the next queued local runner job with an atomic lease. Returns null if none is pending.',
      },
    },
  )

  // Local Runner: Heartbeat to extend job lease
  .post(
    '/capabilities/runner/:id/heartbeat',
    async ({ user, params, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const ok = await heartbeatRunnerJob(teamId, Number(params.id), body?.leaseSeconds ?? 300);
      if (!ok) throw new HttpError(404, 'Job not found or not in running state');
      return noContent();
    },
    {
      params: runnerJobParams,
      body: runnerHeartbeatBody,
      response: { 204: t.Void(), ...commonErrors },
      detail: {
        summary: 'Extend capability job lease',
        description: 'Renews lease_expires_at while the local runner is still working on the job.',
      },
    },
  )

  // Local Runner: Report status or completion
  .post(
    '/capabilities/runner/:id/status',
    async ({ user, params, body }) => {
      const u = requireUser(user);
      const teamId = await getDefaultTeamId(u.id);
      const updated = await updateRunnerStatus(teamId, Number(params.id), body, u.id);
      if (!updated) throw new HttpError(404, 'Job not found');
      return updated;
    },
    {
      params: runnerJobParams,
      body: runnerStatusBody,
      response: { 200: InvocationResponse, ...commonErrors },
      detail: {
        summary: 'Report capability job status',
        description:
          'Reports state transition (running, ready_for_approval, completed, failed) and reviewUrl back to TaskFlow.',
      },
    },
  );
