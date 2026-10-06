export type CadenceType = 'calendar' | 'completion_relative' | 'cycle' | 'manual';

export interface CalendarCadenceConfig {
  intervalDays?: number;
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  timeOfDay?: string; // "HH:MM" in 24h format (UTC), e.g. "09:00"
  cron?: string; // Standard 5-field cron: "min hour dom month dow"
}

export interface CompletionRelativeCadenceConfig {
  daysAfterCompletion?: number;
  hoursAfterCompletion?: number;
}

export interface CycleCadenceConfig {
  anchor?: 'start' | 'end'; // anchor relative to cycle start or end
  offsetDays?: number; // negative or positive days offset
}

export type CadenceConfig =
  | CalendarCadenceConfig
  | CompletionRelativeCadenceConfig
  | CycleCadenceConfig
  | Record<string, unknown>;

export interface CycleReference {
  id: number;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'upcoming' | 'active' | 'completed';
}

/**
 * Evaluates the next due date for a routine based on its cadence strategy.
 */
export function calculateNextDueDate(params: {
  cadenceType: CadenceType;
  cadenceConfig: CadenceConfig;
  fromTime?: Date;
  lastCompletedAt?: Date | null;
  activeCycle?: CycleReference | null;
  nextCycle?: CycleReference | null;
}): Date | null {
  const fromTime = params.fromTime ?? new Date();

  switch (params.cadenceType) {
    case 'manual':
      return null;

    case 'completion_relative': {
      const cfg = params.cadenceConfig as CompletionRelativeCadenceConfig;
      const base = params.lastCompletedAt ?? fromTime;
      const days = cfg.daysAfterCompletion ?? 0;
      const hours = cfg.hoursAfterCompletion ?? 0;
      const totalMs = (days * 24 * 60 + hours * 60) * 60 * 1000;
      return new Date(base.getTime() + totalMs);
    }

    case 'calendar': {
      const cfg = params.cadenceConfig as CalendarCadenceConfig;

      if (cfg.cron) {
        return calculateNextCronDate(cfg.cron, fromTime);
      }

      if (cfg.daysOfWeek && cfg.daysOfWeek.length > 0) {
        return calculateNextDayOfWeek(cfg.daysOfWeek, cfg.timeOfDay, fromTime);
      }

      if (cfg.intervalDays && cfg.intervalDays > 0) {
        const intervalMs = cfg.intervalDays * 24 * 60 * 60 * 1000;
        return new Date(fromTime.getTime() + intervalMs);
      }

      // Default fallback: 7 days
      return new Date(fromTime.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    case 'cycle': {
      const cfg = params.cadenceConfig as CycleCadenceConfig;
      const anchor = cfg.anchor ?? 'start';
      const offsetDays = cfg.offsetDays ?? 0;

      // Prefer upcoming cycle if fromTime >= activeCycle end, otherwise active cycle
      const targetCycle = params.activeCycle ?? params.nextCycle;
      if (!targetCycle) return null;

      const baseDateStr = anchor === 'end' ? targetCycle.endDate : targetCycle.startDate;
      const base = new Date(`${baseDateStr}T00:00:00.000Z`);
      base.setUTCDate(base.getUTCDate() + offsetDays);
      return base;
    }

    default:
      return null;
  }
}

/**
 * Calculates next date matching specific days of week and optional time.
 */
function calculateNextDayOfWeek(
  daysOfWeek: number[],
  timeOfDay: string = '00:00',
  from: Date,
): Date {
  const [hours, minutes] = timeOfDay.split(':').map((v) => parseInt(v, 10) || 0);

  // Check each day starting from today up to 14 days out
  const candidate = new Date(from.getTime());
  candidate.setUTCHours(hours, minutes, 0, 0);

  // If candidate is already in the past today, advance to next day
  if (candidate.getTime() <= from.getTime()) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  for (let i = 0; i < 14; i++) {
    const day = candidate.getUTCDay();
    if (daysOfWeek.includes(day)) {
      return candidate;
    }
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  // Fallback to 7 days
  return new Date(from.getTime() + 7 * 86400 * 1000);
}

/**
 * Standard 5-field cron parser & evaluator: "minute hour dom month dow"
 */
export function calculateNextCronDate(cron: string, from: Date): Date | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression '${cron}': expected 5 fields`);
  }

  const [minPart, hourPart, domPart, monthPart, dowPart] = parts;

  // Step minute by minute starting at from + 1 minute (truncated to seconds = 0)
  const current = new Date(from.getTime());
  current.setUTCSeconds(0, 0);
  current.setUTCMinutes(current.getUTCMinutes() + 1);

  // Search up to 366 days (527,040 minutes)
  const maxIterations = 527040;
  for (let i = 0; i < maxIterations; i++) {
    const min = current.getUTCMinutes();
    const hour = current.getUTCHours();
    const dom = current.getUTCDate();
    const month = current.getUTCMonth() + 1; // 1-12
    const dow = current.getUTCDay(); // 0-6

    if (
      matchField(minPart, min, 0, 59) &&
      matchField(hourPart, hour, 0, 23) &&
      matchField(domPart, dom, 1, 31) &&
      matchField(monthPart, month, 1, 12) &&
      matchField(dowPart, dow, 0, 6)
    ) {
      return current;
    }

    // Optimization: if hour or day doesn't match, skip forward
    if (!matchField(monthPart, month, 1, 12)) {
      current.setUTCMonth(current.getUTCMonth() + 1, 1);
      current.setUTCHours(0, 0, 0, 0);
      continue;
    }

    if (!matchField(domPart, dom, 1, 31) || !matchField(dowPart, dow, 0, 6)) {
      current.setUTCDate(current.getUTCDate() + 1);
      current.setUTCHours(0, 0, 0, 0);
      continue;
    }

    if (!matchField(hourPart, hour, 0, 23)) {
      current.setUTCHours(current.getUTCHours() + 1, 0, 0, 0);
      continue;
    }

    current.setUTCMinutes(current.getUTCMinutes() + 1);
  }

  return null;
}

function matchField(pattern: string, value: number, min: number, max: number): boolean {
  if (pattern === '*') return true;

  // Handle lists e.g. "1,3,5"
  if (pattern.includes(',')) {
    return pattern.split(',').some((sub) => matchField(sub.trim(), value, min, max));
  }

  // Handle steps e.g. "*/5" or "10-20/2"
  if (pattern.includes('/')) {
    const [range, stepStr] = pattern.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    if (range === '*') {
      return (value - min) % step === 0;
    }
    const [startStr, endStr] = range.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (value < start || value > end) return false;
    return (value - start) % step === 0;
  }

  // Handle ranges e.g. "1-5"
  if (pattern.includes('-')) {
    const [startStr, endStr] = pattern.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    return value >= start && value <= end;
  }

  // Exact number
  const exact = parseInt(pattern, 10);
  return value === exact;
}
