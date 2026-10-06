'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useShell } from '@/context/shellContext';
import { useShellRoute } from '@/hooks/useShellRoute';
import { useInitiativesQuery, useUpdateInitiative } from '@/services/initiatives.service';
import { useUpdateIssue } from '@/services/issues.service';

import {
  useRoutinesQuery,
  useCreateRoutine,
  useUpdateRoutine,
  useTriggerIssueRoutine,
} from '@/services/routines.service';
import type { Routine, CadenceType } from '@/lib/api/endpoints/routines';
import type { InitiativeStatus } from '@/lib/api/endpoints/initiatives';

// -------------------------------------------------------------
// TYPES & DATA STRUCTURES
// -------------------------------------------------------------
export interface QmwTask {
  id: number;
  seq: number;
  title: string;
  description: string;
  status: string;
  prio: string;
  startDate: string;
  dueDate: string;
  tags: string[];
  capabilitySlug?: string | null;
  workflow?: string | null;
  parentIssueTitle?: string;
  parentIssueSeq?: number;
  parentInitiativeTitle?: string;
  parentInitiativeSeq?: number;
  routineId?: number | null;
  routineOverridePayload?: Record<string, unknown>;
  columnId?: number;
  isCompleted?: boolean;
}

export interface QmwIssue {
  id: number;
  seq: number;
  title: string;
  description: string;
  status: string;
  prio: string;
  startDate: string;
  dueDate: string;
  tags: string[];
  capabilitySlug?: string | null;
  workflow?: string | null;
  parentInitiativeTitle?: string;
  parentInitiativeSeq?: number;
  routineId?: number | null;
  routineOverridePayload?: Record<string, unknown>;
  columnId?: number;
  isCompleted?: boolean;
  subtasks: QmwTask[];
}

export interface QmwInitiative {
  id: number;
  seq: number;
  title: string;
  description: string;
  status: string;
  prio: string;
  startDate: string;
  dueDate: string;
  tags: string[];
  capabilitySlug?: string | null;
  workflow?: string | null;
  routineId?: number | null;
  routineOverridePayload?: Record<string, unknown>;
  issues: QmwIssue[];
}

export interface BacklogPoolItem {
  type: 'initiative' | 'issue';
  id: number;
  title: string;
  status?: string;
  prio?: string;
  parent?: string;
}

export interface QmwProjectData {
  id: number;
  name: string;
  key: string;
  initiatives: QmwInitiative[];
  backlogPool: BacklogPoolItem[];
}

const EMPTY_PLANNER_DATA: QmwProjectData = {
  id: 0,
  name: '',
  key: '',
  initiatives: [],
  backlogPool: []
};

// -------------------------------------------------------------
// DATE UTILITIES (Strict Local Noon & Duration Preservation)
// -------------------------------------------------------------
function toApiIsoDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function sanitizeDateRange(
  startStr: string | null | undefined,
  dueStr: string | null | undefined
): { startDate: string | null; dueDate: string | null } {
  const start = toApiIsoDate(startStr);
  let due = toApiIsoDate(dueStr);

  if (start && due && due < start) {
    // If due date precedes start date, align due date to start date to satisfy assertDateOrder
    due = start;
  }

  return { startDate: start, dueDate: due };
}

function parseLocalDate(dateStr: string | null | undefined): Date | null {
  const clean = toApiIsoDate(dateStr);
  if (!clean) return null;
  const parts = clean.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m, d, 12, 0, 0);
}

function formatLocalDate(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateDurationDays(startStr: string | null | undefined, dueStr: string | null | undefined): number | null {
  if (!startStr || !dueStr) return null;
  const dStart = parseLocalDate(startStr);
  const dDue = parseLocalDate(dueStr);
  if (!dStart || !dDue) return null;
  const diffTime = dDue.getTime() - dStart.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
  return diffDays >= 0 ? diffDays : 0;
}

function shiftDateRange(
  startStr: string | null | undefined,
  dueStr: string | null | undefined,
  newStartStr: string | null | undefined
): { startDate: string; dueDate: string } {
  if (!newStartStr || newStartStr.trim() === '') {
    return { startDate: '', dueDate: '' };
  }
  const cleanNewStart = toApiIsoDate(newStartStr);
  if (!cleanNewStart) {
    return { startDate: '', dueDate: '' };
  }

  const duration = calculateDurationDays(startStr, dueStr);
  const newStartDate = parseLocalDate(cleanNewStart);
  if (!newStartDate) return { startDate: cleanNewStart, dueDate: '' };

  if (duration !== null && duration >= 0) {
    const newDueDate = new Date(
      newStartDate.getFullYear(),
      newStartDate.getMonth(),
      newStartDate.getDate() + duration,
      12,
      0,
      0
    );
    return {
      startDate: formatLocalDate(newStartDate),
      dueDate: formatLocalDate(newDueDate),
    };
  }

  const existingDue = toApiIsoDate(dueStr);
  if (existingDue && existingDue >= cleanNewStart) {
    return {
      startDate: cleanNewStart,
      dueDate: existingDue,
    };
  }

  return {
    startDate: cleanNewStart,
    dueDate: cleanNewStart,
  };
}

function isCanceled(
  col?: { stateType?: string; name?: string } | null,
  statusStr?: string | null
): boolean {
  if (col) {
    if (col.stateType === 'canceled') return true;
    const nameLower = (col.name || '').toLowerCase().trim();
    if (nameLower === 'canceled' || nameLower === 'cancelled') return true;
  }
  if (statusStr) {
    const s = statusStr.toLowerCase().trim();
    if (s === 'canceled' || s === 'cancelled') return true;
  }
  return false;
}

function isInitiativeCanceled(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === 'canceled' || s === 'cancelled';
}

function isDone(
  col?: { stateType?: string; name?: string } | null,
  statusStr?: string | null
): boolean {
  if (col) {
    if (col.stateType === 'completed') return true;
    const nameLower = (col.name || '').toLowerCase().trim();
    if (nameLower === 'done' || nameLower === 'completed') return true;
  }
  if (statusStr) {
    const s = statusStr.toLowerCase().trim();
    if (s === 'done' || s === 'completed') return true;
  }
  return false;
}

function isInitiativeDone(status?: string | null): boolean {
  if (!status) return false;
  const s = status.toLowerCase().trim();
  return s === 'completed' || s === 'done';
}

// Calendar Constants & Month Names
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

function getMondayOfDate(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return copy;
}

// Dynamic Week Schedule (Chronological Monday -> Sunday + Unscheduled)
function getWeekSchedule(monday: Date) {
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const columns = dayNames.map((name, idx) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + idx, 12, 0, 0);
    const targetDate = formatLocalDate(d);
    const monthShort = SHORT_MONTH_NAMES[d.getMonth()];
    const dayNum = d.getDate();
    return {
      id: `day-${targetDate}`,
      dayIdx: idx,
      label: name,
      sublabel: `${monthShort} ${dayNum}`,
      targetDate,
      isWeekend: idx >= 5
    };
  });

  columns.push({
    id: 'unscheduled',
    dayIdx: -1,
    label: 'Unscheduled',
    sublabel: 'No planning date',
    targetDate: '',
    isWeekend: false
  });

  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6, 12, 0, 0);
  const rangeLabel = `${SHORT_MONTH_NAMES[monday.getMonth()]} ${monday.getDate()} – ${SHORT_MONTH_NAMES[sunday.getMonth()]} ${sunday.getDate()}, ${sunday.getFullYear()}`;

  return {
    mondayIso: formatLocalDate(monday),
    sundayIso: formatLocalDate(sunday),
    rangeLabel,
    columns
  };
}

// Dynamic Month Schedule (Weeks 1-4+ + Unscheduled)
function getMonthSchedule(year: number, month: number) {
  const monthName = MONTH_NAMES[month - 1];
  const lastDay = new Date(year, month, 0).getDate();
  const padMonth = String(month).padStart(2, '0');

  const columns = [
    {
      id: 'w1',
      label: 'Week 1',
      sublabel: `${SHORT_MONTH_NAMES[month - 1]} 1 – 7`,
      targetDate: `${year}-${padMonth}-01`,
      startDay: 1,
      endDay: 7
    },
    {
      id: 'w2',
      label: 'Week 2',
      sublabel: `${SHORT_MONTH_NAMES[month - 1]} 8 – 14`,
      targetDate: `${year}-${padMonth}-08`,
      startDay: 8,
      endDay: 14
    },
    {
      id: 'w3',
      label: 'Week 3',
      sublabel: `${SHORT_MONTH_NAMES[month - 1]} 15 – 21`,
      targetDate: `${year}-${padMonth}-15`,
      startDay: 15,
      endDay: 21
    },
    {
      id: 'w4',
      label: 'Week 4+',
      sublabel: `${SHORT_MONTH_NAMES[month - 1]} 22 – ${lastDay}`,
      targetDate: `${year}-${padMonth}-22`,
      startDay: 22,
      endDay: lastDay
    },
    {
      id: 'unscheduled',
      label: 'Unscheduled',
      sublabel: 'Month Backlog • No dates',
      targetDate: '',
      startDay: 0,
      endDay: 0
    }
  ];

  return {
    year,
    month,
    title: `${monthName} ${year}`,
    columns
  };
}

// Dynamic Quarter Schedule (Months 1-3 + Unallocated)
function getQuarterSchedule(year: number, quarter: number) {
  const m1 = (quarter - 1) * 3 + 1;
  const m2 = m1 + 1;
  const m3 = m1 + 2;

  const m1Name = MONTH_NAMES[m1 - 1];
  const m2Name = MONTH_NAMES[m2 - 1];
  const m3Name = MONTH_NAMES[m3 - 1];

  const padM1 = String(m1).padStart(2, '0');
  const padM2 = String(m2).padStart(2, '0');
  const padM3 = String(m3).padStart(2, '0');

  const columns = [
    {
      id: 'm1',
      monthNum: m1,
      label: `Month 1 • ${m1Name}`,
      sublabel: `${m1Name} 1 – ${new Date(year, m1, 0).getDate()}, ${year}`,
      targetDate: `${year}-${padM1}-01`
    },
    {
      id: 'm2',
      monthNum: m2,
      label: `Month 2 • ${m2Name}`,
      sublabel: `${m2Name} 1 – ${new Date(year, m2, 0).getDate()}, ${year}`,
      targetDate: `${year}-${padM2}-01`
    },
    {
      id: 'm3',
      monthNum: m3,
      label: `Month 3 • ${m3Name}`,
      sublabel: `${m3Name} 1 – ${new Date(year, m3, 0).getDate()}, ${year}`,
      targetDate: `${year}-${padM3}-01`
    },
    {
      id: 'unallocated',
      monthNum: 0,
      label: 'Unscheduled',
      sublabel: 'Strategic Reserve • No dates',
      targetDate: ''
    }
  ];

  return {
    year,
    quarter,
    title: `Q${quarter} ${year} (${SHORT_MONTH_NAMES[m1 - 1]} – ${SHORT_MONTH_NAMES[m3 - 1]})`,
    columns
  };
}

