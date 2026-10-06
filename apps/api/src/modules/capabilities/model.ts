import { t } from 'elysia';

export const executionTypeEnum = t.Union([
  t.Literal('local_runner'),
  t.Literal('cloud_http'),
  t.Literal('ai_agent'),
]);

export const invocationStatusEnum = t.Union([
  t.Literal('queued'),
  t.Literal('running'),
  t.Literal('ready_for_approval'),
  t.Literal('completed'),
  t.Literal('partial'),
  t.Literal('failed'),
]);

// Capability Object Response
export const CapabilityResponse = t.Object({
  id: t.String(),
  teamId: t.Number(),
  slug: t.String(),
  name: t.String(),
  description: t.Nullable(t.String()),
  executionType: t.String(),
  brandRestrictionId: t.Nullable(t.String()),
  executionConfig: t.Record(t.String(), t.Any()),
  inputSchema: t.Record(t.String(), t.Any()),
  timeoutSeconds: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const CapabilityListResponse = t.Array(CapabilityResponse);

// Create Capability Body
export const createCapabilityBody = t.Object({
  id: t.Optional(t.String({ description: 'Optional unique ID (defaults to slug)' })),
  slug: t.String({ description: 'Unique slug, e.g. recovery-video-production' }),
  name: t.String({ description: 'Human-readable name' }),
  description: t.Optional(t.String()),
  executionType: executionTypeEnum,
  brandRestrictionId: t.Optional(t.Nullable(t.String())),
  executionConfig: t.Optional(t.Record(t.String(), t.Any())),
  inputSchema: t.Optional(t.Record(t.String(), t.Any())),
  timeoutSeconds: t.Optional(t.Number({ default: 3600 })),
});

// Invoke Capability Body
export const invokeCapabilityBody = t.Object({
  capabilitySlug: t.String({ description: 'The slug of the registered capability' }),
  requestId: t.Optional(t.String({ description: 'Unique idempotent request ID (auto-generated if omitted)' })),
  issueId: t.Optional(t.Nullable(t.Number({ description: 'Optional ID of the related TaskFlow issue' }))),
  brandId: t.Optional(t.Nullable(t.String({ description: 'Active brand/business context for this run' }))),
  inputPayload: t.Optional(t.Record(t.String(), t.Any(), { description: 'Input parameters matching inputSchema' })),
});

// Invocation Object Response
export const InvocationResponse = t.Object({
  id: t.Number(),
  requestId: t.String(),
  capabilityId: t.String(),
  capabilitySlug: t.Optional(t.String()),
  teamId: t.Number(),
  issueId: t.Nullable(t.Number()),
  brandId: t.Nullable(t.String()),
  status: invocationStatusEnum,
  exitCode: t.Nullable(t.Number()),
  message: t.Nullable(t.String()),
  reviewUrl: t.Nullable(t.String()),
  inputPayload: t.Record(t.String(), t.Any()),
  outputPayload: t.Record(t.String(), t.Any()),
  error: t.Nullable(t.String()),
  leaseExpiresAt: t.Nullable(t.String()),
  lastHeartbeatAt: t.Nullable(t.String()),
  startedAt: t.Nullable(t.String()),
  finishedAt: t.Nullable(t.String()),
  attempts: t.Number(),
  createdAt: t.String(),
  updatedAt: t.String(),
});

// Runner Claim Response
export const RunnerJobResponse = t.Object({
  id: t.Number(),
  requestId: t.String(),
  capabilityId: t.String(),
  capabilitySlug: t.String(),
  capabilityName: t.String(),
  executionType: t.String(),
  executionConfig: t.Record(t.String(), t.Any()),
  inputPayload: t.Record(t.String(), t.Any()),
  brandId: t.Nullable(t.String()),
  issueId: t.Nullable(t.Number()),
  attempts: t.Number(),
  leaseExpiresAt: t.String(),
});

export const RunnerClaimResponse = t.Object({
  job: t.Nullable(RunnerJobResponse),
});

export const runnerJobParams = t.Object({
  id: t.Numeric(),
});

// Runner Status Update Body
export const runnerStatusBody = t.Object({
  status: invocationStatusEnum,
  exitCode: t.Optional(t.Nullable(t.Number())),
  message: t.Optional(t.Nullable(t.String())),
  reviewUrl: t.Optional(t.Nullable(t.String({ description: 'URL for external human review/approval' }))),
  outputPayload: t.Optional(t.Record(t.String(), t.Any())),
  error: t.Optional(t.Nullable(t.String())),
});

// Runner Heartbeat Body
export const runnerHeartbeatBody = t.Optional(
  t.Object({
    leaseSeconds: t.Optional(t.Number({ default: 300 })),
  }),
);

export const requestIdParams = t.Object({
  requestId: t.String(),
});
