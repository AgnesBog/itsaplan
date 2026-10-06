import { t } from 'elysia';

export const cadenceTypeEnum = t.Union([
  t.Literal('calendar'),
  t.Literal('completion_relative'),
  t.Literal('cycle'),
  t.Literal('manual'),
]);

export const executionPolicyEnum = t.Union([
  t.Literal('human_task'),
  t.Literal('human_triggered'),
  t.Literal('automated_capability'),
]);

export const routineStatusEnum = t.Union([
  t.Literal('active'),
  t.Literal('paused'),
  t.Literal('archived'),
]);

export const ActiveIssueSummary = t.Object({
  id: t.Number(),
  identifier: t.String(),
  title: t.String(),
  stateType: t.String(),
  columnId: t.Number(),
  columnName: t.String(),
});

export const RoutineResponse = t.Object({
  id: t.Number(),
  teamId: t.Number(),
  projectId: t.Number(),
  title: t.String(),
  description: t.String(),
  slug: t.Nullable(t.String()),
  cadenceType: cadenceTypeEnum,
  cadenceConfig: t.Record(t.String(), t.Any()),
  executionPolicy: executionPolicyEnum,
  capabilityId: t.Nullable(t.String()),
  capabilitySlug: t.Optional(t.Nullable(t.String())),
  capabilityName: t.Optional(t.Nullable(t.String())),
  defaultInputPayload: t.Record(t.String(), t.Any()),
  issueTemplate: t.Record(t.String(), t.Any()),
  targetInitiativeId: t.Nullable(t.Number()),
  targetColumnId: t.Nullable(t.Number()),
  status: routineStatusEnum,
  activeIssueId: t.Nullable(t.Number()),
  activeIssue: t.Optional(t.Nullable(ActiveIssueSummary)),
  nextDueDate: t.Nullable(t.String()),
  lastCompletedAt: t.Nullable(t.String()),
  lastEvaluatedAt: t.Nullable(t.String()),
  brandId: t.Nullable(t.String()),
  createdAt: t.String(),
  updatedAt: t.String(),
});

export const RoutineListResponse = t.Array(RoutineResponse);

export const createRoutineBody = t.Object({
  projectId: t.Integer({ description: 'Target project ID' }),
  title: t.String({ description: 'Title of the recurring routine' }),
  description: t.Optional(t.String({ description: 'Description or standard instructions' })),
  slug: t.Optional(t.String({ description: 'Optional unique identifier' })),
  cadenceType: cadenceTypeEnum,
  cadenceConfig: t.Optional(t.Record(t.String(), t.Any())),
  executionPolicy: t.Optional(executionPolicyEnum),
  capabilityId: t.Optional(t.Nullable(t.String({ description: 'Attached capability ID or slug' }))),
  defaultInputPayload: t.Optional(t.Record(t.String(), t.Any(), { description: 'Tier 1 default capability inputs' })),
  issueTemplate: t.Optional(t.Record(t.String(), t.Any(), { description: 'Template fields for generated occurrence issues' })),
  targetInitiativeId: t.Optional(t.Nullable(t.Integer())),
  targetColumnId: t.Optional(t.Nullable(t.Integer())),
  status: t.Optional(routineStatusEnum),
  brandId: t.Optional(t.Nullable(t.String())),
  nextDueDate: t.Optional(t.Nullable(t.String())),
});

export const updateRoutineBody = t.Object({
  title: t.Optional(t.String()),
  description: t.Optional(t.String()),
  slug: t.Optional(t.Nullable(t.String())),
  cadenceType: t.Optional(cadenceTypeEnum),
  cadenceConfig: t.Optional(t.Record(t.String(), t.Any())),
  executionPolicy: t.Optional(executionPolicyEnum),
  capabilityId: t.Optional(t.Nullable(t.String())),
  defaultInputPayload: t.Optional(t.Record(t.String(), t.Any())),
  issueTemplate: t.Optional(t.Record(t.String(), t.Any())),
  targetInitiativeId: t.Optional(t.Nullable(t.Integer())),
  targetColumnId: t.Optional(t.Nullable(t.Integer())),
  status: t.Optional(routineStatusEnum),
  brandId: t.Optional(t.Nullable(t.String())),
  nextDueDate: t.Optional(t.Nullable(t.String())),
});

export const routineParams = t.Object({
  routineId: t.Numeric(),
});

export const listRoutinesQuery = t.Object({
  projectId: t.Optional(t.Numeric()),
  status: t.Optional(t.String()),
});

export const evaluateRoutinesQuery = t.Object({
  projectId: t.Optional(t.Numeric()),
});

export const triggerRoutineBody = t.Object({
  overrides: t.Optional(
    t.Record(t.String(), t.Any(), {
      description: 'Tier 2 / Tier 3 occurrence input overrides (e.g. { count: 7 })',
    }),
  ),
});

export const EvaluationResult = t.Object({
  routineId: t.Number(),
  routineTitle: t.String(),
  action: t.String(), // 'materialized' | 'materialized_and_invoked' | 'skipped'
  reason: t.Optional(t.String()),
  issueId: t.Optional(t.Nullable(t.Number())),
  invocationId: t.Optional(t.Nullable(t.Number())),
  nextDueDate: t.Optional(t.Nullable(t.String())),
});

export const EvaluationListResponse = t.Array(EvaluationResult);

export const TriggerRoutineResponse = t.Object({
  routineId: t.Number(),
  issueId: t.Number(),
  capabilitySlug: t.String(),
  effectivePayload: t.Record(t.String(), t.Any()),
  invocation: t.Any(),
});
