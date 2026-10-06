import { request } from '@/lib/api/core/client';

export type CadenceType = 'calendar' | 'completion_relative' | 'cycle' | 'manual';
export type ExecutionPolicy = 'human_task' | 'human_triggered' | 'automated_capability';
export type RoutineStatus = 'active' | 'paused' | 'archived';

export interface ActiveIssueSummary {
  id: number;
  identifier: string;
  title: string;
  stateType: string;
  columnId: number;
  columnName: string;
}

export interface Routine {
  id: number;
  teamId: number;
  projectId: number;
  title: string;
  description: string;
  slug: string | null;
  cadenceType: CadenceType;
  cadenceConfig: Record<string, unknown>;
  executionPolicy: ExecutionPolicy;
  capabilityId: string | null;
  capabilitySlug?: string | null;
  capabilityName?: string | null;
  defaultInputPayload: Record<string, unknown>;
  issueTemplate: Record<string, unknown>;
  targetInitiativeId: number | null;
  targetColumnId: number | null;
  status: RoutineStatus;
  activeIssueId: number | null;
  activeIssue?: ActiveIssueSummary | null;
  nextDueDate: string | null;
  lastCompletedAt: string | null;
  lastEvaluatedAt: string | null;
  brandId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoutineInput {
  projectId: number;
  title: string;
  description?: string;
  slug?: string;
  cadenceType: CadenceType;
  cadenceConfig?: Record<string, unknown>;
  executionPolicy?: ExecutionPolicy;
  capabilityId?: string | null;
  defaultInputPayload?: Record<string, unknown>;
  issueTemplate?: Record<string, unknown>;
  targetInitiativeId?: number | null;
  targetColumnId?: number | null;
  status?: RoutineStatus;
  brandId?: string | null;
  nextDueDate?: string | null;
}

export interface UpdateRoutineInput {
  title?: string;
  description?: string;
  slug?: string | null;
  cadenceType?: CadenceType;
  cadenceConfig?: Record<string, unknown>;
  executionPolicy?: ExecutionPolicy;
  capabilityId?: string | null;
  defaultInputPayload?: Record<string, unknown>;
  issueTemplate?: Record<string, unknown>;
  targetInitiativeId?: number | null;
  targetColumnId?: number | null;
  status?: RoutineStatus;
  brandId?: string | null;
  nextDueDate?: string | null;
}

export interface EvaluationResult {
  routineId: number;
  routineTitle: string;
  action: string;
  reason?: string;
  issueId?: number | null;
  invocationId?: number | null;
  nextDueDate?: string | null;
}

export interface TriggerRoutineResponse {
  routineId: number;
  issueId: number;
  capabilitySlug: string;
  effectivePayload: Record<string, unknown>;
  invocation: unknown;
}

export const listRoutines = (params?: { projectId?: number; status?: string }) => {
  const qs = new URLSearchParams();
  if (params?.projectId != null) qs.set('projectId', String(params.projectId));
  if (params?.status) qs.set('status', params.status);
  const qStr = qs.toString() ? `?${qs.toString()}` : '';
  return request<Routine[]>(`/routines${qStr}`);
};

export const getRoutine = (routineId: number) =>
  request<Routine>(`/routines/${routineId}`);

export const createRoutine = (input: CreateRoutineInput) =>
  request<Routine>('/routines', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const updateRoutine = (routineId: number, input: UpdateRoutineInput) =>
  request<Routine>(`/routines/${routineId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });

export const deleteRoutine = (routineId: number) =>
  request<void>(`/routines/${routineId}`, {
    method: 'DELETE',
  });

export const evaluateRoutine = (routineId: number) =>
  request<EvaluationResult>(`/routines/${routineId}/evaluate`, {
    method: 'POST',
  });

export const evaluateAllRoutines = (projectId?: number) => {
  const qs = projectId ? `?projectId=${projectId}` : '';
  return request<EvaluationResult[]>(`/routines/evaluate-all${qs}`, {
    method: 'POST',
  });
};

export const triggerRoutine = (routineId: number, overrides?: Record<string, unknown>) =>
  request<TriggerRoutineResponse>(`/routines/${routineId}/trigger`, {
    method: 'POST',
    body: JSON.stringify({ overrides }),
  });

export const triggerIssueRoutine = (issueId: number, overrides?: Record<string, unknown>) =>
  request<TriggerRoutineResponse>(`/issues/${issueId}/trigger-routine`, {
    method: 'POST',
    body: JSON.stringify({ overrides }),
  });