// -------------------------------------------------------------
// MAIN COMPONENT: QmwPlannerPage
// -------------------------------------------------------------
export default function QmwPlannerPage() {
  const { project: shellProject } = useShell();
  const shellRoute = useShellRoute();
  const projectKey = shellProject?.project.ref || shellRoute.projectKey || '';
  const currentProjectId = shellProject?.project.id;

  // TaskFlow Queries & Mutations
  const { data: initiativesData } = useInitiativesQuery(projectKey || null, { page: 1, pageSize: 100 });
  const updateIssue = useUpdateIssue(projectKey || null);
  const updateInitiative = useUpdateInitiative(projectKey || '');

  // Routine Queries & Mutations
  const { data: routinesList } = useRoutinesQuery(currentProjectId ? { projectId: currentProjectId } : undefined);
  const createRoutineMutation = useCreateRoutine();
  const updateRoutineMutation = useUpdateRoutine();
  const triggerIssueRoutine = useTriggerIssueRoutine();

  // Primary Planner State
  const [plannerData, setPlannerData] = useState<QmwProjectData>(EMPTY_PLANNER_DATA);

  const [currentView, setCurrentView] = useState<'quarter' | 'month' | 'week'>('week');
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOfDate(new Date()));
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number }>(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() + 1 };
  });
  const [selectedQuarter, setSelectedQuarter] = useState<{ year: number; quarter: number }>(() => {
    const n = new Date();
    return { year: n.getFullYear(), quarter: Math.floor(n.getMonth() / 3) + 1 };
  });

  const [selectedInitiativeFilter, setSelectedInitiativeFilter] = useState<string>('all');
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
    }
    if (isFilterDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isFilterDropdownOpen]);

  // Work Item Drawer State
  const [activeEditingRecord, setActiveEditingRecord] = useState<{
    type: 'initiative' | 'issue' | 'subtask';
    id: number;
    seq: number;
    title: string;
    description: string;
    status: string;
    columnId?: number;
    isCompleted?: boolean;
    prio: string;
    startDate: string;
    dueDate: string;
    tags: string[];
    capabilitySlug?: string | null;
    workflow?: string | null;
    breadcrumb: string;
    routineId?: number | null;
    routineOverridePayload?: Record<string, unknown>;
  } | null>(null);

  // Drawer Form fields
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerDescription, setDrawerDescription] = useState('');
  const [drawerStatus, setDrawerStatus] = useState('Todo');
  const [drawerColumnId, setDrawerColumnId] = useState<number | undefined>(undefined);
  const [drawerPriority, setDrawerPriority] = useState('Normal');
  const [drawerStartDate, setDrawerStartDate] = useState('');
  const [drawerDueDate, setDrawerDueDate] = useState('');

  // Routine Management in Drawer
  const [showMakeRecurringSelect, setShowMakeRecurringSelect] = useState(false);
  const [routineParamType, setRoutineParamType] = useState('new');
  const [routineParamCount, setRoutineParamCount] = useState(7);
  const [isTriggeringRoutine, setIsTriggeringRoutine] = useState(false);
  const [routineTriggerResult, setRoutineTriggerResult] = useState<{
    invocationId: number;
    requestId: string;
    status: string;
    type: string;
    count: number;
  } | null>(null);

  // Backlog Pull Drawer State
  const [isBacklogDrawerOpen, setIsBacklogDrawerOpen] = useState(false);
  const [backlogSearch, setBacklogSearch] = useState('');
  const [backlogFilterTab, setBacklogFilterTab] = useState<'all' | 'initiative' | 'issue' | 'subtask'>('all');

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warn' | 'info' } | null>(null);

  // Highlighted card animation ref
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  // Dragging state
  const draggedItemRef = useRef<{ type: 'initiative' | 'issue' | 'subtask'; id: number } | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);

  // Initialize and synchronize with TaskFlow Project and Database
  useEffect(() => {
    if (!shellProject?.project) return;

    const projectId = shellProject.project.id;
    const projectName = shellProject.project.name;
    const projectKeyStr = shellProject.project.key;

    const merged: QmwProjectData = {
      id: projectId,
      name: projectName,
      key: projectKeyStr.toUpperCase(),
      initiatives: [],
      backlogPool: []
    };

    // 1. Process all live initiatives from TaskFlow strictly for the current project
    if (initiativesData && initiativesData.items && initiativesData.items.length > 0) {
      initiativesData.items.forEach((liveInit) => {
        if (liveInit.projectId !== projectId) return;
        if (isInitiativeCanceled(liveInit.status)) return;
        const sDate = toApiIsoDate(liveInit.startDate);
        const isCompletedInit = isInitiativeDone(liveInit.status);
        // Completed undated initiative must not appear in QMW
        if (isCompletedInit && !sDate) return;

        merged.initiatives.push({
          id: liveInit.id,
          seq: liveInit.id,
          title: liveInit.title,
          description: liveInit.description || '',
          status: liveInit.status ? (liveInit.status.charAt(0).toUpperCase() + liveInit.status.slice(1).replace('_', ' ')) : 'Active',
          prio: liveInit.priority || 'Normal',
          startDate: sDate || '',
          dueDate: toApiIsoDate(liveInit.targetDate) || '',
          tags: ['Initiative'],
          issues: []
        });
      });
    }

    // Always include a General & Recurring Work container for items without an explicit initiative
    let generalInit = merged.initiatives.find((i) => i.id === 0);
    if (!generalInit) {
      generalInit = {
        id: 0,
        seq: 0,
        title: 'General & Recurring Work',
        description: 'General tasks, routines, and unassigned work items',
        status: 'Active',
        prio: 'Normal',
        startDate: '',
        dueDate: '',
        tags: ['General'],
        issues: []
      };
      merged.initiatives.push(generalInit);
    }

    // 2. Process all live issues and subtasks from TaskFlow (via shellProject.issues) strictly for the current project
    if (shellProject && shellProject.issues && shellProject.issues.length > 0) {
      const currentProjectIssues = shellProject.issues.filter((i) => i.projectId === projectId);
      const topLevelIssues = currentProjectIssues.filter((i) => !i.parentId);
      const subtaskIssues = currentProjectIssues.filter((i) => !!i.parentId);

      topLevelIssues.forEach((liveIssue) => {
        const col = shellProject.columns?.find((c) => c.id === liveIssue.columnId);
        if (isCanceled(col)) return;

        const isCompleted = isDone(col);
        const sDate = toApiIsoDate(liveIssue.startDate);
        // Completed undated issue must not appear in QMW
        if (isCompleted && !sDate) return;

        const initId = liveIssue.initiative?.id;
        let targetInit = initId ? merged.initiatives.find((i) => i.id === initId) : null;
        if (!targetInit) targetInit = generalInit;

        const statusName = col ? col.name : (isCompleted ? 'Done' : 'Todo');

        const isRecovery = liveIssue.routineId === 3 || liveIssue.title.toLowerCase().includes('recovery guy');

        targetInit.issues.push({
          id: liveIssue.id,
          seq: liveIssue.sequenceNumber,
          title: liveIssue.title,
          description: liveIssue.description || '',
          status: statusName,
          prio: liveIssue.priority ? (liveIssue.priority.charAt(0).toUpperCase() + liveIssue.priority.slice(1)) : 'Normal',
          startDate: sDate || '',
          dueDate: toApiIsoDate(liveIssue.dueDate) || '',
          tags: isRecovery ? ['recovery-video-production', 'Daily-Run', 'Automated'] : (liveIssue.routineId ? ['Issue', 'recurring'] : ['Issue']),
          capabilitySlug: isRecovery ? 'recovery-video-production' : null,
          workflow: isRecovery ? 'recovery-video-production' : null,
          routineId: liveIssue.routineId ?? null,
          routineOverridePayload: liveIssue.routineOverridePayload ?? {},
          columnId: liveIssue.columnId,
          isCompleted,
          parentInitiativeTitle: targetInit.title,
          parentInitiativeSeq: targetInit.seq,
          subtasks: []
        });
      });

      // Subtasks
      subtaskIssues.forEach((liveSub) => {
        const col = shellProject.columns?.find((c) => c.id === liveSub.columnId);
        if (isCanceled(col)) return;

        const isCompleted = isDone(col);
        const sDate = toApiIsoDate(liveSub.startDate);
        // Completed undated subtask must not appear in QMW
        if (isCompleted && !sDate) return;

        let parentIssue: QmwIssue | null = null;
        for (const init of merged.initiatives) {
          const found = init.issues.find((iss) => iss.id === liveSub.parentId);
          if (found) {
            parentIssue = found;
            break;
          }
        }

        if (parentIssue) {
          const statusName = col ? col.name : (isCompleted ? 'Done' : 'Todo');

          parentIssue.subtasks.push({
            id: liveSub.id,
            seq: liveSub.sequenceNumber,
            title: liveSub.title,
            description: liveSub.description || '',
            status: statusName,
            prio: liveSub.priority ? (liveSub.priority.charAt(0).toUpperCase() + liveSub.priority.slice(1)) : 'Normal',
            startDate: sDate || '',
            dueDate: toApiIsoDate(liveSub.dueDate) || '',
            tags: liveSub.routineId ? ['Task', 'recurring'] : ['Task'],
            routineId: liveSub.routineId ?? null,
            routineOverridePayload: liveSub.routineOverridePayload ?? {},
            columnId: liveSub.columnId,
            isCompleted,
            parentIssueTitle: parentIssue.title,
            parentIssueSeq: parentIssue.seq,
            parentInitiativeTitle: parentIssue.parentInitiativeTitle,
            parentInitiativeSeq: parentIssue.parentInitiativeSeq
          });
        }
      });
    }

    setPlannerData(merged);

    // If an initiative filter is active from another project, reset it
    setSelectedInitiativeFilter((prev) => {
      if (prev === 'all') return prev;
      return merged.initiatives.some((i) => String(i.id) === prev) ? prev : 'all';
    });
  }, [initiativesData, shellProject]);

  // Toast auto-clear
  const showToast = (message: string, type: 'success' | 'warn' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Switch Planning View
  const switchView = (view: 'quarter' | 'month' | 'week') => {
    setCurrentView(view);
  };

  // Jump from Month to specific Week
  const jumpToWeek = (targetDateStr: string) => {
    const d = parseLocalDate(targetDateStr);
    if (d) {
      setWeekMonday(getMondayOfDate(d));
    }
    setCurrentView('week');
  };

  // Jump from Quarter to specific Month
  const jumpToMonth = (monthNum: number, yearNum: number) => {
    setSelectedMonth({ year: yearNum, month: monthNum });
    setCurrentView('month');
  };

  // Dynamic Schedules
  const todayIso = useMemo(() => formatLocalDate(new Date()), []);
  const currentWeekSchedule = useMemo(() => getWeekSchedule(weekMonday), [weekMonday]);
  const currentMonthSchedule = useMemo(() => getMonthSchedule(selectedMonth.year, selectedMonth.month), [selectedMonth]);
  const currentQuarterSchedule = useMemo(() => getQuarterSchedule(selectedQuarter.year, selectedQuarter.quarter), [selectedQuarter]);

  // Execute Allocation Move (Drag and drop with immediate TaskFlow writeback & rollback on error)
  const executeAllocationMove = (
    type: 'initiative' | 'issue' | 'subtask',
    id: number,
    targetColId: string
  ) => {
    const previousPlannerData = plannerData;
    const copy: QmwProjectData = JSON.parse(JSON.stringify(plannerData));

    if (type === 'initiative') {
      if (id === 0) {
        showToast('ℹ "General & Recurring Work" is a virtual container and cannot be rescheduled.', 'info');
        return;
      }
      const init = copy.initiatives.find((i) => i.id === id);
      if (!init) return;

      const colDef = currentQuarterSchedule.columns.find((c) => c.id === targetColId) || { label: targetColId, targetDate: '' };
      const duration = calculateDurationDays(init.startDate, init.dueDate);
      const { startDate, dueDate } = shiftDateRange(init.startDate, init.dueDate, colDef.targetDate);
      const sanitized = sanitizeDateRange(startDate, dueDate);

      init.startDate = sanitized.startDate || '';
      init.dueDate = sanitized.dueDate || '';
      setPlannerData(copy);

      // Persist to TaskFlow database with rollback protection
      updateInitiative.mutate(
        {
          id: init.id,
          patch: {
            startDate: sanitized.startDate,
            targetDate: sanitized.dueDate,
          }
        },
        {
          onError: (err: any) => {
            setPlannerData(previousPlannerData);
            showToast(`❌ Move failed: ${err?.message || 'Server error'}. Restored Initiative #${init.seq}.`, 'warn');
          },
          onSuccess: () => {
            const durMsg = duration !== null && duration > 0 ? ` (${duration}d duration preserved)` : '';
            showToast(`✓ Initiative #${init.seq} moved to ${colDef.label}: ${sanitized.startDate || 'Unscheduled'}${durMsg}`, 'success');
          }
        }
      );

    } else if (type === 'issue') {
      let targetIssue: QmwIssue | null = null;
      for (const init of copy.initiatives) {
        const found = init.issues.find((i) => i.id === id);
        if (found) { targetIssue = found; break; }
      }
      if (!targetIssue) return;

      const colDef = currentMonthSchedule.columns.find((c) => c.id === targetColId) || { label: targetColId, targetDate: '' };
      const duration = calculateDurationDays(targetIssue.startDate, targetIssue.dueDate);
      const { startDate, dueDate } = shiftDateRange(targetIssue.startDate, targetIssue.dueDate, colDef.targetDate);
      const sanitized = sanitizeDateRange(startDate, dueDate);

      targetIssue.startDate = sanitized.startDate || '';
      targetIssue.dueDate = sanitized.dueDate || '';

      // Month -> Week allocation:
      // When an Issue is allocated to a week, assign that week's appropriate startDate
      // to its undated child Tasks so they appear in Weekly planning.
      // Set/update startDate only. Do NOT manufacture dueDate.
      // Preserve child Tasks that already have intentional scheduling.
      const updatedChildTasks: { id: number; seq: number; startDate: string }[] = [];
      if (sanitized.startDate && targetIssue.subtasks && targetIssue.subtasks.length > 0) {
        targetIssue.subtasks.forEach((sub) => {
          if (!sub.startDate) {
            sub.startDate = sanitized.startDate!;
            updatedChildTasks.push({ id: sub.id, seq: sub.seq, startDate: sanitized.startDate! });
          }
        });
      }

      setPlannerData(copy);

      // Persist to TaskFlow database with rollback protection
      updateIssue.mutate(
        {
          id: targetIssue.id,
          patch: {
            startDate: sanitized.startDate,
            dueDate: sanitized.dueDate,
          }
        },
        {
          onError: (err: any) => {
            setPlannerData(previousPlannerData);
            showToast(`❌ Move failed: ${err?.message || 'Server error'}. Restored Issue #${targetIssue.seq}.`, 'warn');
          },
          onSuccess: () => {
            // Persist child task startDate updates without manufacturing dueDate
            updatedChildTasks.forEach((child) => {
              updateIssue.mutate({
                id: child.id,
                patch: {
                  startDate: child.startDate,
                }
              });
            });

            const durMsg = duration !== null && duration > 0 ? ` (${duration}d duration preserved)` : '';
            const childMsg = updatedChildTasks.length > 0 ? ` (${updatedChildTasks.length} child task${updatedChildTasks.length > 1 ? 's' : ''} scheduled for Weekly view)` : '';
            showToast(`✓ Issue #${targetIssue.seq} moved to ${colDef.label}: ${sanitized.startDate || 'Unscheduled'}${durMsg}${childMsg}`, 'success');
          }
        }
      );

    } else if (type === 'subtask') {
      let targetSub: QmwTask | null = null;
      for (const init of copy.initiatives) {
        for (const iss of init.issues) {
          const found = iss.subtasks.find((s) => s.id === id);
          if (found) { targetSub = found; break; }
        }
      }
      if (!targetSub) return;

      const colDef = currentWeekSchedule.columns.find((c) => c.id === targetColId) || { label: targetColId, targetDate: '' };
      const duration = calculateDurationDays(targetSub.startDate, targetSub.dueDate);
      const { startDate, dueDate } = shiftDateRange(targetSub.startDate, targetSub.dueDate, colDef.targetDate);
      const sanitized = sanitizeDateRange(startDate, dueDate);

      targetSub.startDate = sanitized.startDate || '';
      targetSub.dueDate = sanitized.dueDate || '';
      setPlannerData(copy);

      // Persist to TaskFlow database with rollback protection
      updateIssue.mutate(
        {
          id: targetSub.id,
          patch: {
            startDate: sanitized.startDate,
            dueDate: sanitized.dueDate,
          }
        },
        {
          onError: (err: any) => {
            setPlannerData(previousPlannerData);
            showToast(`❌ Move failed: ${err?.message || 'Server error'}. Restored Task #${targetSub.seq}.`, 'warn');
          },
          onSuccess: () => {
            const durMsg = duration !== null && duration > 0 ? ` (${duration}d duration preserved)` : '';
            const dateNote = sanitized.startDate ? `${sanitized.startDate}${sanitized.dueDate && sanitized.dueDate !== sanitized.startDate ? ' → ' + sanitized.dueDate : ''}` : 'Unscheduled';
            showToast(`✓ Task #${targetSub.seq} placed under ${colDef.label}: ${dateNote}${durMsg}`, 'success');
          }
        }
      );
    }
  };

  // Open Work Item Drawer
  const openWorkItemDrawer = (type: 'initiative' | 'issue' | 'subtask', id: number) => {
    let rec: any = null;
    if (type === 'initiative') {
      const init = plannerData.initiatives.find((i) => i.id === id);
      if (init) {
        rec = {
          type,
          id: init.id,
          seq: init.seq,
          title: init.title,
          description: init.description,
          status: init.status || 'Active',
          prio: init.prio || 'Normal',
          startDate: init.startDate,
          dueDate: init.dueDate,
          tags: init.tags || ['Initiative'],
          capabilitySlug: init.capabilitySlug,
          workflow: init.workflow,
          routineId: init.routineId ?? null,
          routineOverridePayload: init.routineOverridePayload ?? {},
          breadcrumb: `${plannerData.name} › Initiative #${init.seq}`
        };
      }
    } else if (type === 'issue') {
      for (const init of plannerData.initiatives) {
        const iss = init.issues.find((i) => i.id === id);
        if (iss) {
          rec = {
            type,
            id: iss.id,
            seq: iss.seq,
            title: iss.title,
            description: iss.description,
            status: iss.status || 'Todo',
            columnId: iss.columnId,
            isCompleted: iss.isCompleted,
            prio: iss.prio || 'Normal',
            startDate: iss.startDate,
            dueDate: iss.dueDate,
            tags: iss.tags || ['Issue'],
            capabilitySlug: iss.capabilitySlug,
            workflow: iss.workflow,
            routineId: iss.routineId ?? null,
            routineOverridePayload: iss.routineOverridePayload ?? {},
            breadcrumb: `${plannerData.name} › #${init.seq} ${init.title}`
          };
          break;
        }
      }
    } else if (type === 'subtask') {
      for (const init of plannerData.initiatives) {
        for (const iss of init.issues) {
          const sub = iss.subtasks.find((s) => s.id === id);
          if (sub) {
            rec = {
              type,
              id: sub.id,
              seq: sub.seq,
              title: sub.title,
              description: sub.description,
              status: sub.status || 'Todo',
              columnId: sub.columnId,
              isCompleted: sub.isCompleted,
              prio: sub.prio || 'Normal',
              startDate: sub.startDate,
              dueDate: sub.dueDate,
              tags: sub.tags || ['Task'],
              capabilitySlug: sub.capabilitySlug,
              workflow: sub.workflow,
              routineId: sub.routineId ?? null,
              routineOverridePayload: sub.routineOverridePayload ?? {},
              breadcrumb: `Initiative #${init.seq} › ${iss.title}`
            };
            break;
          }
        }
      }
    }

    if (!rec) return;

    setActiveEditingRecord(rec);
    setDrawerTitle(rec.title);
    setDrawerDescription(rec.description || '');
    setDrawerStatus(rec.status || 'Todo');
    setDrawerColumnId(rec.columnId);
    setDrawerPriority(rec.prio || 'Normal');
    setDrawerStartDate(rec.startDate || '');
    setDrawerDueDate(rec.dueDate || '');
    setShowMakeRecurringSelect(false);
    setRoutineTriggerResult(null);

    const payload = rec.routineOverridePayload || {};
    setRoutineParamType((payload.type as string) || 'new');
    setRoutineParamCount(Number(payload.count) || 7);
  };

  // Close Work Item Drawer
  const closeWorkItemDrawer = () => {
    setActiveEditingRecord(null);
  };

  // Routine Resolution
  const connectedRoutine = useMemo(() => {
    if (!activeEditingRecord || !routinesList) return null;
    return (
      routinesList.find(
        (r) =>
          (activeEditingRecord.routineId && r.id === activeEditingRecord.routineId) ||
          r.activeIssueId === activeEditingRecord.id
      ) || null
    );
  }, [activeEditingRecord, routinesList]);

  // Child Tasks for Active Issue in Drawer
  const currentIssueChildTasks = useMemo(() => {
    if (!activeEditingRecord || activeEditingRecord.type !== 'issue') return [];
    for (const init of plannerData.initiatives) {
      const iss = init.issues.find((i) => i.id === activeEditingRecord.id);
      if (iss && iss.subtasks) {
        return iss.subtasks;
      }
    }
    return [];
  }, [activeEditingRecord, plannerData.initiatives]);

  // Format Cadence in Human Readable Text
  const formatCadenceHuman = (routine: Routine): string => {
    if (routine.cadenceType === 'manual') return 'Manual (on demand)';
    if (routine.cadenceType === 'completion_relative') {
      const days = (routine.cadenceConfig?.daysAfterCompletion as number) || 7;
      return `${days} days after completion`;
    }
    if (routine.cadenceType === 'cycle') {
      return 'Cycle-aligned (QMW sprint)';
    }
    if (routine.cadenceType === 'calendar') {
      const days = routine.cadenceConfig?.intervalDays as number;
      if (days === 7) return 'Weekly';
      if (days === 14) return 'Every 2 Weeks';
      if (days === 30 || days === 31) return 'Monthly';
      if (days) return `Every ${days} days`;
      if (routine.cadenceConfig?.cron) return `Cron: ${routine.cadenceConfig.cron}`;
      if (Array.isArray(routine.cadenceConfig?.daysOfWeek)) {
        return `Days: ${(routine.cadenceConfig.daysOfWeek as string[]).join(', ')}`;
      }
      return 'Calendar scheduled';
    }
    return routine.cadenceType;
  };

  // Save Work Item Back to TaskFlow
  const saveWorkItemToTaskFlow = () => {
    if (!activeEditingRecord) return;
    const { type, id } = activeEditingRecord;

    if (type === 'initiative' && id === 0) {
      showToast('ℹ "General & Recurring Work" is a virtual category and cannot be edited directly.', 'info');
      closeWorkItemDrawer();
      return;
    }

    if (!drawerTitle.trim()) {
      showToast('⚠️ Title cannot be empty.', 'warn');
      return;
    }

    const sanitizedDates = sanitizeDateRange(drawerStartDate, drawerDueDate);

    const mapPriorityToApi = (prio: string | null | undefined): string | null => {
      if (!prio) return null;
      const lower = prio.toLowerCase().trim();
      if (['urgent', 'high', 'medium', 'low'].includes(lower)) return lower;
      return null;
    };

    // Resolve columnId and completed status
    const effectiveColumnId = drawerColumnId ?? shellProject?.columns?.find((col) => {
      if (drawerStatus === 'Done') return col.stateType === 'completed';
      if (drawerStatus === 'Canceled') return col.stateType === 'canceled';
      if (drawerStatus === 'In Progress') return col.stateType === 'started';
      if (drawerStatus === 'Todo') return col.stateType === 'unstarted';
      if (drawerStatus === 'Backlog') return col.stateType === 'backlog';
      return false;
    })?.id;

    const selectedColumn = shellProject?.columns?.find((col) => col.id === effectiveColumnId);
    const resolvedStatus = selectedColumn ? selectedColumn.name : drawerStatus;
    const resolvedIsCompleted = selectedColumn?.stateType === 'completed';

    // Map initiative status strictly to TaskFlow enum
    let initiativeStatus: InitiativeStatus = 'active';
    const rawStatus = (drawerStatus || '').toLowerCase().trim();
    if (rawStatus === 'proposed') initiativeStatus = 'proposed';
    else if (rawStatus === 'planned') initiativeStatus = 'planned';
    else if (rawStatus === 'completed' || rawStatus === 'done') initiativeStatus = 'completed';
    else if (rawStatus === 'canceled' || rawStatus === 'cancelled') initiativeStatus = 'canceled';
    else initiativeStatus = 'active';

    // Check forward-only workflow progression for child tasks
    const startedCol = shellProject?.columns?.find((c) => c.stateType === 'started') || shellProject?.columns?.find((c) => (c.name || '').toLowerCase().includes('progress'));
    const isAdvancingToStarted = selectedColumn?.stateType === 'started' || (drawerStatus || '').toLowerCase().includes('progress');
    const childStatusUpdates: { id: number; columnId: number }[] = [];

    if (type === 'issue' && isAdvancingToStarted && startedCol) {
      for (const init of plannerData.initiatives) {
        const parentIss = init.issues.find((i) => i.id === id);
        if (parentIss && parentIss.subtasks) {
          parentIss.subtasks.forEach((sub) => {
            const subCol = shellProject?.columns?.find((c) => c.id === sub.columnId);
            const subState = subCol?.stateType;
            const subName = (subCol?.name || sub.status || '').toLowerCase().trim();
            const isChildUnstarted = subState === 'backlog' || subState === 'unstarted' || subName === 'backlog' || subName === 'todo' || subName === 'to do' || subName === 'unstarted';
            const isChildDoneOrCanceled = subState === 'completed' || subState === 'canceled' || sub.isCompleted || isDone(subCol, sub.status) || isCanceled(subCol, sub.status);
            if (isChildUnstarted && !isChildDoneOrCanceled) {
              childStatusUpdates.push({ id: sub.id, columnId: startedCol.id });
            }
          });
        }
      }
    }

    const previousPlannerData = plannerData;

    setPlannerData((prev) => {
      const copy: QmwProjectData = JSON.parse(JSON.stringify(prev));

      if (type === 'initiative') {
        const init = copy.initiatives.find((i) => i.id === id);
        if (init) {
          init.title = drawerTitle.trim();
          init.description = drawerDescription;
          init.status = drawerStatus;
          init.prio = drawerPriority;
          init.startDate = sanitizedDates.startDate || '';
          init.dueDate = sanitizedDates.dueDate || '';
        }
      } else if (type === 'issue') {
        for (const init of copy.initiatives) {
          const iss = init.issues.find((i) => i.id === id);
          if (iss) {
            iss.title = drawerTitle.trim();
            iss.description = drawerDescription;
            iss.status = resolvedStatus;
            iss.columnId = effectiveColumnId;
            iss.isCompleted = resolvedIsCompleted;
            iss.prio = drawerPriority;
            iss.startDate = sanitizedDates.startDate || '';
            iss.dueDate = sanitizedDates.dueDate || '';
            iss.routineOverridePayload = {
              type: routineParamType,
              count: Number(routineParamCount) || 7,
            };

            // Forward-only child progression: when parent moves to In Progress, advance unstarted children
            if (isAdvancingToStarted && startedCol && iss.subtasks && iss.subtasks.length > 0) {
              iss.subtasks.forEach((sub) => {
                const subCol = shellProject?.columns?.find((c) => c.id === sub.columnId);
                const subState = subCol?.stateType;
                const subName = (subCol?.name || sub.status || '').toLowerCase().trim();
                const isChildUnstarted = subState === 'backlog' || subState === 'unstarted' || subName === 'backlog' || subName === 'todo' || subName === 'to do' || subName === 'unstarted';
                const isChildDoneOrCanceled = subState === 'completed' || subState === 'canceled' || sub.isCompleted || isDone(subCol, sub.status) || isCanceled(subCol, sub.status);
                if (isChildUnstarted && !isChildDoneOrCanceled) {
                  sub.columnId = startedCol.id;
                  sub.status = startedCol.name;
                }
              });
            }
            break;
          }
        }
      } else if (type === 'subtask') {
        for (const init of copy.initiatives) {
          for (const iss of init.issues) {
            const sub = iss.subtasks.find((s) => s.id === id);
            if (sub) {
              sub.title = drawerTitle.trim();
              sub.description = drawerDescription;
              sub.status = resolvedStatus;
              sub.columnId = effectiveColumnId;
              sub.isCompleted = resolvedIsCompleted;
              sub.prio = drawerPriority;
              sub.startDate = sanitizedDates.startDate || '';
              sub.dueDate = sanitizedDates.dueDate || '';
              sub.routineOverridePayload = {
                type: routineParamType,
                count: Number(routineParamCount) || 7,
              };
              break;
            }
          }
        }
      }

      return copy;
    });

    if (type === 'initiative') {
      updateInitiative.mutate(
        {
          id,
          patch: {
            title: drawerTitle.trim(),
            description: drawerDescription,
            status: initiativeStatus,
            priority: mapPriorityToApi(drawerPriority),
            startDate: sanitizedDates.startDate,
            targetDate: sanitizedDates.dueDate,
          },
        },
        {
          onError: (err: any) => {
            setPlannerData(previousPlannerData);
            showToast(`❌ Save failed: ${err?.message || 'Server error'}. Please verify dates and fields.`, 'warn');
          },
          onSuccess: () => {
            closeWorkItemDrawer();
            showToast(`✓ Saved Initiative #${activeEditingRecord.seq} ("${drawerTitle.trim()}") to TaskFlow.`, 'success');
          },
        }
      );
    } else {
      updateIssue.mutate(
        {
          id,
          patch: {
            title: drawerTitle.trim(),
            description: drawerDescription,
            priority: mapPriorityToApi(drawerPriority),
            startDate: sanitizedDates.startDate,
            dueDate: sanitizedDates.dueDate,
            ...(effectiveColumnId ? { columnId: effectiveColumnId } : {}),
            routineOverridePayload: {
              type: routineParamType,
              count: Number(routineParamCount) || 7,
            },
          },
        },
        {
          onError: (err: any) => {
            setPlannerData(previousPlannerData);
            showToast(`❌ Save failed: ${err?.message || 'Server error'}. Please verify dates and fields.`, 'warn');
          },
          onSuccess: () => {
            // Persist forward child status updates
            childStatusUpdates.forEach((c) => {
              updateIssue.mutate({
                id: c.id,
                patch: { columnId: c.columnId },
              });
            });

            closeWorkItemDrawer();
            const completionNote = resolvedIsCompleted ? ' Marked as Done ✓.' : '';
            const cascadeNote = childStatusUpdates.length > 0 ? ` (${childStatusUpdates.length} unstarted task${childStatusUpdates.length > 1 ? 's' : ''} moved to In Progress)` : '';
            showToast(`✓ Saved to TaskFlow. Record #${id} ("${drawerTitle.trim()}") updated.${completionNote}${cascadeNote}`, 'success');
          },
        }
      );
    }
  };

  // Routine: Apply Make Recurring Preset
  const handleApplyRecurringPreset = async (preset: {
    id: string;
    label: string;
    type: CadenceType;
    config: Record<string, unknown>;
  }) => {
    if (!activeEditingRecord) return;
    if (!currentProjectId) {
      showToast('Project context not loaded', 'warn');
      return;
    }
    try {
      const targetProjId = currentProjectId;
      const routine = await createRoutineMutation.mutateAsync({
        projectId: targetProjId,
        title: activeEditingRecord.title,
        description: activeEditingRecord.description || '',
        cadenceType: preset.type,
        cadenceConfig: preset.config,
        executionPolicy: 'human_task',
        targetInitiativeId: activeEditingRecord.type === 'initiative' ? activeEditingRecord.id : undefined,
        status: 'active',
        nextDueDate: activeEditingRecord.startDate
          ? new Date(activeEditingRecord.startDate).toISOString()
          : new Date().toISOString(),
      });

      if (activeEditingRecord.type === 'issue' || activeEditingRecord.type === 'subtask') {
        await updateIssue.mutateAsync({
          id: activeEditingRecord.id,
          patch: { routineId: routine.id },
        });
      }

      setActiveEditingRecord((prev) => (prev ? { ...prev, routineId: routine.id } : null));

      setPlannerData((prev) => {
        const copy: QmwProjectData = JSON.parse(JSON.stringify(prev));
        for (const init of copy.initiatives) {
          if (init.id === activeEditingRecord.id) init.routineId = routine.id;
          for (const iss of init.issues) {
            if (iss.id === activeEditingRecord.id) iss.routineId = routine.id;
            for (const sub of iss.subtasks) {
              if (sub.id === activeEditingRecord.id) sub.routineId = routine.id;
            }
          }
        }
        return copy;
      });

      setShowMakeRecurringSelect(false);
      showToast(`✓ Recurring routine created (${preset.label}). Attached to Task #${activeEditingRecord.id}.`, 'success');
    } catch (err: any) {
      showToast(`Failed to make recurring: ${err.message || 'Unknown error'}`, 'warn');
    }
  };

  // Routine: Pause or Resume
  const toggleRoutinePause = async (routine: Routine) => {
    const nextStatus = routine.status === 'active' ? 'paused' : 'active';
    try {
      await updateRoutineMutation.mutateAsync({
        id: routine.id,
        patch: { status: nextStatus },
      });
      showToast(`✓ Routine "${routine.title}" ${nextStatus === 'active' ? 'resumed' : 'paused'}.`, 'success');
    } catch (err: any) {
      showToast(`Failed to update routine: ${err.message || 'Unknown error'}`, 'warn');
    }
  };

  // Routine: Detach from Issue
  const detachRoutineFromIssue = async (issueId: number) => {
    try {
      await updateIssue.mutateAsync({
        id: issueId,
        patch: { routineId: null },
      });
      setActiveEditingRecord((prev) => (prev ? { ...prev, routineId: null } : null));
      setPlannerData((prev) => {
        const copy: QmwProjectData = JSON.parse(JSON.stringify(prev));
        for (const init of copy.initiatives) {
          if (init.id === issueId) init.routineId = null;
          for (const iss of init.issues) {
            if (iss.id === issueId) iss.routineId = null;
            for (const sub of iss.subtasks) {
              if (sub.id === issueId) sub.routineId = null;
            }
          }
        }
        return copy;
      });
      showToast('✓ Detached from routine. Item is now an ordinary one-off task.', 'success');
    } catch (err: any) {
      showToast(`Failed to detach routine: ${err.message || 'Unknown error'}`, 'warn');
    }
  };

  // Routine / Capability: Trigger capability execution with Tier 2/3 parameters
  const handleTriggerCapabilityRun = async () => {
    if (!activeEditingRecord) return;
    setIsTriggeringRoutine(true);
    try {
      const overrides = {
        type: routineParamType,
        count: Number(routineParamCount) || 7,
      };

      if (activeEditingRecord.routineId) {
        const res = await triggerIssueRoutine.mutateAsync({
          issueId: activeEditingRecord.id,
          overrides,
        });
        const invocation = res.invocation as any;
        setRoutineTriggerResult({
          invocationId: invocation?.id || res.issueId,
          requestId: invocation?.requestId || `req-routine-${Date.now().toString(36)}`,
          status: invocation?.status || 'queued',
          type: routineParamType,
          count: Number(routineParamCount) || 7,
        });
        showToast(`🎬 ${res.capabilitySlug} capability enqueued (count: ${routineParamCount})`, 'success');
      } else {
        const reqId = `req-recov-${Date.now().toString(36)}`;
        await fetch('https://api.app.journaltogrow.com/capabilities/invoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            capabilitySlug: 'recovery-video-production',
            issueId: activeEditingRecord.id,
            inputPayload: {
              type: routineParamType,
              count: Number(routineParamCount) || 7,
              triggerSource: 'BizOS QMW Dashboard Work Item Drawer',
              timestamp: new Date().toISOString(),
            },
          }),
        });
        setRoutineTriggerResult({
          invocationId: activeEditingRecord.id,
          requestId: reqId,
          status: 'queued',
          type: routineParamType,
          count: Number(routineParamCount) || 7,
        });
        showToast(`🎬 Recovery Guy Production job enqueued (${reqId})`, 'success');
      }
    } catch (err: any) {
      showToast(`Failed to trigger capability: ${err.message || 'Unknown error'}`, 'warn');
    } finally {
      setIsTriggeringRoutine(false);
    }
  };

  // Available Backlog Items (queried dynamically across TaskFlow initiatives, issues, and subtasks)
  const availableBacklogItems = useMemo(() => {
    const list: {
      type: 'initiative' | 'issue' | 'subtask';
      id: number;
      seq: number;
      title: string;
      status: string;
      prio: string;
      startDate: string;
      dueDate: string;
      parentBreadcrumb?: string;
      isOutsideCurrentHorizon: boolean;
    }[] = [];

    plannerData.initiatives.forEach((init) => {
      if (isInitiativeCanceled(init.status) || isInitiativeDone(init.status)) return;
      // 1. Initiative backlog check (skip virtual container id 0)
      if (init.id !== 0) {
        const initStartDate = toApiIsoDate(init.startDate);
        const initHasDate = !!initStartDate;
        let inQuarter = false;
        if (initHasDate) {
          const d = parseLocalDate(initStartDate);
          if (d && d.getFullYear() === currentQuarterSchedule.year) {
            const m = d.getMonth() + 1;
            const q = Math.floor((m - 1) / 3) + 1;
            if (q === currentQuarterSchedule.quarter) inQuarter = true;
          }
        }
        const isBacklogStatus = ['proposed', 'planned', 'backlog'].includes((init.status || '').toLowerCase());
        if (!initHasDate || isBacklogStatus || !inQuarter) {
          list.push({
            type: 'initiative',
            id: init.id,
            seq: init.seq,
            title: init.title,
            status: init.status || 'Active',
            prio: init.prio || 'Normal',
            startDate: initStartDate || '',
            dueDate: toApiIsoDate(init.dueDate) || '',
            parentBreadcrumb: `${plannerData.name} › Initiative`,
            isOutsideCurrentHorizon: !inQuarter && initHasDate
          });
        }
      }

      // 2. Issue backlog check
      init.issues.forEach((iss) => {
        if (isCanceled(null, iss.status) || iss.isCompleted || isDone(null, iss.status)) return;
        const issStartDate = toApiIsoDate(iss.startDate);
        const issHasDate = !!issStartDate;
        let inMonth = false;
        if (issHasDate) {
          const d = parseLocalDate(issStartDate);
          if (d && d.getFullYear() === currentMonthSchedule.year && (d.getMonth() + 1) === currentMonthSchedule.month) {
            inMonth = true;
          }
        }
        const issBacklogStatus = (iss.status || '').toLowerCase() === 'backlog';
        if (!issHasDate || issBacklogStatus || !inMonth) {
          list.push({
            type: 'issue',
            id: iss.id,
            seq: iss.seq,
            title: iss.title,
            status: iss.status || 'Todo',
            prio: iss.prio || 'Normal',
            startDate: issStartDate || '',
            dueDate: toApiIsoDate(iss.dueDate) || '',
            parentBreadcrumb: init.id === 0 ? `${plannerData.name} › General Work` : `Initiative #${init.seq} › ${init.title}`,
            isOutsideCurrentHorizon: !inMonth && issHasDate
          });
        }

        // 3. Subtask backlog check
        iss.subtasks.forEach((sub) => {
          if (isCanceled(null, sub.status) || sub.isCompleted || isDone(null, sub.status)) return;
          const subStartDate = toApiIsoDate(sub.startDate);
          const subHasDate = !!subStartDate;
          let inWeek = false;
          if (subHasDate && subStartDate) {
            if (subStartDate >= currentWeekSchedule.mondayIso && subStartDate <= currentWeekSchedule.sundayIso) {
              inWeek = true;
            }
          }
          const subBacklogStatus = (sub.status || '').toLowerCase() === 'backlog';
          if (!subHasDate || subBacklogStatus || !inWeek) {
            list.push({
              type: 'subtask',
              id: sub.id,
              seq: sub.seq,
              title: sub.title,
              status: sub.status || 'Todo',
              prio: sub.prio || 'Normal',
              startDate: subStartDate || '',
              dueDate: toApiIsoDate(sub.dueDate) || '',
              parentBreadcrumb: `#${iss.seq} ${iss.title}`,
              isOutsideCurrentHorizon: !inWeek && subHasDate
            });
          }
        });
      });
    });

    return list;
  }, [plannerData, currentQuarterSchedule, currentMonthSchedule, currentWeekSchedule]);

  // Filtered Backlog items based on search and tab
  const filteredBacklogItems = useMemo(() => {
    const q = backlogSearch.toLowerCase().trim();
    return availableBacklogItems.filter((item) => {
      if (backlogFilterTab !== 'all' && item.type !== backlogFilterTab) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        String(item.id).includes(q) ||
        String(item.seq).includes(q) ||
        (item.parentBreadcrumb && item.parentBreadcrumb.toLowerCase().includes(q))
      );
    });
  }, [availableBacklogItems, backlogFilterTab, backlogSearch]);

  // Backlog Pull-Forward with immediate TaskFlow writeback
  const pullItemForward = (type: 'initiative' | 'issue' | 'subtask', id: number) => {
    let targetCardId = '';
    const previousPlannerData = plannerData;

    setPlannerData((prev) => {
      const copy: QmwProjectData = JSON.parse(JSON.stringify(prev));

      if (type === 'initiative') {
        if (id === 0) return copy;
        const init = copy.initiatives.find((i) => i.id === id);
        if (init) {
          const targetDate = currentQuarterSchedule.columns[0]?.targetDate || formatLocalDate(new Date());
          const { startDate, dueDate } = shiftDateRange(init.startDate, init.dueDate, targetDate);
          const sanitized = sanitizeDateRange(startDate, dueDate);
          init.startDate = sanitized.startDate || '';
          init.dueDate = sanitized.dueDate || '';
          updateInitiative.mutate(
            {
              id: init.id,
              patch: {
                startDate: sanitized.startDate,
                targetDate: sanitized.dueDate,
              }
            },
            {
              onError: (err: any) => {
                setPlannerData(previousPlannerData);
                showToast(`❌ Pull failed: ${err?.message || 'Server error'}. Restored Initiative #${init.seq}.`, 'warn');
              }
            }
          );
          targetCardId = `card-initiative-${init.id}`;
          showToast(`🎉 Pulled Initiative #${init.seq} into ${currentQuarterSchedule.title}!`, 'success');
        }
      } else if (type === 'issue') {
        for (const init of copy.initiatives) {
          const iss = init.issues.find((i) => i.id === id);
          if (iss) {
            const targetDate = currentMonthSchedule.columns[0]?.targetDate || formatLocalDate(new Date());
            const { startDate, dueDate } = shiftDateRange(iss.startDate, iss.dueDate, targetDate);
            const sanitized = sanitizeDateRange(startDate, dueDate);
            iss.startDate = sanitized.startDate || '';
            iss.dueDate = sanitized.dueDate || '';
            updateIssue.mutate(
              {
                id: iss.id,
                patch: {
                  startDate: sanitized.startDate,
                  dueDate: sanitized.dueDate,
                }
              },
              {
                onError: (err: any) => {
                  setPlannerData(previousPlannerData);
                  showToast(`❌ Pull failed: ${err?.message || 'Server error'}. Restored Issue #${iss.seq}.`, 'warn');
                }
              }
            );
            targetCardId = `card-issue-${iss.id}`;
            showToast(`🎉 Pulled Issue #${iss.seq} into ${currentMonthSchedule.title}!`, 'success');
            break;
          }
        }
      } else if (type === 'subtask') {
        for (const init of copy.initiatives) {
          for (const iss of init.issues) {
            const sub = iss.subtasks.find((s) => s.id === id);
            if (sub) {
              const targetDate = currentWeekSchedule.columns[0]?.targetDate || formatLocalDate(new Date());
              const { startDate, dueDate } = shiftDateRange(sub.startDate, sub.dueDate, targetDate);
              const sanitized = sanitizeDateRange(startDate, dueDate);
              sub.startDate = sanitized.startDate || '';
              sub.dueDate = sanitized.dueDate || '';
              updateIssue.mutate(
                {
                  id: sub.id,
                  patch: {
                    startDate: sanitized.startDate,
                    dueDate: sanitized.dueDate,
                  }
                },
                {
                  onError: (err: any) => {
                    setPlannerData(previousPlannerData);
                    showToast(`❌ Pull failed: ${err?.message || 'Server error'}. Restored Task #${sub.seq}.`, 'warn');
                  }
                }
              );
              targetCardId = `card-subtask-${sub.id}`;
              showToast(`🎉 Pulled Task #${sub.seq} into ${currentWeekSchedule.rangeLabel}!`, 'success');
              break;
            }
          }
        }
      }

      return copy;
    });

    setIsBacklogDrawerOpen(false);

    if (targetCardId) {
      setHighlightedCardId(targetCardId);
      setTimeout(() => {
        const elem = document.getElementById(targetCardId);
        if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      setTimeout(() => setHighlightedCardId(null), 3200);
    }
  };

  // Filtered Initiatives
  const activeInitiatives = useMemo(() => {
    return plannerData.initiatives.filter((i) => {
      if (isInitiativeCanceled(i.status)) return false;
      if (selectedInitiativeFilter === 'all') return true;
      return String(i.id) === selectedInitiativeFilter;
    });
  }, [plannerData.initiatives, selectedInitiativeFilter]);

  // Filtered Issues (for Month view)
  const activeMonthIssues = useMemo(() => {
    const list: (QmwIssue & { parentInitiativeTitle: string; parentInitiativeSeq: number })[] = [];
    plannerData.initiatives.forEach((init) => {
      if (isInitiativeCanceled(init.status)) return;
      if (selectedInitiativeFilter === 'all' || String(init.id) === selectedInitiativeFilter) {
        init.issues.forEach((iss) => {
          if (isCanceled(null, iss.status)) return;
          list.push({
            ...iss,
            parentInitiativeTitle: init.title,
            parentInitiativeSeq: init.seq
          });
        });
      }
    });
    return list;
  }, [plannerData.initiatives, selectedInitiativeFilter]);

  // Filtered Tasks (for Week view)
  const activeWeekTasks = useMemo(() => {
    const list: QmwTask[] = [];
    plannerData.initiatives.forEach((init) => {
      if (isInitiativeCanceled(init.status)) return;
      if (selectedInitiativeFilter === 'all' || String(init.id) === selectedInitiativeFilter) {
        init.issues.forEach((iss) => {
          if (isCanceled(null, iss.status)) return;
          iss.subtasks.forEach((sub) => {
            if (isCanceled(null, sub.status)) return;
            list.push({
              ...sub,
              parentIssueTitle: iss.title,
              parentIssueSeq: iss.seq,
              parentInitiativeTitle: init.title,
              parentInitiativeSeq: init.seq
            });
          });
        });
      }
    });
    return list;
  }, [plannerData.initiatives, selectedInitiativeFilter]);

  return (
    <div className="qmw-paper-canvas flex flex-1 flex-col min-h-0 overflow-y-auto p-3 sm:p-6">
      <style jsx global>{`
        .qmw-paper-canvas {
          --paper-bg: #fcfbf9;
          --paper-surface: #ffffff;
          --paper-column: #f6f4ef;
          --paper-border: #e7e3da;
          --paper-border-subtle: #f0ece3;
          --paper-text: #262422;
          --paper-text-muted: #6e6761;
          --paper-text-dim: #999189;
          --accent-warm: #b45309;
          --accent-blue: #0284c7;
          --accent-green: #15803d;
          background-color: var(--paper-bg);
          color: var(--paper-text);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }
        select, select option {
          background-color: #faf9f6 !important;
          color: #262422 !important;
        }
        .paper-card {
          background: var(--paper-surface);
          border: 1px solid var(--paper-border);
          box-shadow: 0 1px 3px rgba(45, 35, 20, 0.04);
          transition: all 0.15s ease-in-out;
        }
        .paper-card:hover {
          box-shadow: 0 3px 8px rgba(45, 35, 20, 0.08);
          border-color: #d8d3c7;
        }
        .drag-target-hover {
          background-color: #f1ede4 !important;
          border: 2px dashed #b45309 !important;
        }
        .card-dragging {
          opacity: 0.45;
          transform: scale(0.98);
        }
        .view-btn-active {
          background: #ffffff;
          color: #1c1917;
          font-weight: 600;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        .pulled-glow {
          animation: pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) forwards;
        }
        @keyframes pulse-glow {
          0% {
            box-shadow: 0 0 0 4px rgba(180, 83, 9, 0.45), 0 4px 12px rgba(180, 83, 9, 0.25);
            background-color: #fffbf2;
            border-color: #b45309;
            transform: scale(1.02);
          }
          70% {
            box-shadow: 0 0 0 3px rgba(180, 83, 9, 0.3), 0 2px 8px rgba(180, 83, 9, 0.15);
            background-color: #fffbf2;
            border-color: #b45309;
          }
          100% {
            box-shadow: 0 1px 3px rgba(45, 35, 20, 0.04);
            background-color: #ffffff;
            border-color: var(--paper-border);
            transform: scale(1);
          }
        }
      `}</style>

      <div className="max-w-[1560px] w-full mx-auto space-y-5 pb-8">

        {/* ============================================================== */}
        {/* PLANNER HEADER: Project Selector + Cost Area + Plan Status    */}
        {/* ============================================================== */}
        <header className="bg-white border border-[#e7e3da] rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Left: Title & Project Selector */}
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#b45309] bg-[#fbf5ed] border border-[#f2e1cc] px-2 py-0.5 rounded-md">
                  TaskFlow Visual Planner
                </span>
                <span className="text-xs text-[#999189]">•</span>
                <span className="text-xs text-[#6e6761] font-mono">QMW Allocation</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#262422] mt-0.5">
                Visual Planning Dashboard
              </h1>
            </div>

            <div className="h-8 w-px bg-[#e7e3da] hidden sm:block"></div>

            {/* Project Context Badge */}
            {shellProject?.project && (
              <div className="flex items-center gap-2 bg-[#f8f6f2] border border-[#e7e3da] px-3 py-1.5 rounded-xl text-xs">
                <span className="text-[#6e6761] font-medium">Project:</span>
                <span className="text-[#262422] font-semibold">{shellProject.project.name}</span>
                <span className="text-[10px] font-mono bg-[#eeeae0] text-[#6e6761] px-1.5 py-0.5 rounded">
                  {shellProject.project.key}
                </span>
              </div>
            )}
          </div>

          {/* Right: Agent/API Cost Area & Plan State (Draft vs. Locked) */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Agent/API Cost Area */}
            <div className="flex items-center gap-2 bg-[#faf9f6] border border-[#e7e3da] px-3.5 py-1.5 rounded-xl text-xs">
              <span className="text-[#999189] font-medium">Agent/API Cost:</span>
              <div className="flex items-center gap-2.5 font-mono text-[#262422]">
                <span><span className="text-[#999189]">W:</span> $1.40</span>
                <span className="text-[#e7e3da]">|</span>
                <span><span className="text-[#999189]">M:</span> $4.85</span>
                <span className="text-[#e7e3da]">|</span>
                <span><span className="text-[#999189]">Q:</span> $12.30</span>
              </div>
            </div>

            {/* Live Sync Status */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border bg-[#f0fdf4] border-[#dcfce7] text-[#15803d]">
              <span className="size-1.5 rounded-full bg-[#15803d]"></span>
              <span>Live Synced to TaskFlow</span>
            </div>
          </div>
        </header>

        {/* ============================================================== */}
        {/* PLANNING VIEW BAR: Quarter | Month | Week + Horizon Navigator  */}
        {/* ============================================================== */}
        <div className="bg-white border border-[#e7e3da] rounded-2xl p-3 sm:px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-xs">
          
          {/* Main Planning Views Switcher + Horizon Navigator */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#6e6761]">Planning View:</span>
              <div className="bg-[#f2efe9] p-1 rounded-xl flex items-center text-xs">
                <button
                  type="button"
                  onClick={() => switchView('quarter')}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                    currentView === 'quarter' ? 'view-btn-active' : 'text-[#6e6761] hover:text-[#1c1917]'
                  }`}
                >
                  Quarter (Initiatives)
                </button>
                <button
                  type="button"
                  onClick={() => switchView('month')}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                    currentView === 'month' ? 'view-btn-active' : 'text-[#6e6761] hover:text-[#1c1917]'
                  }`}
                >
                  Month (Issues)
                </button>
                <button
                  type="button"
                  onClick={() => switchView('week')}
                  className={`px-4 py-1.5 rounded-lg transition-all cursor-pointer ${
                    currentView === 'week' ? 'view-btn-active' : 'text-[#6e6761] hover:text-[#1c1917]'
                  }`}
                >
                  Week (Tasks)
                </button>
              </div>
            </div>

            {/* Dynamic Horizon Navigator */}
            {currentView === 'week' && (
              <div className="flex items-center gap-1.5 bg-[#faf9f6] border border-[#e7e3da] px-2.5 py-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setWeekMonday((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7, 12, 0, 0))}
                  className="px-2 py-0.5 rounded-lg text-xs font-semibold text-[#6e6761] hover:text-[#262422] hover:bg-white border border-transparent hover:border-[#e7e3da] transition-all cursor-pointer"
                  title="Previous Week"
                >
                  ← Prev
                </button>
                <span className="font-semibold text-[#262422] px-1 font-mono text-[11px]">
                  {currentWeekSchedule.rangeLabel}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekMonday((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7, 12, 0, 0))}
                  className="px-2 py-0.5 rounded-lg text-xs font-semibold text-[#6e6761] hover:text-[#262422] hover:bg-white border border-transparent hover:border-[#e7e3da] transition-all cursor-pointer"
                  title="Next Week"
                >
                  Next →
                </button>
                <button
                  type="button"
                  onClick={() => setWeekMonday(getMondayOfDate(new Date()))}
                  className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-white border border-[#e7e3da] text-[#b45309] hover:bg-[#fbf5ed] transition-all cursor-pointer"
                >
                  Today
                </button>
              </div>
            )}

            {currentView === 'month' && (
              <div className="flex items-center gap-1.5 bg-[#faf9f6] border border-[#e7e3da] px-2.5 py-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedMonth((prev) => prev.month === 1 ? { year: prev.year - 1, month: 12 } : { year: prev.year, month: prev.month - 1 })}
                  className="px-2 py-0.5 rounded-lg text-xs font-semibold text-[#6e6761] hover:text-[#262422] hover:bg-white border border-transparent hover:border-[#e7e3da] transition-all cursor-pointer"
                  title="Previous Month"
                >
                  ← Prev
                </button>
                <span className="font-semibold text-[#262422] px-1 font-mono text-[11px]">
                  {currentMonthSchedule.title}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedMonth((prev) => prev.month === 12 ? { year: prev.year + 1, month: 1 } : { year: prev.year, month: prev.month + 1 })}
                  className="px-2 py-0.5 rounded-lg text-xs font-semibold text-[#6e6761] hover:text-[#262422] hover:bg-white border border-transparent hover:border-[#e7e3da] transition-all cursor-pointer"
                  title="Next Month"
                >
                  Next →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() + 1 });
                  }}
                  className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-white border border-[#e7e3da] text-[#b45309] hover:bg-[#fbf5ed] transition-all cursor-pointer"
                >
                  Current
                </button>
              </div>
            )}

            {currentView === 'quarter' && (
              <div className="flex items-center gap-1.5 bg-[#faf9f6] border border-[#e7e3da] px-2.5 py-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedQuarter((prev) => prev.quarter === 1 ? { year: prev.year - 1, quarter: 4 } : { year: prev.year, quarter: prev.quarter - 1 })}
                  className="px-2 py-0.5 rounded-lg text-xs font-semibold text-[#6e6761] hover:text-[#262422] hover:bg-white border border-transparent hover:border-[#e7e3da] transition-all cursor-pointer"
                  title="Previous Quarter"
                >
                  ← Prev
                </button>
                <span className="font-semibold text-[#262422] px-1 font-mono text-[11px]">
                  {currentQuarterSchedule.title}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedQuarter((prev) => prev.quarter === 4 ? { year: prev.year + 1, quarter: 1 } : { year: prev.year, quarter: prev.quarter + 1 })}
                  className="px-2 py-0.5 rounded-lg text-xs font-semibold text-[#6e6761] hover:text-[#262422] hover:bg-white border border-transparent hover:border-[#e7e3da] transition-all cursor-pointer"
                  title="Next Quarter"
                >
                  Next →
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    setSelectedQuarter({ year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 });
                  }}
                  className="ml-1 px-2 py-0.5 rounded-lg text-[10px] font-medium bg-white border border-[#e7e3da] text-[#b45309] hover:bg-[#fbf5ed] transition-all cursor-pointer"
                >
                  Current
                </button>
              </div>
            )}
          </div>

          {/* Right: Initiative Filter & Backlog Pull */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Initiative Filter Dropdown */}
            <div ref={filterDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => setIsFilterDropdownOpen((prev) => !prev)}
                className="flex items-center gap-1.5 bg-[#faf9f6] border border-[#e7e3da] px-3 py-1.5 rounded-xl text-xs hover:bg-[#f3ede4] transition-colors cursor-pointer text-[#262422]"
                aria-label="Filter Initiative"
                aria-haspopup="listbox"
                aria-expanded={isFilterDropdownOpen}
              >
                <span className="text-[#6e6761]">Filter Initiative:</span>
                <span className="font-semibold text-[#262422] max-w-[170px] truncate text-left">
                  {selectedInitiativeFilter === 'all'
                    ? 'All Initiatives'
                    : plannerData.initiatives.find((i) => String(i.id) === selectedInitiativeFilter)?.title || 'All Initiatives'}
                </span>
                <span className="text-[10px] text-[#999189]">▼</span>
              </button>

              {isFilterDropdownOpen && (
                <div
                  role="listbox"
                  className="absolute right-0 top-full mt-1.5 z-50 w-72 max-h-72 overflow-y-auto rounded-xl border border-[#e7e3da] bg-[#fcfbf9] p-1.5 shadow-xl space-y-0.5 custom-scrollbar"
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={selectedInitiativeFilter === 'all'}
                    onClick={() => {
                      setSelectedInitiativeFilter('all');
                      setIsFilterDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left cursor-pointer transition-colors ${
                      selectedInitiativeFilter === 'all'
                        ? 'bg-[#f0ebe0] text-[#262422] font-semibold'
                        : 'text-[#262422] hover:bg-[#f4eee5]'
                    }`}
                  >
                    <span>All Initiatives</span>
                    {selectedInitiativeFilter === 'all' && (
                      <span className="text-[#b45309] font-bold">✓</span>
                    )}
                  </button>
                  {plannerData.initiatives.map((init) => {
                    const isSelected = selectedInitiativeFilter === String(init.id);
                    return (
                      <button
                        key={init.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSelectedInitiativeFilter(String(init.id));
                          setIsFilterDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs text-left cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#f0ebe0] text-[#262422] font-semibold'
                            : 'text-[#262422] hover:bg-[#f4eee5]'
                        }`}
                      >
                        <span className="truncate pr-2 font-medium">{init.title}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-[10px] font-mono text-[#999189]">#{init.seq}</span>
                          {isSelected && <span className="text-[#b45309] font-bold">✓</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pull Forward From Backlog */}
            <button
              type="button"
              onClick={() => setIsBacklogDrawerOpen(true)}
              className="px-3.5 py-1.5 rounded-xl bg-[#faf9f6] border border-[#e7e3da] text-[#6e6761] hover:text-[#262422] hover:bg-[#f3f0e8] transition-all flex items-center gap-1.5 font-medium cursor-pointer"
            >
              <span>📥</span>
              <span>Pull from Backlog</span>
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* TOAST AREA                                                     */}
        {/* ============================================================== */}
        {toast && (
          <div>
            <div
              className={`p-3 rounded-xl border text-xs font-medium flex items-center justify-between shadow-xs ${
                toast.type === 'success'
                  ? 'bg-[#f0fdf4] border-[#dcfce7] text-[#15803d]'
                  : toast.type === 'warn'
                  ? 'bg-[#fffbeb] border-[#fde68a] text-[#b45309]'
                  : 'bg-[#f0f9ff] border-[#e0f2fe] text-[#0284c7]'
              }`}
            >
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="opacity-60 hover:opacity-100 font-bold ml-2 cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* BOARD VIEW CONTAINERS                                          */}
        {/* ============================================================== */}

        {/* 1. QUARTER VIEW: 4 columns (Month 1, Month 2, Month 3, Unscheduled) */}
        {currentView === 'quarter' && (
          <main className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {currentQuarterSchedule.columns.map((col) => {
              const isUnscheduled = col.id === 'unallocated';
              const itemsInCol = activeInitiatives
                .filter((init) => {
                  if (init.id === 0) return false;
                  if (isInitiativeCanceled(init.status)) return false;
                  const isCompletedInit = isInitiativeDone(init.status);
                  const sDate = toApiIsoDate(init.startDate);
                  if (isUnscheduled) {
                    if (isCompletedInit) return false;
                    return !sDate;
                  }
                  if (!sDate) return false;
                  const d = parseLocalDate(sDate);
                  if (!d) return false;
                  return d.getFullYear() === currentQuarterSchedule.year && (d.getMonth() + 1) === col.monthNum;
                })
                .sort((a, b) => {
                  const aDone = isInitiativeDone(a.status) ? 1 : 0;
                  const bDone = isInitiativeDone(b.status) ? 1 : 0;
                  return aDone - bDone;
                });
              const isHovered = dragOverZone === col.id;

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedItemRef.current?.type === 'initiative') setDragOverZone(col.id);
                  }}
                  onDragLeave={() => setDragOverZone(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverZone(null);
                    if (draggedItemRef.current && draggedItemRef.current.type === 'initiative') {
                      executeAllocationMove('initiative', draggedItemRef.current.id, col.id);
                    }
                  }}
                  className={`${
                    isUnscheduled
                      ? 'bg-[#faf9f6] border-dashed border-[#dfdad0]'
                      : 'bg-[#f6f4ef] border-[#e7e3da]'
                  } ${isHovered ? 'drag-target-hover' : ''} border rounded-2xl p-4 flex flex-col space-y-3 min-h-[500px] transition-all`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#e7e3da]">
                    <div>
                      <h3 className="text-xs font-bold text-[#262422] uppercase tracking-wider">{col.label}</h3>
                      <p className="text-[11px] text-[#999189]">{col.sublabel}</p>
                    </div>
                    <span className="text-[11px] font-mono text-[#6e6761] bg-white border border-[#e7e3da] px-2 py-0.5 rounded-md">
                      {itemsInCol.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {itemsInCol.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-[#ded9cf] text-center text-[11px] text-[#999189] italic">
                        No initiatives in this window
                      </div>
                    ) : (
                      itemsInCol.map((init) => {
                        const isCompletedInit = isInitiativeDone(init.status);
                        const isGlowing = highlightedCardId === `card-initiative-${init.id}`;
                        return (
                          <div
                            key={init.id}
                            id={`card-initiative-${init.id}`}
                            draggable={true}
                            onDragStart={() => {
                              draggedItemRef.current = { type: 'initiative', id: init.id };
                            }}
                            onDragEnd={() => {
                              draggedItemRef.current = null;
                            }}
                            onClick={() => openWorkItemDrawer('initiative', init.id)}
                            className={`paper-card rounded-xl p-3.5 space-y-2 select-none cursor-pointer ${
                              isCompletedInit ? 'opacity-60 bg-[#faf9f6]/90' : ''
                            } ${isGlowing ? 'pulled-glow' : ''}`}
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[#b45309] bg-[#fbf5ed] border border-[#f2e1cc] px-1.5 py-0.2 rounded font-semibold">
                                  Initiative #{init.seq}
                                </span>
                                {init.routineId != null && (
                                  <span className="text-[10px] font-bold text-[#b45309]" title="Recurring Routine">↻</span>
                                )}
                              </div>
                              <span className="text-[#6e6761] text-[10px] font-medium">{init.prio || 'Normal'}</span>
                            </div>
                            <h4 className={`text-xs font-bold leading-snug ${isCompletedInit ? 'text-[#6e6761] line-through decoration-[#999189]' : 'text-[#262422]'}`}>{init.title}</h4>
                            <p className="text-[11px] text-[#6e6761] line-clamp-2">{init.description || ''}</p>
                            <div className="text-[10px] font-mono text-[#999189] bg-[#faf9f6] px-2 py-1 rounded border border-[#f0ece3] flex items-center justify-between">
                              <span>📅 {init.startDate || 'Unscheduled'}</span>
                            </div>
                            <div className="pt-2 border-t border-[#f0ece3] flex items-center justify-between text-[11px] text-[#999189]">
                              <span className="flex items-center gap-1.5">
                                <span>Status:</span>
                                <strong className="text-[#262422] font-medium">{init.status || 'Active'}</strong>
                                {isCompletedInit && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                                    ✓ Done
                                  </span>
                                )}
                              </span>
                              <span
                                className="font-medium text-[#b45309] hover:underline cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (col.monthNum > 0) {
                                    jumpToMonth(col.monthNum, currentQuarterSchedule.year);
                                  }
                                }}
                              >
                                {init.issues.length} {init.issues.length === 1 ? 'Issue' : 'Issues'} ›
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </main>
        )}

        {/* 2. MONTH VIEW: 5 columns (Week 1, Week 2, Week 3, Week 4+, Unscheduled) */}
        {currentView === 'month' && (
          <main className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {currentMonthSchedule.columns.map((col) => {
              const isUnscheduled = col.id === 'unscheduled';
              const itemsInCol = activeMonthIssues
                .filter((iss) => {
                  if (isCanceled(null, iss.status)) return false;
                  const isCompletedIss = iss.isCompleted || isDone(null, iss.status);
                  const sDate = toApiIsoDate(iss.startDate);
                  if (isUnscheduled) {
                    if (isCompletedIss) return false;
                    return !sDate;
                  }
                  if (!sDate) return false;
                  const d = parseLocalDate(sDate);
                  if (!d) return false;
                  if (d.getFullYear() !== currentMonthSchedule.year || (d.getMonth() + 1) !== currentMonthSchedule.month) return false;
                  const day = d.getDate();
                  return day >= col.startDay && day <= col.endDay;
                })
                .sort((a, b) => {
                  const aDone = (a.isCompleted || isDone(null, a.status)) ? 1 : 0;
                  const bDone = (b.isCompleted || isDone(null, b.status)) ? 1 : 0;
                  return aDone - bDone;
                });
              const isHovered = dragOverZone === col.id;

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedItemRef.current?.type === 'issue') setDragOverZone(col.id);
                  }}
                  onDragLeave={() => setDragOverZone(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverZone(null);
                    if (draggedItemRef.current && draggedItemRef.current.type === 'issue') {
                      executeAllocationMove('issue', draggedItemRef.current.id, col.id);
                    }
                  }}
                  className={`${
                    isUnscheduled
                      ? 'bg-[#faf9f6] border-dashed border-[#dfdad0]'
                      : 'bg-[#f6f4ef] border-[#e7e3da]'
                  } ${isHovered ? 'drag-target-hover' : ''} border rounded-2xl p-3.5 flex flex-col space-y-3 min-h-[500px] transition-all`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#e7e3da]">
                    <div>
                      <h3 className="text-xs font-bold text-[#262422] uppercase tracking-wider">{col.label}</h3>
                      <p className="text-[11px] text-[#999189]">{col.sublabel}</p>
                    </div>
                    <span className="text-[11px] font-mono text-[#6e6761] bg-white border border-[#e7e3da] px-2 py-0.5 rounded-md">
                      {itemsInCol.length}
                    </span>
                  </div>

                  <div className="space-y-2.5 flex-1 overflow-y-auto">
                    {itemsInCol.length === 0 ? (
                      <div className="p-4 rounded-xl border border-dashed border-[#ded9cf] text-center text-[11px] text-[#999189] italic">
                        No issues scheduled
                      </div>
                    ) : (
                      itemsInCol.map((iss) => {
                        const isCompletedIss = iss.isCompleted || isDone(null, iss.status);
                        const isGlowing = highlightedCardId === `card-issue-${iss.id}`;

                        // Scheduling consistency checks
                        const hasNoTasks = !iss.subtasks || iss.subtasks.length === 0;
                        const issParsedDate = iss.startDate ? parseLocalDate(iss.startDate) : null;
                        const targetYear = issParsedDate ? issParsedDate.getFullYear() : currentMonthSchedule.year;
                        const targetMonth = issParsedDate ? (issParsedDate.getMonth() + 1) : currentMonthSchedule.month;
                        const outOfMonthTasks = (iss.subtasks || []).filter((sub) => {
                          if (!sub.startDate) return false;
                          const subParsed = parseLocalDate(sub.startDate);
                          if (!subParsed) return false;
                          const subYear = subParsed.getFullYear();
                          const subMonth = subParsed.getMonth() + 1;
                          return subYear !== targetYear || subMonth !== targetMonth;
                        });
                        const openChildTasks = isCompletedIss && iss.subtasks
                          ? iss.subtasks.filter((sub) => !sub.isCompleted && !isDone(null, sub.status) && !isCanceled(null, sub.status))
                          : [];

                        return (
                          <div
                            key={iss.id}
                            id={`card-issue-${iss.id}`}
                            draggable={true}
                            onDragStart={() => {
                              draggedItemRef.current = { type: 'issue', id: iss.id };
                            }}
                            onDragEnd={() => {
                              draggedItemRef.current = null;
                            }}
                            onClick={() => openWorkItemDrawer('issue', iss.id)}
                            className={`paper-card rounded-xl p-3 space-y-2 select-none cursor-pointer ${
                              isCompletedIss ? 'opacity-60 bg-[#faf9f6]/90' : ''
                            } ${isGlowing ? 'pulled-glow' : ''}`}
                          >
                            <div className="text-[10px] text-[#b45309] font-medium bg-[#fcf8f2] border border-[#faedd9] px-2 py-0.5 rounded-md flex items-center justify-between gap-1">
                              <span className="truncate">#{iss.parentInitiativeSeq} {iss.parentInitiativeTitle}</span>
                              {iss.routineId != null && (
                                <span className="text-[10px] font-bold text-[#b45309] shrink-0" title="Recurring Routine">↻</span>
                              )}
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[#0284c7] font-semibold">Issue #{iss.seq}</span>
                                {iss.routineId != null && (
                                  <span className="text-[10px] font-bold text-[#b45309]" title="Recurring Routine">↻</span>
                                )}
                              </div>
                              <span className="text-[#6e6761] text-[10px]">{iss.prio || 'Normal'}</span>
                            </div>
                            <h4 className={`text-xs font-semibold leading-snug ${isCompletedIss ? 'text-[#6e6761] line-through decoration-[#999189]' : 'text-[#262422]'}`}>{iss.title}</h4>
                            <div className="text-[10px] font-mono text-[#999189] bg-[#faf9f6] px-2 py-1 rounded border border-[#f0ece3]">
                              📅 {iss.startDate || 'Unscheduled'}
                            </div>

                            {/* Scheduling & Consistency Warnings */}
                            {hasNoTasks && (
                              <div className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-1 rounded-md flex items-center gap-1">
                                <span>⚠️ No tasks — won’t appear in Weekly planning</span>
                              </div>
                            )}
                            {outOfMonthTasks.length > 0 && (
                              <div className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-1 rounded-md flex items-center gap-1">
                                <span>⚠️ {outOfMonthTasks.length} child task{outOfMonthTasks.length > 1 ? 's' : ''} scheduled outside this month</span>
                              </div>
                            )}
                            {openChildTasks.length > 0 && (
                              <div className="text-[10px] font-medium text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-1 rounded-md flex items-center gap-1">
                                <span>⚠️ Done issue has {openChildTasks.length} open task{openChildTasks.length > 1 ? 's' : ''}</span>
                              </div>
                            )}

                            <div className="pt-1.5 border-t border-[#f0ece3] flex items-center justify-between text-[10px] text-[#999189]">
                              <span className="flex items-center gap-1.5">
                                <span>Status:</span>
                                <strong className="text-[#262422] font-medium">{iss.status || 'Todo'}</strong>
                                {isCompletedIss && (
                                  <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                                    ✓ Done
                                  </span>
                                )}
                              </span>
                              <span
                                className="text-[#15803d] font-medium hover:underline cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (col.targetDate) {
                                    jumpToWeek(col.targetDate);
                                  }
                                }}
                              >
                                {iss.subtasks.length} {iss.subtasks.length === 1 ? 'Task' : 'Tasks'} ›
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </main>
        )}

        {/* 3. WEEK VIEW: 8 columns (Monday -> Sunday + Unscheduled) */}
        {currentView === 'week' && (
          <main className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {currentWeekSchedule.columns.map((col) => {
              const isUnscheduled = col.id === 'unscheduled';
              const isToday = col.targetDate === todayIso;
              const itemsInCol = activeWeekTasks
                .filter((task) => {
                  if (isCanceled(null, task.status)) return false;
                  const isCompletedTask = task.isCompleted || isDone(null, task.status);
                  const sDate = toApiIsoDate(task.startDate);
                  if (isUnscheduled) {
                    if (isCompletedTask) return false;
                    return !sDate;
                  }
                  return sDate === col.targetDate;
                })
                .sort((a, b) => {
                  const aDone = (a.isCompleted || isDone(null, a.status)) ? 1 : 0;
                  const bDone = (b.isCompleted || isDone(null, b.status)) ? 1 : 0;
                  return aDone - bDone;
                });
              const isHovered = dragOverZone === col.id;

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedItemRef.current?.type === 'subtask') setDragOverZone(col.id);
                  }}
                  onDragLeave={() => setDragOverZone(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverZone(null);
                    if (draggedItemRef.current && draggedItemRef.current.type === 'subtask') {
                      executeAllocationMove('subtask', draggedItemRef.current.id, col.id);
                    }
                  }}
                  className={`${
                    isUnscheduled
                      ? 'bg-[#faf9f6] border-dashed border-[#dfdad0]'
                      : isToday
                      ? 'bg-[#fbf9f4] border-[#d8cfbe] ring-1 ring-[#b45309]/20'
                      : 'bg-[#f6f4ef] border-[#e7e3da]'
                  } ${isHovered ? 'drag-target-hover' : ''} border rounded-2xl p-3 flex flex-col space-y-2.5 min-h-[500px] transition-all`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#e7e3da]">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-xs font-bold text-[#262422] uppercase tracking-wider">{col.label}</h3>
                        {isToday && (
                          <span className="text-[9px] bg-[#fbf5ed] text-[#b45309] font-bold px-1 py-0.2 rounded border border-[#f2e1cc]">
                            Today
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[#999189] font-mono">{col.sublabel}</p>
                    </div>
                    <span className="text-[10px] font-mono text-[#6e6761] bg-white border border-[#e7e3da] px-1.5 py-0.2 rounded-md font-semibold">
                      {itemsInCol.length}
                    </span>
                  </div>

                  <div className="space-y-2 flex-1 overflow-y-auto">
                    {itemsInCol.length === 0 ? (
                      <div className="p-3 rounded-xl border border-dashed border-[#ded9cf] text-center text-[10px] text-[#999189] italic">
                        No tasks scheduled
                      </div>
                    ) : (
                      itemsInCol.map((task) => {
                        const isCompletedTask = task.isCompleted || isDone(null, task.status);
                        const isRecoveryGuy =
                          task.capabilitySlug === 'recovery-video-production' ||
                          (task.tags && task.tags.includes('recovery-video-production'));
                        const isGlowing = highlightedCardId === `card-subtask-${task.id}`;

                        return (
                          <div
                            key={task.id}
                            id={`card-subtask-${task.id}`}
                            draggable={true}
                            onDragStart={() => {
                              draggedItemRef.current = { type: 'subtask', id: task.id };
                            }}
                            onDragEnd={() => {
                              draggedItemRef.current = null;
                            }}
                            onClick={() => openWorkItemDrawer('subtask', task.id)}
                            className={`paper-card rounded-xl p-2.5 space-y-1.5 select-none cursor-pointer ${
                              isCompletedTask ? 'opacity-60 bg-[#faf9f6]/90' : ''
                            } ${isGlowing ? 'pulled-glow' : ''}`}
                          >
                            {/* Hierarchy Breadcrumb */}
                            <div className="text-[9px] text-[#6e6761] truncate font-medium bg-[#fbfaf8] border border-[#f0ece3] px-1.5 py-0.5 rounded leading-tight flex items-center justify-between gap-1">
                              <span className="truncate">
                                <span className="text-[#b45309] font-semibold">#{task.parentInitiativeSeq}</span> ›{' '}
                                {(task.parentIssueTitle || '').substring(0, 20)}...
                              </span>
                              <div className="flex items-center gap-1 shrink-0">
                                {task.routineId != null && (
                                  <span className="text-[10px] font-bold text-[#b45309]" title="Recurring Routine">↻</span>
                                )}
                                {isRecoveryGuy && <span className="text-[9px] font-bold text-[#b45309]">🎬</span>}
                              </div>
                            </div>

                            {/* Task Title */}
                            <h5 className={`text-[11px] font-semibold leading-snug ${isCompletedTask ? 'text-[#6e6761] line-through decoration-[#999189]' : 'text-[#262422]'}`}>{task.title}</h5>

                            {/* Start Date Only Display on Card */}
                            <div className="text-[9px] font-mono text-[#999189] bg-[#faf9f6] px-1.5 py-0.5 rounded border border-[#f0ece3]">
                              📅 {task.startDate || 'Unscheduled'}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-[#999189] pt-1 border-t border-[#f5f2ec]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[#15803d]">Task #{task.seq}</span>
                                {task.routineId != null && (
                                  <span className="text-[10px] font-bold text-[#b45309]" title="Recurring Routine">↻</span>
                                )}
                              </div>
                              <span className={`text-[9px] px-1 rounded ${isCompletedTask ? 'bg-emerald-100 text-emerald-800 font-bold border border-emerald-200' : 'bg-[#f5f2ec] text-[#6e6761]'}`}>
                                {isCompletedTask ? '✓ ' + (task.status || 'Done') : (task.status || 'Todo')}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </main>
        )}

        {/* ============================================================== */}
        {/* VIEW CONTEXT BANNER (Placed below the planning board)          */}
        {/* ============================================================== */}
        <div className="bg-[#fbfaf7] border border-[#ede9e0] rounded-xl px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-[#6e6761] gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#262422]">
              {currentView === 'quarter'
                ? 'Quarter View: Project → Initiatives'
                : currentView === 'month'
                ? 'Month View: Initiative → Issues'
                : 'Week View: Issue → Tasks (Subtasks)'}
            </span>
            <span className="text-[#999189]">•</span>
            <span>
              {currentView === 'quarter'
                ? 'Moving an Initiative between months updates its TaskFlow start date and preserves duration. Unscheduled initiatives appear in reserve.'
                : currentView === 'month'
                ? "Moving an Issue between weeks updates its TaskFlow start date and preserves duration. Click 'Tasks ›' to jump to that week."
                : 'Cards appear strictly according to actual TaskFlow start date. Moving a card updates its TaskFlow calendar date preserving duration.'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] text-[#999189]">
            {currentView === 'quarter' && `${activeInitiatives.filter((i) => i.id !== 0).length} Initiatives`}
            {currentView === 'month' && `${activeMonthIssues.length} Issues across active initiatives`}
            {currentView === 'week' && `${activeWeekTasks.length} Actionable Tasks across selected work (${currentWeekSchedule.rangeLabel})`}
          </div>
        </div>

      </div>

      {/* ============================================================== */}
      {/* LIGHTWEIGHT WORK ITEM DRAWER                                   */}
      {/* ============================================================== */}
      {activeEditingRecord && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/25 backdrop-blur-[2px] transition-opacity"
            onClick={closeWorkItemDrawer}
          />

          {/* Slide-over panel */}
          <aside className="relative z-50 h-full w-full max-w-lg bg-white border-l border-[#e7e3da] shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-[#f0ece3] bg-[#faf9f6] flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="text-[11px] font-medium text-[#b45309] flex items-center gap-1.5">
                  <span>{activeEditingRecord.breadcrumb}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-[#f5efe6] text-[#b45309] border border-[#ecd9c2]">
                    {activeEditingRecord.type === 'subtask' ? 'Task' : activeEditingRecord.type.toUpperCase()}
                  </span>
                  <span className="text-xs font-mono text-[#999189]">
                    ID: #{activeEditingRecord.id} (TaskFlow seq: #{activeEditingRecord.seq})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={closeWorkItemDrawer}
                className="text-[#999189] hover:text-[#262422] text-lg p-1.5 rounded-lg hover:bg-[#eae5db] transition-colors cursor-pointer"
                title="Close drawer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#6e6761]">Title</label>
                <input
                  type="text"
                  value={drawerTitle}
                  onChange={(e) => setDrawerTitle(e.target.value)}
                  className="w-full bg-[#fcfbf9] border border-[#e7e3da] rounded-xl px-3.5 py-2 text-sm text-[#262422] font-semibold focus:outline-none focus:border-[#b45309] focus:bg-white transition-all"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#6e6761]">Description / Notes</label>
                <textarea
                  rows={4}
                  value={drawerDescription}
                  onChange={(e) => setDrawerDescription(e.target.value)}
                  placeholder="Add context, acceptance criteria, or operational notes..."
                  className="w-full bg-[#fcfbf9] border border-[#e7e3da] rounded-xl p-3 text-xs text-[#262422] leading-relaxed focus:outline-none focus:border-[#b45309] focus:bg-white transition-all resize-y"
                />
              </div>

              {/* Quick Status / Completion Toggle */}
              {activeEditingRecord.type !== 'initiative' && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-[#faf9f6] border border-[#ede9e0]">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-3 h-3 rounded-full flex items-center justify-center ${
                        shellProject?.columns?.find((c) => c.id === drawerColumnId)?.stateType === 'completed'
                          ? 'bg-emerald-500 ring-4 ring-emerald-100'
                          : 'bg-amber-500 ring-2 ring-amber-100'
                      }`}
                    />
                    <div>
                      <div className="text-xs font-semibold text-[#262422] flex items-center gap-1.5">
                        <span>{shellProject?.columns?.find((c) => c.id === drawerColumnId)?.name || drawerStatus}</span>
                        {shellProject?.columns?.find((c) => c.id === drawerColumnId)?.stateType === 'completed' && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded border border-emerald-200">
                            Completed
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#999189]">
                        {shellProject?.columns?.find((c) => c.id === drawerColumnId)?.stateType === 'completed'
                          ? 'Item is Done • routine lifecycle advances on save'
                          : 'Item is active in planning horizon'}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const isCurrentlyDone = shellProject?.columns?.find((c) => c.id === drawerColumnId)?.stateType === 'completed';
                      if (isCurrentlyDone) {
                        const reopenCol = shellProject?.columns?.find((c) => c.stateType === 'started') || shellProject?.columns?.find((c) => c.stateType === 'unstarted');
                        if (reopenCol) {
                          setDrawerColumnId(reopenCol.id);
                          setDrawerStatus(reopenCol.name);
                        }
                      } else {
                        const doneCol = shellProject?.columns?.find((c) => c.stateType === 'completed');
                        if (doneCol) {
                          setDrawerColumnId(doneCol.id);
                          setDrawerStatus(doneCol.name);
                        }
                      }
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      shellProject?.columns?.find((c) => c.id === drawerColumnId)?.stateType === 'completed'
                        ? 'bg-[#f0ece3] text-[#6e6761] hover:bg-[#e4ded3]'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                    }`}
                  >
                    {shellProject?.columns?.find((c) => c.id === drawerColumnId)?.stateType === 'completed' ? '↩ Reopen Item' : '✓ Mark Done'}
                  </button>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Status */}
                <div className="space-y-1">
                  <label className="font-semibold text-[#6e6761]">Status Column</label>
                  <select
                    value={drawerColumnId ?? ''}
                    onChange={(e) => {
                      const colId = Number(e.target.value);
                      setDrawerColumnId(colId);
                      const col = shellProject?.columns?.find((c) => c.id === colId);
                      if (col) setDrawerStatus(col.name);
                    }}
                    className="w-full bg-[#fcfbf9] border border-[#e7e3da] rounded-xl px-3 py-2 text-xs text-[#262422] font-medium focus:outline-none focus:border-[#b45309] cursor-pointer"
                  >
                    {shellProject?.columns && shellProject.columns.length > 0 ? (
                      shellProject.columns.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.stateType === 'completed' ? '(Done)' : ''}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="Backlog">Backlog</option>
                        <option value="Todo">Todo</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Done">Done</option>
                        <option value="Canceled">Canceled</option>
                      </>
                    )}
                  </select>
                </div>

                {/* Priority */}
                <div className="space-y-1">
                  <label className="font-semibold text-[#6e6761]">Priority</label>
                  <select
                    value={drawerPriority}
                    onChange={(e) => setDrawerPriority(e.target.value)}
                    className="w-full bg-[#fcfbf9] border border-[#e7e3da] rounded-xl px-3 py-2 text-xs text-[#262422] font-medium focus:outline-none focus:border-[#b45309] cursor-pointer"
                  >
                    <option value="None">None</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="Normal">Normal</option>
                    <option value="High">High</option>
                    <option value="Urgent">Urgent</option>
                  </select>
                </div>

                {/* Start Date */}
                <div className="space-y-1">
                  <label className="font-semibold text-[#6e6761]">Start Date</label>
                  <input
                    type="date"
                    value={drawerStartDate}
                    onChange={(e) => setDrawerStartDate(e.target.value)}
                    className="w-full bg-[#fcfbf9] border border-[#e7e3da] rounded-xl px-3 py-2 text-xs text-[#262422] focus:outline-none focus:border-[#b45309]"
                  />
                </div>

                {/* Due Date */}
                <div className="space-y-1">
                  <label className="font-semibold text-[#6e6761]">Due Date</label>
                  <input
                    type="date"
                    value={drawerDueDate}
                    onChange={(e) => setDrawerDueDate(e.target.value)}
                    className="w-full bg-[#fcfbf9] border border-[#e7e3da] rounded-xl px-3 py-2 text-xs text-[#262422] focus:outline-none focus:border-[#b45309]"
                  />
                </div>
              </div>

              {/* Tags / Labels */}
              <div className="space-y-1.5 text-xs">
                <label className="font-semibold text-[#6e6761]">Tags / Labels</label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(activeEditingRecord.tags || []).map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md bg-[#f6f4ef] border border-[#e7e3da] text-[#6e6761] text-[10px] font-medium"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Child Tasks Section (for Issues) */}
              {activeEditingRecord.type === 'issue' && (
                <div className="pt-4 border-t border-[#f0ece3] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#262422] uppercase tracking-wider flex items-center gap-1.5">
                      <span>📋 Child Tasks ({currentIssueChildTasks.length})</span>
                    </h4>
                    <span className="text-[10px] text-[#999189]">
                      Click task to view & edit
                    </span>
                  </div>

                  {currentIssueChildTasks.length === 0 ? (
                    <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-dashed border-[#ded9cf] text-center text-xs text-[#999189] italic">
                      No child tasks attached to this issue.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {currentIssueChildTasks.map((task) => {
                        const isTaskDone = task.isCompleted || isDone(null, task.status);
                        const isTaskCanceled = isCanceled(null, task.status);
                        return (
                          <div
                            key={task.id}
                            onClick={() => openWorkItemDrawer('subtask', task.id)}
                            className="p-2.5 rounded-xl bg-[#faf9f6] hover:bg-[#f6f4ef] border border-[#e7e3da] hover:border-[#b45309]/50 transition-all cursor-pointer flex items-center justify-between gap-3 group"
                          >
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="font-mono font-semibold text-[#0284c7]">Task #{task.seq}</span>
                                {task.routineId != null && (
                                  <span className="text-[10px] font-bold text-[#b45309]" title="Recurring Routine">↻</span>
                                )}
                                {task.startDate ? (
                                  <span className="text-[#6e6761] font-mono">📅 {task.startDate}</span>
                                ) : (
                                  <span className="text-[#999189] italic">Unscheduled</span>
                                )}
                              </div>
                              <div className={`text-xs font-medium truncate ${isTaskDone ? 'text-[#6e6761] line-through' : 'text-[#262422]'}`}>
                                {task.title}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                  isTaskDone
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                    : isTaskCanceled
                                    ? 'bg-neutral-100 text-neutral-600 border-neutral-200'
                                    : 'bg-white text-[#6e6761] border-[#e7e3da]'
                                }`}
                              >
                                {isTaskDone ? '✓ Done' : task.status || 'Todo'}
                              </span>
                              <span className="text-xs text-[#999189] group-hover:text-[#b45309]">›</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Recurring Work Section */}
              <div className="pt-4 border-t border-[#f0ece3] space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#262422] uppercase tracking-wider flex items-center gap-1.5">
                    <span>↻ Recurring Work</span>
                  </h4>
                  {connectedRoutine ? (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                        connectedRoutine.status === 'active'
                          ? 'text-[#b45309] bg-[#fbf5ed] border-[#f2e1cc]'
                          : 'text-[#6e6761] bg-[#f6f4ef] border-[#e7e3da]'
                      }`}
                    >
                      {connectedRoutine.status === 'active' ? 'Active Routine' : 'Paused Routine'}
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#999189]">One-off task</span>
                  )}
                </div>

                {connectedRoutine ? (
                  <div className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e3da] space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-[#262422] flex items-center gap-1.5">
                          <span>↻</span>
                          <span>{connectedRoutine.title}</span>
                        </div>
                        <div className="text-[11px] text-[#6e6761] mt-0.5">
                          Cadence: <span className="font-medium text-[#262422]">{formatCadenceHuman(connectedRoutine)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => toggleRoutinePause(connectedRoutine)}
                          className="px-2 py-1 rounded-md text-[10px] font-medium bg-white border border-[#e7e3da] text-[#6e6761] hover:text-[#262422] hover:bg-[#f6f4ef] cursor-pointer shadow-2xs"
                        >
                          {connectedRoutine.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          type="button"
                          onClick={() => detachRoutineFromIssue(activeEditingRecord.id)}
                          className="px-2 py-1 rounded-md text-[10px] font-medium bg-white border border-[#e7e3da] text-[#dc2626] hover:bg-[#fef2f2] cursor-pointer shadow-2xs"
                          title="Detach this task from the routine so it becomes a standalone task"
                        >
                          Detach
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] text-[#6e6761] pt-2 border-t border-[#f0ece3] font-mono">
                      <div>
                        Next Due: <span className="font-semibold text-[#262422]">{connectedRoutine.nextDueDate ? connectedRoutine.nextDueDate.split('T')[0] : 'None'}</span>
                      </div>
                      <div>
                        Execution: <span className="font-semibold text-[#262422]">{connectedRoutine.executionPolicy.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e3da] space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-[#6e6761]">
                        Repeats on a scheduled cadence in QMW.
                      </div>
                      {!showMakeRecurringSelect && (
                        <button
                          type="button"
                          onClick={() => setShowMakeRecurringSelect(true)}
                          className="px-2.5 py-1 rounded-lg bg-white border border-[#e7e3da] text-[#b45309] font-semibold text-xs hover:bg-[#fbf5ed] hover:border-[#b45309] cursor-pointer transition-colors shadow-2xs"
                        >
                          + Make Recurring
                        </button>
                      )}
                    </div>

                    {showMakeRecurringSelect && (
                      <div className="p-2.5 bg-white border border-[#ded9ce] rounded-xl space-y-2 text-xs">
                        <div className="font-semibold text-[#262422] flex items-center justify-between pb-1 border-b border-[#f0ece3]">
                          <span>Select Recurrence Cadence:</span>
                          <button
                            type="button"
                            onClick={() => setShowMakeRecurringSelect(false)}
                            className="text-[#999189] hover:text-[#262422] cursor-pointer"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="grid grid-cols-1 gap-1.5">
                          {[
                            { id: 'weekly', label: 'Weekly', desc: 'Repeats every 7 days', type: 'calendar' as CadenceType, config: { intervalDays: 7 } },
                            { id: 'biweekly', label: 'Every 2 Weeks', desc: 'Repeats every 14 days', type: 'calendar' as CadenceType, config: { intervalDays: 14 } },
                            { id: 'monthly', label: 'Monthly', desc: 'Repeats on the same day each month', type: 'calendar' as CadenceType, config: { intervalDays: 30 } },
                            { id: 'completion_relative', label: 'Completion-relative', desc: 'Next occurrence 7 days after completion', type: 'completion_relative' as CadenceType, config: { daysAfterCompletion: 7 } },
                            { id: 'manual', label: 'Manual', desc: 'Materializes only when manually scheduled', type: 'manual' as CadenceType, config: {} },
                          ].map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => handleApplyRecurringPreset(preset)}
                              className="p-2 rounded-lg border border-[#e7e3da] text-left hover:bg-[#fbf5ed] hover:border-[#b45309] transition-all cursor-pointer flex items-center justify-between group"
                            >
                              <div>
                                <div className="font-semibold text-[#262422] group-hover:text-[#b45309]">{preset.label}</div>
                                <div className="text-[10px] text-[#999189]">{preset.desc}</div>
                              </div>
                              <span className="text-xs text-[#999189] group-hover:text-[#b45309]">Select ›</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contextual Workflow Action Launcher */}
              <div className="pt-4 border-t border-[#f0ece3] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#262422] uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚡ Workflow Actions</span>
                  </h4>
                  {connectedRoutine?.capabilitySlug ||
                  activeEditingRecord.capabilitySlug === 'recovery-video-production' ||
                  (activeEditingRecord.tags && activeEditingRecord.tags.includes('recovery-video-production')) ? (
                    <span className="text-[10px] font-semibold text-[#15803d] bg-[#f0fdf4] border border-[#dcfce7] px-2 py-0.5 rounded">
                      Active Capability Attached
                    </span>
                  ) : (
                    <span className="text-[10px] text-[#999189]">Contextual Actions</span>
                  )}
                </div>

                <p className="text-[11px] text-[#6e6761]">
                  Trigger connected backend capabilities or autonomous agent workflows directly from this work item.
                </p>

                {connectedRoutine?.capabilitySlug ||
                activeEditingRecord.capabilitySlug === 'recovery-video-production' ||
                (activeEditingRecord.tags && activeEditingRecord.tags.includes('recovery-video-production')) ? (
                  <div className="p-3.5 rounded-xl bg-[#faf9f6] border border-[#e7e3da] hover:border-[#d4cebf] transition-all space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xl">🎬</span>
                        <div>
                          <div className="text-xs font-bold text-[#262422]">
                            {connectedRoutine?.title || 'Recovery Guy Video Production'}
                          </div>
                          <div className="text-[10px] text-[#6e6761]">
                            Capability:{' '}
                            <code className="font-mono text-[#b45309]">
                              {connectedRoutine?.capabilitySlug || activeEditingRecord.capabilitySlug || 'recovery-video-production'}
                            </code>
                            <span className="mx-1.5">•</span>
                            Policy:{' '}
                            <span className="font-semibold text-[#262422]">
                              {connectedRoutine?.executionPolicy || 'human_triggered'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Editable Tier 2 / Tier 3 Parameters */}
                    <div className="p-2.5 rounded-xl bg-white border border-[#e7e3da] space-y-2">
                      <div className="text-[11px] font-semibold text-[#262422] flex items-center justify-between">
                        <span>Execution Parameters (Tier 2/3 Overrides)</span>
                        <span className="text-[10px] font-normal text-[#999189]">Editable before invocation</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <label className="text-[10px] font-semibold text-[#6e6761] block mb-0.5">Type</label>
                          <select
                            value={routineParamType}
                            onChange={(e) => setRoutineParamType(e.target.value)}
                            className="w-full bg-[#fbfaf8] border border-[#ded9ce] rounded-lg px-2.5 py-1 text-xs text-[#262422] focus:outline-none focus:border-[#b45309]"
                          >
                            <option value="new">new</option>
                            <option value="repair">repair</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-[#6e6761] block mb-0.5">Episode Count</label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={routineParamCount}
                            onChange={(e) => setRoutineParamCount(Number(e.target.value))}
                            className="w-full bg-[#fbfaf8] border border-[#ded9ce] rounded-lg px-2.5 py-1 text-xs text-[#262422] focus:outline-none focus:border-[#b45309]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <div className="text-[10px] text-[#6e6761]">
                        Clicking Run will enqueue a new capability job with your inputs.
                      </div>
                      <button
                        type="button"
                        disabled={isTriggeringRoutine}
                        onClick={handleTriggerCapabilityRun}
                        className="px-3.5 py-1.5 rounded-lg bg-[#b45309] text-white hover:bg-[#92400e] text-xs font-semibold transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                      >
                        {isTriggeringRoutine ? 'Triggering...' : 'Run Capability'}
                      </button>
                    </div>

                    {routineTriggerResult && (
                      <div className="p-2.5 rounded-lg bg-[#f0fdf4] border border-[#dcfce7] text-[11px] text-[#15803d] font-mono leading-relaxed space-y-0.5">
                        <div>✓ <strong>Capability Job Enqueued Successfully:</strong></div>
                        <div>Job ID: <span className="font-bold">#{routineTriggerResult.invocationId}</span></div>
                        <div>Request: <span className="font-bold">{routineTriggerResult.requestId}</span></div>
                        <div>
                          Effective Parameters:{' '}
                          <span className="text-[#b45309]">
                            type={routineTriggerResult.type}, count={routineTriggerResult.count}
                          </span>
                        </div>
                        <div>
                          Status:{' '}
                          <span className="bg-[#dcfce7] px-1.5 py-0.2 rounded font-semibold text-[#166534]">
                            {routineTriggerResult.status}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : connectedRoutine && connectedRoutine.executionPolicy === 'human_task' ? (
                  <div className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e3da] text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-[#262422]">
                      <span className="text-sm">📋</span>
                      <span>Human Task Routine</span>
                    </div>
                    <p className="text-[11px] text-[#6e6761] leading-relaxed">
                      This recurring work item is designated as a human task. No automated capability execution is required. Simply perform the work and move to <strong>Done</strong> when complete to schedule the next occurrence.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e3da] text-xs space-y-1">
                    <div className="flex items-center gap-1.5 font-medium text-[#262422]">
                      <span className="text-sm">ℹ️</span>
                      <span>No Automated Workflow Actions Mapped</span>
                    </div>
                    <p className="text-[11px] text-[#999189] leading-relaxed">
                      This work item has no active capability attached. Specialized actions (such as{' '}
                      <code className="font-mono text-[#b45309]">recovery-video-production</code>) appear
                      automatically only on configured work items.
                    </p>
                  </div>
                )}

                {/* Architectural Action Slots (Planned V2) */}
                <div className="pt-1 space-y-2">
                  <div className="p-2.5 rounded-xl bg-[#faf9f6] border border-[#e7e3da] flex items-center justify-between text-xs opacity-75">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🔍</span>
                      <div>
                        <div className="font-medium text-[#262422]">Research this task</div>
                        <div className="text-[10px] text-[#999189]">Agent T competitor and market breakdown</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#f2efe9] text-[#6e6761] border border-[#e5e0d8]">
                      Planned (V2)
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#faf9f6] border border-[#e7e3da] flex items-center justify-between text-xs opacity-75">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">🤖</span>
                      <div>
                        <div className="font-medium text-[#262422]">Send to Agent T</div>
                        <div className="text-[10px] text-[#999189]">Autonomous task breakdown & pull request</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#f2efe9] text-[#6e6761] border border-[#e5e0d8]">
                      Planned (V2)
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#faf9f6] border border-[#e7e3da] flex items-center justify-between text-xs opacity-75">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">✍️</span>
                      <div>
                        <div className="font-medium text-[#262422]">Generate Content Batch</div>
                        <div className="text-[10px] text-[#999189]">Content OS script and carousel creator</div>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#f2efe9] text-[#6e6761] border border-[#e5e0d8]">
                      Planned (V2)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sticky Responsive Action Footer */}
            <div className="sticky bottom-0 p-4 border-t border-[#f0ece3] bg-[#faf9f6]/95 backdrop-blur-sm space-y-2.5 z-10 shrink-0">
              <div className="text-[11px] text-[#6e6761] bg-[#f5f2eb] border border-[#e8e2d5] p-2 rounded-xl leading-relaxed flex items-center gap-2">
                <span className="text-xs">💡</span>
                <span>Saving persists your changes directly to the live TaskFlow database.</span>
              </div>

              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={closeWorkItemDrawer}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#6e6761] hover:text-[#262422] hover:bg-[#eae5db] active:bg-[#ded8cc] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveWorkItemToTaskFlow}
                  className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#262422] text-white hover:bg-[#3f3b37] active:bg-[#1a1917] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>✓ Save to TaskFlow</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ============================================================== */}
      {/* BACKLOG PULL-FORWARD MODAL (Live TaskFlow Work Items)           */}
      {/* ============================================================== */}
      {isBacklogDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-[#e7e3da] rounded-2xl w-full max-w-2xl p-5 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#f0ece3]">
              <div>
                <h3 className="text-base font-bold text-[#262422]">Pull Work from Backlog</h3>
                <p className="text-xs text-[#6e6761]">
                  Search and pull unallocated or dormant items forward into your active {currentView} planning horizon
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBacklogDrawerOpen(false)}
                className="text-[#999189] hover:text-[#262422] text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex items-center gap-1.5 bg-[#f6f4ef] p-1 rounded-xl text-xs">
              {[
                { id: 'all', label: 'All Items', count: availableBacklogItems.length },
                { id: 'initiative', label: 'Initiatives', count: availableBacklogItems.filter((i) => i.type === 'initiative').length },
                { id: 'issue', label: 'Issues', count: availableBacklogItems.filter((i) => i.type === 'issue').length },
                { id: 'subtask', label: 'Tasks', count: availableBacklogItems.filter((i) => i.type === 'subtask').length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBacklogFilterTab(tab.id as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                    backlogFilterTab === tab.id
                      ? 'bg-white text-[#262422] shadow-2xs font-semibold'
                      : 'text-[#6e6761] hover:text-[#262422]'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-md bg-[#eeeae0] text-[#6e6761]">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div>
              <input
                type="text"
                value={backlogSearch}
                onChange={(e) => setBacklogSearch(e.target.value)}
                placeholder="Search backlog by title, ID, parent, or tags..."
                className="w-full bg-[#fbfaf8] border border-[#e7e3da] rounded-xl px-3.5 py-2 text-xs text-[#262422] focus:outline-none focus:border-[#b45309]"
              />
            </div>

            {/* Backlog Item List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[380px]">
              {filteredBacklogItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#999189] italic">
                  No matching backlog items found in this project.
                </div>
              ) : (
                filteredBacklogItems.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e3da] flex items-center justify-between gap-3 text-xs hover:border-[#ded9ce] transition-colors"
                  >
                    <div className="space-y-1 truncate flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span
                          className={`px-1.5 py-0.2 rounded font-mono font-semibold uppercase ${
                            item.type === 'initiative'
                              ? 'bg-[#fbf5ed] text-[#b45309] border border-[#f2e1cc]'
                              : item.type === 'issue'
                              ? 'bg-[#f0f9ff] text-[#0284c7] border border-[#e0f2fe]'
                              : 'bg-[#f0fdf4] text-[#15803d] border border-[#dcfce7]'
                          }`}
                        >
                          {item.type === 'subtask' ? 'TASK' : item.type.toUpperCase()} #{item.seq}
                        </span>
                        {item.parentBreadcrumb && (
                          <span className="text-[#999189] truncate">› {item.parentBreadcrumb}</span>
                        )}
                      </div>
                      <div className="font-semibold text-[#262422] truncate">{item.title}</div>
                      <div className="flex items-center gap-2 text-[10px] text-[#999189] font-mono">
                        <span>📅 {item.startDate || 'No date set'}</span>
                        <span>•</span>
                        <span>Status: {item.status}</span>
                        <span>•</span>
                        <span>Priority: {item.prio}</span>
                        {item.isOutsideCurrentHorizon && (
                          <span className="text-[#b45309] bg-[#fbf5ed] px-1 rounded border border-[#f2e1cc]">
                            Outside Current Horizon
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pullItemForward(item.type, item.id)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#e7e3da] text-[#b45309] font-semibold hover:bg-[#fbf5ed] shrink-0 text-xs shadow-2xs cursor-pointer transition-all hover:border-[#b45309]"
                    >
                      + Pull Forward
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#f0ece3] flex items-center justify-between text-xs text-[#999189]">
              <span>Click &quot;+ Pull Forward&quot; to assign into the active {currentView} horizon</span>
              <button
                type="button"
                onClick={() => setIsBacklogDrawerOpen(false)}
                className="px-3.5 py-1.5 rounded-xl border border-[#e7e3da] text-[#262422] hover:bg-[#faf9f6] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
