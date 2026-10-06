import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  listRoutines,
  getRoutine,
  createRoutine,
  updateRoutine,
  deleteRoutine,
  evaluateRoutine,
  evaluateAllRoutines,
  triggerRoutine,
  triggerIssueRoutine,
  type CreateRoutineInput,
  type UpdateRoutineInput,
} from '@/lib/api/endpoints/routines';
import { qk } from '@/services/queryKeys';

export function useRoutinesQuery(params?: { projectId?: number; status?: string }) {
  return useQuery({
    queryKey: qk.routines(params),
    queryFn: () => listRoutines(params),
    placeholderData: keepPreviousData,
  });
}

export function useRoutineQuery(routineId: number | null) {
  return useQuery({
    queryKey: qk.routine(routineId ?? 0),
    queryFn: () => getRoutine(routineId!),
    enabled: routineId != null,
  });
}

export function useCreateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoutineInput) => createRoutine(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useUpdateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UpdateRoutineInput }) =>
      updateRoutine(id, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: qk.routine(variables.id) });
      qc.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteRoutine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}

export function useEvaluateRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => evaluateRoutine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['boardIssues'] });
    },
  });
}

export function useEvaluateAllRoutines() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (projectId?: number) => evaluateAllRoutines(projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['routines'] });
      qc.invalidateQueries({ queryKey: ['boardIssues'] });
    },
  });
}

export function useTriggerRoutine() {
  return useMutation({
    mutationFn: ({ routineId, overrides }: { routineId: number; overrides?: Record<string, unknown> }) =>
      triggerRoutine(routineId, overrides),
  });
}

export function useTriggerIssueRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ issueId, overrides }: { issueId: number; overrides?: Record<string, unknown> }) =>
      triggerIssueRoutine(issueId, overrides),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['boardIssues'] });
    },
  });
}
