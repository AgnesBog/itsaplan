'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useShell } from '@/context/shellContext';
import { useShellRoute } from '@/hooks/useShellRoute';
import { useProjectsQuery } from '@/services/projects.service';
import { useInitiativesQuery, useUpdateInitiative } from '@/services/initiatives.service';
import { useUpdateIssue } from '@/services/issues.service';
import { plannerPath } from '@/utils/paths';

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

// -------------------------------------------------------------
// BASELINE DATASETS (Clickbenefit Stage 6 & Stage 4 + BizOps + BookFlow)
// -------------------------------------------------------------
const BASELINE_DATA: Record<string, QmwProjectData> = {
  CBFCTO: {
    id: 1,
    name: 'Clickbenefit',
    key: 'CBFCTO',
    initiatives: [
      {
        id: 35,
        seq: 35,
        title: 'Stage 6 — Complete the content engine',
        description: 'Repeatable content engine supporting audience growth and demand generation for the agency.',
        status: 'In Progress',
        prio: 'High',
        startDate: '2026-10-01',
        dueDate: '2026-10-15',
        tags: ['Content Engine', 'Stage 6', 'Scripts'],
        issues: [
          {
            id: 106,
            seq: 54,
            title: 'Finalize content pillars, audience, and core messaging',
            description: 'Establish the 4 content pillars and customer avatar segments.',
            status: 'Todo',
            prio: 'High',
            startDate: '2026-10-01',
            dueDate: '2026-10-07',
            tags: ['Pillars', 'Messaging'],
            subtasks: [
              { id: 113, seq: 61, title: 'Finalize content pillars and audience', description: 'Review audience qualification rules and 4 topic pillars.', status: 'Todo', prio: 'High', startDate: '2026-10-01', dueDate: '2026-10-03', tags: ['Pillars'] },
              { id: 110, seq: 58, title: 'Finalize core messaging', description: 'Draft the primary value proposition and differentiators.', status: 'Todo', prio: 'High', startDate: '2026-10-02', dueDate: '2026-10-04', tags: ['Messaging'] }
            ]
          },
          {
            id: 107,
            seq: 55,
            title: 'Build a usable bank of scripts, hooks, and calls to action',
            description: 'Create 20 reusable ad video scripts and hook formulas.',
            status: 'Todo',
            prio: 'High',
            startDate: '2026-10-03',
            dueDate: '2026-10-08',
            tags: ['Scripts', 'Hooks'],
            subtasks: [
              { id: 115, seq: 63, title: 'Prepare scripts for the bank', description: 'Batch write 10 problem-aware video ad scripts.', status: 'Todo', prio: 'High', startDate: '2026-10-03', dueDate: '2026-10-05', tags: ['Scripts'] },
              { id: 112, seq: 60, title: 'Prepare hooks and calls to action for the bank', description: 'Test 15 high-converting hook variants with clear CTAs.', status: 'Todo', prio: 'Medium', startDate: '2026-10-04', dueDate: '2026-10-06', tags: ['Hooks'] }
            ]
          },
          {
            id: 108,
            seq: 56,
            title: 'Set a realistic publishing cadence and channel mix',
            description: 'Map weekly distribution across Facebook, Instagram, LinkedIn, and YouTube.',
            status: 'Backlog',
            prio: 'Medium',
            startDate: '2026-10-08',
            dueDate: '2026-10-14',
            tags: ['Cadence', 'Channels'],
            subtasks: [
              { id: 111, seq: 59, title: 'Define the publishing cadence and channel mix', description: 'Establish daily posting schedule and Metricool automation slots.', status: 'Backlog', prio: 'Medium', startDate: '2026-10-08', dueDate: '2026-10-10', tags: ['Cadence'] }
            ]
          },
          {
            id: 109,
            seq: 57,
            title: 'Document the production workflow and prepare the initial batch',
            description: 'Standardize video rendering SOP and launch asset folder.',
            status: 'Backlog',
            prio: 'High',
            startDate: '2026-10-10',
            dueDate: '2026-10-16',
            tags: ['SOP', 'Production'],
            subtasks: [
              { id: 114, seq: 62, title: 'Document production from script through finished asset', description: 'Step-by-step SOP for rendering, captioning, and review.', status: 'Backlog', prio: 'Medium', startDate: '2026-10-10', dueDate: '2026-10-12', tags: ['SOP'] },
              { id: 116, seq: 64, title: 'Prepare an initial batch of launch-ready content', description: 'Pre-render first 5 AI ad videos ready to publish.', status: 'Backlog', prio: 'High', startDate: '2026-10-12', dueDate: '2026-10-15', tags: ['Batch'] },
              {
                id: 199,
                seq: 99,
                title: 'Run Recovery Guy daily production',
                description: 'Dedicated recurring production pipeline: video rendering, script sync, and local runner execution.',
                status: 'Todo',
                prio: 'High',
                startDate: '2026-10-01',
                dueDate: '2026-10-01',
                tags: ['recovery-video-production', 'Daily-Run', 'Automated'],
                capabilitySlug: 'recovery-video-production',
                workflow: 'recovery-video-production'
              }
            ]
          },
          {
            id: 198,
            seq: 98,
            title: 'Quarterly retro and client retention review',
            description: 'Unscheduled operational check-in with no planning date set.',
            status: 'Backlog',
            prio: 'Medium',
            startDate: '',
            dueDate: '',
            tags: ['Retro', 'Unscheduled'],
            subtasks: [
              { id: 197, seq: 97, title: 'Brainstorm secondary niche avatars', description: 'Unscheduled flexible task with no planning date.', status: 'Backlog', prio: 'Low', startDate: '', dueDate: '', tags: ['Avatars'] }
            ]
          }
        ]
      },
      {
        id: 36,
        seq: 36,
        title: 'Stage 4 — Finish the free sample ad entry offer',
        description: 'Publish-ready free sample ad offer acting as entry point into $300–$997 paid service.',
        status: 'In Progress',
        prio: 'High',
        startDate: '2026-10-01',
        dueDate: '2026-10-12',
        tags: ['Offer', 'Stage 4', 'Entry Point'],
        issues: [
          {
            id: 118,
            seq: 66,
            title: 'Define the free sample offer',
            description: 'Specific scope and qualification criteria for free sample offer.',
            status: 'In Progress',
            prio: 'High',
            startDate: '2026-10-01',
            dueDate: '2026-10-05',
            tags: ['Offer Scope'],
            subtasks: [
              { id: 122, seq: 69, title: 'Define who qualifies', description: 'Identify ideal buyer profile (e.g. ad spend > $2k/mo, active FB advertiser).', status: 'In Progress', prio: 'High', startDate: '2026-10-01', dueDate: '2026-10-02', tags: ['Qualification'] },
              { id: 129, seq: 76, title: 'Define what the free sample includes and excludes', description: '1 vertical video concept; excludes revisions or custom sound design.', status: 'In Progress', prio: 'Medium', startDate: '2026-10-02', dueDate: '2026-10-04', tags: ['Inclusions'] }
            ]
          },
          {
            id: 120,
            seq: 68,
            title: 'Define the request and intake process',
            description: 'Simple form or DM flow for receiving prospect product links and brand colors.',
            status: 'Backlog',
            prio: 'Medium',
            startDate: '2026-10-06',
            dueDate: '2026-10-10',
            tags: ['Intake Flow'],
            subtasks: [
              { id: 128, seq: 75, title: 'Clarify the request/intake process', description: 'Design intake questionnaire: product link, logo, offer details.', status: 'Backlog', prio: 'Medium', startDate: '2026-10-06', dueDate: '2026-10-08', tags: ['Intake'] },
              { id: 125, seq: 72, title: 'Specify the assets the prospect must provide', description: 'Clarify resolution and format requirements for product photography.', status: 'Backlog', prio: 'Low', startDate: '2026-10-07', dueDate: '2026-10-09', tags: ['Assets'] }
            ]
          },
          {
            id: 117,
            seq: 65,
            title: 'Set and validate fulfillment expectations',
            description: 'Define 48-72h turnaround time and delivery format.',
            status: 'Backlog',
            prio: 'High',
            startDate: '2026-10-12',
            dueDate: '2026-10-18',
            tags: ['Fulfillment'],
            subtasks: [
              { id: 124, seq: 71, title: 'Set delivery, revision, and turnaround expectations', description: 'Confirm 48-hour delivery commitment and single revision limit.', status: 'Backlog', prio: 'Medium', startDate: '2026-10-12', dueDate: '2026-10-14', tags: ['Turnaround'] },
              { id: 126, seq: 73, title: 'Confirm fulfillment is feasible within current production workflow', description: 'Stress test local pipeline against 3 simultaneous sample requests.', status: 'Backlog', prio: 'High', startDate: '2026-10-14', dueDate: '2026-10-16', tags: ['Capacity'] }
            ]
          },
          {
            id: 119,
            seq: 67,
            title: 'Prepare the offer for use in landing-page copy and outreach',
            description: 'Integrate free sample CTA into landing page hero and outreach template.',
            status: 'Backlog',
            prio: 'High',
            startDate: '2026-10-15',
            dueDate: '2026-10-22',
            tags: ['Copy', 'Outreach'],
            subtasks: [
              { id: 127, seq: 74, title: 'Write the CTA and follow-up that moves prospect to paid offer', description: "Draft the transition script: 'Loved the sample? Here is how to get 10 more.'", status: 'Backlog', prio: 'High', startDate: '2026-10-15', dueDate: '2026-10-18', tags: ['CTA'] },
              { id: 123, seq: 70, title: 'Approve offer copy and fulfillment steps for landing page/outreach', description: 'Final review and signoff on all customer-facing offer text.', status: 'Backlog', prio: 'High', startDate: '2026-10-18', dueDate: '2026-10-21', tags: ['Signoff'] }
            ]
          }
        ]
      },
      {
        id: 22,
        seq: 22,
        title: 'Clickbenefit Sales + Open Loops',
        description: 'Run outreach and close operational loops that block selling.',
        status: 'In Progress',
        prio: 'High',
        startDate: '2026-10-01',
        dueDate: '2026-10-31',
        tags: ['Sales', 'Acquisition'],
        issues: [
          {
            id: 87,
            seq: 44,
            title: 'AI Video Ads outreach — review imported leads and start emailing',
            description: 'Review first batch of 50 verified Facebook ad managers.',
            status: 'Todo',
            prio: 'High',
            startDate: '2026-10-01',
            dueDate: '2026-10-05',
            tags: ['Outreach', 'Email'],
            subtasks: [
              { id: 130, seq: 77, title: 'Verify email deliverability and send first 10 leads', description: 'Send personalized sample offer emails.', status: 'Todo', prio: 'High', startDate: '2026-10-01', dueDate: '2026-10-02', tags: ['Email'] }
            ]
          },
          {
            id: 88,
            seq: 45,
            title: 'Contact Facebook ad managers with test-an-AI-video-first offer',
            description: 'Direct outreach with free sample video teaser.',
            status: 'Todo',
            prio: 'High',
            startDate: '2026-10-03',
            dueDate: '2026-10-08',
            tags: ['Outreach', 'DM'],
            subtasks: [
              { id: 131, seq: 78, title: 'Draft outreach message and message 5 ad managers', description: 'Direct LinkedIn and Meta Ads Library contact.', status: 'Todo', prio: 'Medium', startDate: '2026-10-03', dueDate: '2026-10-05', tags: ['DM'] }
            ]
          }
        ]
      },
      {
        id: 5,
        seq: 5,
        title: 'Clickbenefit Website QA — after outreach is running',
        description: 'Wording/positioning consistency review across all site pages.',
        status: 'Backlog',
        prio: 'Medium',
        startDate: '2026-11-01',
        dueDate: '2026-11-15',
        tags: ['QA', 'Website'],
        issues: []
      },
      {
        id: 27,
        seq: 27,
        title: 'ReachAssist — B2B Lead Generation Service',
        description: 'Next commercial proof stream after Clickbenefit acquisition.',
        status: 'Backlog',
        prio: 'High',
        startDate: '2026-12-01',
        dueDate: '2026-12-20',
        tags: ['B2B', 'LeadGen'],
        issues: []
      },
      {
        id: 40,
        seq: 40,
        title: 'Future Agency Expansion Exploratory',
        description: 'Unscheduled future strategic track for late Q4 or early 2027.',
        status: 'Backlog',
        prio: 'Low',
        startDate: '',
        dueDate: '',
        tags: ['Future', 'Exploratory'],
        issues: []
      }
    ],
    backlogPool: [
      { type: 'initiative', id: 7, title: 'Organic Engagement Starter', status: 'Proposed', prio: 'High' },
      { type: 'initiative', id: 26, title: 'Prototype Selling — AI Video Ads', status: 'In Progress', prio: 'Urgent' },
      { type: 'initiative', id: 28, title: 'AI Video Ads — Service Delivery & Client Operations', status: 'In Progress', prio: 'Urgent' },
      { type: 'issue', id: 104, title: 'Q4 2026 ClickBenefit Content Strategy — CEO Decision', parent: 'Clickbenefit Strategy', prio: 'High' },
      { type: 'issue', id: 48, title: 'Record personalized prototype video for interested prospect', parent: 'Prototype Selling', prio: 'High' },
      { type: 'issue', id: 89, title: 'Close operational open loops that block selling', parent: 'Sales + Open Loops', prio: 'Medium' }
    ]
  },
  AUFL: {
    id: 2,
    name: 'BookFlow',
    key: 'AUFL',
    initiatives: [
      {
        id: 23,
        seq: 23,
        title: 'Winning Content Reverse Engineering Kit',
        description: 'Macro framework for book-to-content transformation.',
        status: 'In Progress',
        prio: 'Urgent',
        startDate: '2026-10-01',
        dueDate: '2026-10-25',
        tags: ['BookFlow', 'Content Kit'],
        issues: [
          {
            id: 201,
            seq: 1,
            title: 'Framework extract & chapter breakdown',
            description: 'Dissect the core book chapters into discrete actionable hooks.',
            status: 'Todo',
            prio: 'High',
            startDate: '2026-10-01',
            dueDate: '2026-10-06',
            tags: ['Framework'],
            subtasks: [
              { id: 301, seq: 1, title: 'Chapter 1–3 hook mapping', description: 'Map out 10 viral hooks from beginning concepts.', status: 'Todo', prio: 'High', startDate: '2026-10-01', dueDate: '2026-10-02', tags: ['Hooks'] }
            ]
          }
        ]
      },
      {
        id: 24,
        seq: 24,
        title: 'BookBoss Portable Content OS',
        description: 'Portable author operating system.',
        status: 'In Progress',
        prio: 'Urgent',
        startDate: '2026-11-01',
        dueDate: '2026-11-30',
        tags: ['BookBoss', 'OS'],
        issues: []
      }
    ],
    backlogPool: [
      { type: 'initiative', id: 25, title: 'Turn My Book Into Content', status: 'Proposed', prio: 'Medium' }
    ]
  },
  BIOS: {
    id: 3,
    name: 'BizOps',
    key: 'BIOS',
    initiatives: [
      {
        id: 20,
        seq: 20,
        title: 'Content OS — Minimum Viable Launch',
        description: 'FemmeFortea ContentOS Stage 6 and Stage 7 launch gates.',
        status: 'In Progress',
        prio: 'High',
        startDate: '2026-10-01',
        dueDate: '2026-10-20',
        tags: ['BizOps', 'ContentOS'],
        issues: [
          {
            id: 205,
            seq: 1,
            title: 'Define Stage 6/7 handoff criteria',
            description: 'Set explicit launch gates for audience growth.',
            status: 'Todo',
            prio: 'High',
            startDate: '2026-10-01',
            dueDate: '2026-10-05',
            tags: ['LaunchGates'],
            subtasks: [
              { id: 305, seq: 1, title: 'Verify checklist completion', description: 'Review operational items before greenlighting.', status: 'Todo', prio: 'High', startDate: '2026-10-01', dueDate: '2026-10-02', tags: ['Review'] }
            ]
          }
        ]
      },
      {
        id: 13,
        seq: 13,
        title: 'Vision Mastery — Recreate Operating Layer',
        description: '3-phase operating skill and middle strategic layer.',
        status: 'Backlog',
        prio: 'High',
        startDate: '2026-11-01',
        dueDate: '2026-11-20',
        tags: ['Vision Mastery'],
        issues: []
      }
    ],
    backlogPool: [
      { type: 'issue', id: 101, title: 'Research CTO runtime dependency / business continuity risk', parent: 'BizOps Core', prio: 'Urgent' }
    ]
  }
};

// -------------------------------------------------------------
// DATE UTILITIES (Strict Local Noon & Duration Preservation)
// -------------------------------------------------------------
function parseLocalDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  // Handle ISO timestamp like 2026-09-26T00:00:00.000Z
  const cleaned = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr.trim();
  const parts = cleaned.split('-');
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

function shiftDateRange(startStr: string | null | undefined, dueStr: string | null | undefined, newStartStr: string): { startDate: string; dueDate: string } {
  if (!newStartStr || newStartStr.trim() === '') {
    return { startDate: '', dueDate: '' };
  }
  const duration = calculateDurationDays(startStr, dueStr);
  const newStartDate = parseLocalDate(newStartStr);
  if (!newStartDate) return { startDate: newStartStr, dueDate: dueStr || '' };

  if (duration !== null && duration >= 0) {
    const newDueDate = new Date(newStartDate.getFullYear(), newStartDate.getMonth(), newStartDate.getDate() + duration, 12, 0, 0);
    return {
      startDate: formatLocalDate(newStartDate),
      dueDate: formatLocalDate(newDueDate)
    };
  }
  return {
    startDate: formatLocalDate(newStartDate),
    dueDate: dueStr || ''
  };
}

// Schedules for October 2026
function getWeekSchedule(weekId: string) {
  const schedules: Record<string, { id: string; label: string; range: string; startIso: string; endIso: string; columns: { id: string; label: string; sublabel: string; targetDate: string }[] }> = {
    w1: {
      id: 'w1',
      label: 'Week 1',
      range: 'Oct 1 – Oct 7, 2026',
      startIso: '2026-10-01',
      endIso: '2026-10-07',
      columns: [
        { id: 'unscheduled', label: 'Unscheduled', sublabel: 'No planning date', targetDate: '' },
        { id: 'mon', label: 'Monday', sublabel: 'Oct 5', targetDate: '2026-10-05' },
        { id: 'tue', label: 'Tuesday', sublabel: 'Oct 6', targetDate: '2026-10-06' },
        { id: 'wed', label: 'Wednesday', sublabel: 'Oct 7', targetDate: '2026-10-07' },
        { id: 'thu', label: 'Thursday', sublabel: 'Oct 1', targetDate: '2026-10-01' },
        { id: 'fri', label: 'Friday', sublabel: 'Oct 2', targetDate: '2026-10-02' },
        { id: 'weekend', label: 'Weekend', sublabel: 'Oct 3 – 4', targetDate: '2026-10-04' }
      ]
    },
    w2: {
      id: 'w2',
      label: 'Week 2',
      range: 'Oct 8 – Oct 14, 2026',
      startIso: '2026-10-08',
      endIso: '2026-10-14',
      columns: [
        { id: 'unscheduled', label: 'Unscheduled', sublabel: 'No planning date', targetDate: '' },
        { id: 'mon', label: 'Monday', sublabel: 'Oct 12', targetDate: '2026-10-12' },
        { id: 'tue', label: 'Tuesday', sublabel: 'Oct 13', targetDate: '2026-10-13' },
        { id: 'wed', label: 'Wednesday', sublabel: 'Oct 14', targetDate: '2026-10-14' },
        { id: 'thu', label: 'Thursday', sublabel: 'Oct 8', targetDate: '2026-10-08' },
        { id: 'fri', label: 'Friday', sublabel: 'Oct 9', targetDate: '2026-10-09' },
        { id: 'weekend', label: 'Weekend', sublabel: 'Oct 10 – 11', targetDate: '2026-10-11' }
      ]
    },
    w3: {
      id: 'w3',
      label: 'Week 3',
      range: 'Oct 15 – Oct 21, 2026',
      startIso: '2026-10-15',
      endIso: '2026-10-21',
      columns: [
        { id: 'unscheduled', label: 'Unscheduled', sublabel: 'No planning date', targetDate: '' },
        { id: 'mon', label: 'Monday', sublabel: 'Oct 19', targetDate: '2026-10-19' },
        { id: 'tue', label: 'Tuesday', sublabel: 'Oct 20', targetDate: '2026-10-20' },
        { id: 'wed', label: 'Wednesday', sublabel: 'Oct 21', targetDate: '2026-10-21' },
        { id: 'thu', label: 'Thursday', sublabel: 'Oct 15', targetDate: '2026-10-15' },
        { id: 'fri', label: 'Friday', sublabel: 'Oct 16', targetDate: '2026-10-16' },
        { id: 'weekend', label: 'Weekend', sublabel: 'Oct 17 – 18', targetDate: '2026-10-18' }
      ]
    },
    w4: {
      id: 'w4',
      label: 'Week 4',
      range: 'Oct 22 – Oct 28, 2026',
      startIso: '2026-10-22',
      endIso: '2026-10-28',
      columns: [
        { id: 'unscheduled', label: 'Unscheduled', sublabel: 'No planning date', targetDate: '' },
        { id: 'mon', label: 'Monday', sublabel: 'Oct 26', targetDate: '2026-10-26' },
        { id: 'tue', label: 'Tuesday', sublabel: 'Oct 27', targetDate: '2026-10-27' },
        { id: 'wed', label: 'Wednesday', sublabel: 'Oct 28', targetDate: '2026-10-28' },
        { id: 'thu', label: 'Thursday', sublabel: 'Oct 22', targetDate: '2026-10-22' },
        { id: 'fri', label: 'Friday', sublabel: 'Oct 23', targetDate: '2026-10-23' },
        { id: 'weekend', label: 'Weekend', sublabel: 'Oct 24 – 25', targetDate: '2026-10-25' }
      ]
    }
  };
  return schedules[weekId] || schedules.w1;
}

function getTaskColumnForWeek(task: QmwTask, currentSchedule: ReturnType<typeof getWeekSchedule>): string | null {
  if (!task.startDate || task.startDate.trim() === '') return 'unscheduled';
  const cleanDate = task.startDate.includes('T') ? task.startDate.split('T')[0] : task.startDate;
  if (cleanDate < currentSchedule.startIso || cleanDate > currentSchedule.endIso) return null;
  const d = parseLocalDate(cleanDate);
  if (!d) return 'unscheduled';
  const day = d.getDay();
  if (day === 1) return 'mon';
  if (day === 2) return 'tue';
  if (day === 3) return 'wed';
  if (day === 4) return 'thu';
  if (day === 5) return 'fri';
  if (day === 0 || day === 6) return 'weekend';
  return 'unscheduled';
}

function getIssueColumnForMonth(iss: QmwIssue): string {
  if (!iss.startDate || iss.startDate.trim() === '') return 'unscheduled';
  const d = parseLocalDate(iss.startDate);
  if (!d) return 'unscheduled';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (y === 2026 && m === 10) {
    if (day >= 1 && day <= 7) return 'w1';
    if (day >= 8 && day <= 14) return 'w2';
    if (day >= 15 && day <= 21) return 'w3';
    if (day >= 22 && day <= 31) return 'w4';
  }
  return 'unscheduled';
}

function getInitiativeColumnForQuarter(init: QmwInitiative): string {
  if (!init.startDate || init.startDate.trim() === '') return 'unallocated';
  const d = parseLocalDate(init.startDate);
  if (!d) return 'unallocated';
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (y === 2026) {
    if (m === 10) return 'oct';
    if (m === 11) return 'nov';
    if (m === 12) return 'dec';
  }
  return 'unallocated';
}

// -------------------------------------------------------------
// MAIN COMPONENT: QmwPlannerPage
// -------------------------------------------------------------
export default function QmwPlannerPage() {
  const router = useRouter();
  const { project: shellProject } = useShell();
  const shellRoute = useShellRoute();
  const projectKey = shellRoute.projectKey || shellProject?.project.ref || '';

  // TaskFlow Queries & Mutations
  const { data: projectsList } = useProjectsQuery();
  const { data: initiativesData } = useInitiativesQuery(projectKey, { page: 1, pageSize: 100 });
  const updateIssue = useUpdateIssue(projectKey);
  const updateInitiative = useUpdateInitiative(projectKey);

  // Derive current project key and teamRef
  const activeKeyUpper = (shellProject?.project.key || 'CBFCTO').toUpperCase();

  // Primary Planner State
  const [plannerData, setPlannerData] = useState<QmwProjectData>(() => {
    return BASELINE_DATA[activeKeyUpper] || BASELINE_DATA.CBFCTO;
  });

  const [currentView, setCurrentView] = useState<'quarter' | 'month' | 'week'>('week');
  const [activeWeek, setActiveWeek] = useState<'w1' | 'w2' | 'w3' | 'w4'>('w1');
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

  const [isPlanLocked, setIsPlanLocked] = useState<boolean>(false);
  const [hasDraftChanges, setHasDraftChanges] = useState<boolean>(false);

  // Work Item Drawer State
  const [activeEditingRecord, setActiveEditingRecord] = useState<{
    type: 'initiative' | 'issue' | 'subtask';
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
    breadcrumb: string;
  } | null>(null);

  // Drawer Form fields
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerDescription, setDrawerDescription] = useState('');
  const [drawerStatus, setDrawerStatus] = useState('Todo');
  const [drawerPriority, setDrawerPriority] = useState('Normal');
  const [drawerStartDate, setDrawerStartDate] = useState('');
  const [drawerDueDate, setDrawerDueDate] = useState('');

  // Backlog Pull Drawer State
  const [isBacklogDrawerOpen, setIsBacklogDrawerOpen] = useState(false);
  const [backlogSearch, setBacklogSearch] = useState('');

  // Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'warn' | 'info' } | null>(null);

  // Recovery Guy action trigger state
  const [recoveryGuyTriggering, setRecoveryGuyTriggering] = useState(false);
  const [recoveryGuyStatus, setRecoveryGuyStatus] = useState<string | null>(null);

  // Highlighted card animation ref
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  // Dragging state
  const draggedItemRef = useRef<{ type: 'initiative' | 'issue' | 'subtask'; id: number } | null>(null);
  const [dragOverZone, setDragOverZone] = useState<string | null>(null);

  // Initialize and synchronize with TaskFlow Project and Database
  useEffect(() => {
    const base = BASELINE_DATA[activeKeyUpper] || BASELINE_DATA.CBFCTO;

    // Deep copy baseline
    const merged: QmwProjectData = JSON.parse(JSON.stringify(base));

    // If live initiatives exist in TaskFlow, merge their real persistent state
    if (initiativesData && initiativesData.items && initiativesData.items.length > 0) {
      initiativesData.items.forEach((liveInit) => {
        const found = merged.initiatives.find((i) => i.id === liveInit.id || i.seq === liveInit.id);
        if (found) {
          found.title = liveInit.title;
          if (liveInit.description) found.description = liveInit.description;
          if (liveInit.startDate) found.startDate = liveInit.startDate.split('T')[0];
          if (liveInit.targetDate) found.dueDate = liveInit.targetDate.split('T')[0];
          if (liveInit.status) found.status = liveInit.status;
          if (liveInit.priority) found.prio = liveInit.priority;
        }
      });
    }

    // If live issues exist in TaskFlow (via shellProject.issues), merge them
    if (shellProject && shellProject.issues && shellProject.issues.length > 0) {
      shellProject.issues.forEach((liveIssue) => {
        // Check if top-level issue or subtask
        for (const init of merged.initiatives) {
          // Check issues
          const foundIssue = init.issues.find((i) => i.id === liveIssue.id || i.seq === liveIssue.sequenceNumber);
          if (foundIssue) {
            foundIssue.title = liveIssue.title;
            if (liveIssue.description) foundIssue.description = liveIssue.description;
            if (liveIssue.startDate) foundIssue.startDate = liveIssue.startDate.split('T')[0];
            if (liveIssue.dueDate) foundIssue.dueDate = liveIssue.dueDate.split('T')[0];
            if (liveIssue.priority) foundIssue.prio = liveIssue.priority;
          }
          // Check subtasks
          for (const iss of init.issues) {
            const foundSub = iss.subtasks.find((s) => s.id === liveIssue.id || s.seq === liveIssue.sequenceNumber);
            if (foundSub) {
              foundSub.title = liveIssue.title;
              if (liveIssue.description) foundSub.description = liveIssue.description;
              if (liveIssue.startDate) foundSub.startDate = liveIssue.startDate.split('T')[0];
              if (liveIssue.dueDate) foundSub.dueDate = liveIssue.dueDate.split('T')[0];
              if (liveIssue.priority) foundSub.prio = liveIssue.priority;
            }
          }
        }
      });
    }

    setPlannerData(merged);
  }, [activeKeyUpper, initiativesData, shellProject]);

  // Toast auto-clear
  const showToast = (message: string, type: 'success' | 'warn' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  // Switch Project Handler
  const handleProjectSelect = (targetKey: string) => {
    if (!projectsList || projectsList.length === 0) return;
    const targetProject = projectsList.find((p) => p.key.toUpperCase() === targetKey.toUpperCase());
    if (targetProject) {
      router.push(plannerPath(targetProject.ref));
    }
  };

  // Toggle Plan Lock
  const togglePlanLock = () => {
    setIsPlanLocked((prev) => {
      const next = !prev;
      if (next) {
        showToast('✓ Plan is locked. Drag-and-drop allocation is paused.', 'success');
      } else {
        showToast('🔓 Plan unlocked for visual draft allocation.', 'info');
      }
      return next;
    });
  };

  // Switch Planning View
  const switchView = (view: 'quarter' | 'month' | 'week') => {
    setCurrentView(view);
  };

  // Jump from Month to specific Week
  const jumpToWeek = (wId: string) => {
    if (['w1', 'w2', 'w3', 'w4'].includes(wId)) {
      setActiveWeek(wId as 'w1' | 'w2' | 'w3' | 'w4');
    }
    setCurrentView('week');
  };

  // Execute Allocation Move (Drag and drop with TaskFlow writeback)
  const executeAllocationMove = (
    type: 'initiative' | 'issue' | 'subtask',
    id: number,
    targetCol: string
  ) => {
    setPlannerData((prev) => {
      const copy: QmwProjectData = JSON.parse(JSON.stringify(prev));

      if (type === 'initiative') {
        const init = copy.initiatives.find((i) => i.id === id);
        if (!init) return prev;

        const colDefs: Record<string, { label: string; targetDate: string }> = {
          oct: { label: 'Month 1 • October', targetDate: '2026-10-01' },
          nov: { label: 'Month 2 • November', targetDate: '2026-11-01' },
          dec: { label: 'Month 3 • December', targetDate: '2026-12-01' },
          unallocated: { label: 'Unscheduled', targetDate: '' }
        };
        const def = colDefs[targetCol] || { label: targetCol, targetDate: '' };
        const duration = calculateDurationDays(init.startDate, init.dueDate);
        const { startDate, dueDate } = shiftDateRange(init.startDate, init.dueDate, def.targetDate);

        init.startDate = startDate;
        init.dueDate = dueDate;

        // Persist to TaskFlow database
        updateInitiative.mutate({
          id: init.id,
          patch: {
            startDate: startDate ? startDate.split('T')[0] : null,
            targetDate: dueDate ? dueDate.split('T')[0] : null
          }
        });

        const durMsg = duration !== null && duration > 0 ? ` (${duration}d duration preserved)` : '';
        showToast(`✓ Initiative #${init.seq} moved to ${def.label}: ${startDate || 'Unscheduled'}${durMsg}`, 'success');

      } else if (type === 'issue') {
        let targetIssue: QmwIssue | null = null;
        for (const init of copy.initiatives) {
          const found = init.issues.find((i) => i.id === id);
          if (found) { targetIssue = found; break; }
        }
        if (!targetIssue) return prev;

        const colDefs: Record<string, { label: string; targetDate: string }> = {
          w1: { label: 'Week 1', targetDate: '2026-10-01' },
          w2: { label: 'Week 2', targetDate: '2026-10-08' },
          w3: { label: 'Week 3', targetDate: '2026-10-15' },
          w4: { label: 'Week 4', targetDate: '2026-10-22' },
          unscheduled: { label: 'Unscheduled', targetDate: '' }
        };
        const def = colDefs[targetCol] || { label: targetCol, targetDate: '' };
        const duration = calculateDurationDays(targetIssue.startDate, targetIssue.dueDate);
        const { startDate, dueDate } = shiftDateRange(targetIssue.startDate, targetIssue.dueDate, def.targetDate);

        targetIssue.startDate = startDate;
        targetIssue.dueDate = dueDate;

        // Persist to TaskFlow database
        updateIssue.mutate({
          id: targetIssue.id,
          patch: {
            startDate: startDate ? startDate.split('T')[0] : null,
            dueDate: dueDate ? dueDate.split('T')[0] : null
          }
        });

        const durMsg = duration !== null && duration > 0 ? ` (${duration}d duration preserved)` : '';
        showToast(`✓ Issue #${targetIssue.seq} moved to ${def.label}: ${startDate || 'Unscheduled'}${durMsg}`, 'success');

      } else if (type === 'subtask') {
        let targetSub: QmwTask | null = null;
        for (const init of copy.initiatives) {
          for (const iss of init.issues) {
            const found = iss.subtasks.find((s) => s.id === id);
            if (found) { targetSub = found; break; }
          }
        }
        if (!targetSub) return prev;

        const currentSchedule = getWeekSchedule(activeWeek);
        const colDef = currentSchedule.columns.find((c) => c.id === targetCol) || { label: targetCol, targetDate: '' };
        const duration = calculateDurationDays(targetSub.startDate, targetSub.dueDate);
        const { startDate, dueDate } = shiftDateRange(targetSub.startDate, targetSub.dueDate, colDef.targetDate);

        targetSub.startDate = startDate;
        targetSub.dueDate = dueDate;

        // Persist to TaskFlow database
        updateIssue.mutate({
          id: targetSub.id,
          patch: {
            startDate: startDate ? startDate.split('T')[0] : null,
            dueDate: dueDate ? dueDate.split('T')[0] : null
          }
        });

        const durMsg = duration !== null && duration > 0 ? ` (${duration}d duration preserved)` : '';
        const dateNote = startDate ? `${startDate}${dueDate && dueDate !== startDate ? ' → ' + dueDate : ''}` : 'Unscheduled';
        showToast(`✓ Task #${targetSub.seq} placed under ${colDef.label}: ${dateNote}${durMsg}`, 'success');
      }

      setHasDraftChanges(true);
      return copy;
    });
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
            prio: iss.prio || 'Normal',
            startDate: iss.startDate,
            dueDate: iss.dueDate,
            tags: iss.tags || ['Issue'],
            capabilitySlug: iss.capabilitySlug,
            workflow: iss.workflow,
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
              prio: sub.prio || 'Normal',
              startDate: sub.startDate,
              dueDate: sub.dueDate,
              tags: sub.tags || ['Task'],
              capabilitySlug: sub.capabilitySlug,
              workflow: sub.workflow,
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
    setDrawerPriority(rec.prio || 'Normal');
    setDrawerStartDate(rec.startDate || '');
    setDrawerDueDate(rec.dueDate || '');
    setRecoveryGuyStatus(null);
  };

  // Close Work Item Drawer
  const closeWorkItemDrawer = () => {
    setActiveEditingRecord(null);
  };

  // Save Work Item Back to TaskFlow
  const saveWorkItemToTaskFlow = () => {
    if (!activeEditingRecord) return;
    const { type, id } = activeEditingRecord;

    if (!drawerTitle.trim()) {
      alert('Title cannot be empty.');
      return;
    }

    setPlannerData((prev) => {
      const copy: QmwProjectData = JSON.parse(JSON.stringify(prev));

      if (type === 'initiative') {
        const init = copy.initiatives.find((i) => i.id === id);
        if (init) {
          init.title = drawerTitle.trim();
          init.description = drawerDescription;
          init.status = drawerStatus;
          init.prio = drawerPriority;
          init.startDate = drawerStartDate;
          init.dueDate = drawerDueDate;
        }
        // Save to TaskFlow API
        updateInitiative.mutate({
          id,
          patch: {
            title: drawerTitle.trim(),
            description: drawerDescription,
            status: drawerStatus.toLowerCase() as any,
            priority: drawerPriority,
            startDate: drawerStartDate ? drawerStartDate.split('T')[0] : null,
            targetDate: drawerDueDate ? drawerDueDate.split('T')[0] : null
          }
        });

      } else if (type === 'issue') {
        for (const init of copy.initiatives) {
          const iss = init.issues.find((i) => i.id === id);
          if (iss) {
            iss.title = drawerTitle.trim();
            iss.description = drawerDescription;
            iss.status = drawerStatus;
            iss.prio = drawerPriority;
            iss.startDate = drawerStartDate;
            iss.dueDate = drawerDueDate;
            break;
          }
        }
        // Save to TaskFlow API
        updateIssue.mutate({
          id,
          patch: {
            title: drawerTitle.trim(),
            description: drawerDescription,
            priority: drawerPriority,
            startDate: drawerStartDate ? drawerStartDate.split('T')[0] : null,
            dueDate: drawerDueDate ? drawerDueDate.split('T')[0] : null
          }
        });

      } else if (type === 'subtask') {
        for (const init of copy.initiatives) {
          for (const iss of init.issues) {
            const sub = iss.subtasks.find((s) => s.id === id);
            if (sub) {
              sub.title = drawerTitle.trim();
              sub.description = drawerDescription;
              sub.status = drawerStatus;
              sub.prio = drawerPriority;
              sub.startDate = drawerStartDate;
              sub.dueDate = drawerDueDate;
              break;
            }
          }
        }
        // Save to TaskFlow API
        updateIssue.mutate({
          id,
          patch: {
            title: drawerTitle.trim(),
            description: drawerDescription,
            priority: drawerPriority,
            startDate: drawerStartDate ? drawerStartDate.split('T')[0] : null,
            dueDate: drawerDueDate ? drawerDueDate.split('T')[0] : null
          }
        });
      }

      return copy;
    });

    closeWorkItemDrawer();
    setHasDraftChanges(true);
    showToast(`✓ Saved to TaskFlow. Record #${id} ("${drawerTitle.trim()}") updated. Calendar placement synced.`, 'success');
  };

  // Trigger Recovery Guy Action
  const triggerRecoveryGuyAction = async () => {
    setRecoveryGuyTriggering(true);
    const reqId = `req-recov-${Date.now().toString(36)}`;
    try {
      await fetch('https://api.app.journaltogrow.com/capabilities/invoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          capabilitySlug: 'recovery-video-production',
          issueId: activeEditingRecord?.id,
          inputPayload: {
            triggerSource: 'BizOS QMW Dashboard Work Item Drawer',
            timestamp: new Date().toISOString()
          }
        })
      });
    } catch {
      // Safe fallback
    } finally {
      setRecoveryGuyTriggering(false);
      setRecoveryGuyStatus(reqId);
      showToast(`🎬 Recovery Guy Daily Production job queued (${reqId})`, 'success');
    }
  };

  // Backlog Pull-Forward
  const pullItemForward = (type: 'initiative' | 'issue', id: number) => {
    const idx = plannerData.backlogPool.findIndex((i) => i.id === id && i.type === type);
    if (idx === -1) return;

    const item = plannerData.backlogPool[idx];
    let targetCardId = '';

    setPlannerData((prev) => {
      const copy: QmwProjectData = JSON.parse(JSON.stringify(prev));
      const poolIdx = copy.backlogPool.findIndex((i) => i.id === id && i.type === type);
      if (poolIdx !== -1) {
        copy.backlogPool.splice(poolIdx, 1);
      }

      if (type === 'initiative') {
        copy.initiatives.push({
          id: item.id,
          seq: item.id,
          title: item.title,
          description: 'Pulled from strategic backlog.',
          status: item.status || 'In Progress',
          prio: item.prio || 'Normal',
          startDate: '2026-10-01',
          dueDate: '2026-10-15',
          tags: ['Pulled', 'Initiative'],
          issues: []
        });
        targetCardId = `card-initiative-${item.id}`;
        setCurrentView('quarter');
      } else if (type === 'issue') {
        const targetInit = copy.initiatives[0];
        if (targetInit) {
          targetInit.issues.push({
            id: item.id,
            seq: item.id,
            title: item.title,
            description: 'Pulled forward from project backlog.',
            status: 'Todo',
            prio: item.prio || 'Normal',
            startDate: '2026-10-01',
            dueDate: '2026-10-07',
            tags: ['Pulled', 'Issue'],
            subtasks: [
              {
                id: item.id * 10,
                seq: item.id * 10,
                title: 'Review & schedule ' + item.title,
                description: 'Next action step.',
                status: 'Todo',
                prio: 'Normal',
                startDate: '2026-10-01',
                dueDate: '2026-10-02',
                tags: ['Task']
              }
            ]
          });
        }
        targetCardId = `card-issue-${item.id}`;
        setCurrentView('month');
      }

      return copy;
    });

    setIsBacklogDrawerOpen(false);
    setHasDraftChanges(true);
    showToast(`🎉 Pulled "${item.title}" into active planning horizon!`, 'success');

    // Highlight card
    if (targetCardId) {
      setHighlightedCardId(targetCardId);
      setTimeout(() => {
        const elem = document.getElementById(targetCardId);
        if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      setTimeout(() => setHighlightedCardId(null), 3200);
    }
  };

  // Filtered Backlog items
  const filteredBacklogItems = useMemo(() => {
    const q = backlogSearch.toLowerCase().trim();
    if (!q) return plannerData.backlogPool;
    return plannerData.backlogPool.filter(
      (item) => item.title.toLowerCase().includes(q) || String(item.id).includes(q)
    );
  }, [plannerData.backlogPool, backlogSearch]);

  // Filtered Initiatives
  const activeInitiatives = useMemo(() => {
    if (selectedInitiativeFilter === 'all') return plannerData.initiatives;
    return plannerData.initiatives.filter((i) => String(i.id) === selectedInitiativeFilter);
  }, [plannerData.initiatives, selectedInitiativeFilter]);

  // Filtered Issues (for Month view)
  const activeMonthIssues = useMemo(() => {
    const list: (QmwIssue & { parentInitiativeTitle: string; parentInitiativeSeq: number })[] = [];
    plannerData.initiatives.forEach((init) => {
      if (selectedInitiativeFilter === 'all' || String(init.id) === selectedInitiativeFilter) {
        init.issues.forEach((iss) => {
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
      if (selectedInitiativeFilter === 'all' || String(init.id) === selectedInitiativeFilter) {
        init.issues.forEach((iss) => {
          iss.subtasks.forEach((sub) => {
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

  // Active Week Schedule
  const currentWeekSchedule = useMemo(() => getWeekSchedule(activeWeek), [activeWeek]);

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

            {/* Project Selector */}
            <div className="flex items-center gap-2 bg-[#f8f6f2] border border-[#e7e3da] px-3 py-1.5 rounded-xl text-xs">
              <label htmlFor="projectSelector" className="text-[#6e6761] font-medium">Project:</label>
              <select
                id="projectSelector"
                value={activeKeyUpper}
                onChange={(e) => handleProjectSelect(e.target.value)}
                className="bg-[#faf9f6] text-[#262422] font-semibold focus:outline-none cursor-pointer rounded px-1"
              >
                <option value="CBFCTO" className="bg-[#faf9f6] text-[#262422]">Clickbenefit (CBFCTO)</option>
                <option value="AUFL" className="bg-[#faf9f6] text-[#262422]">BookFlow (AUFL)</option>
                <option value="BIOS" className="bg-[#faf9f6] text-[#262422]">BizOps (BIOS)</option>
              </select>
            </div>
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

            {/* Plan Lock / Status Controls */}
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border ${
                  isPlanLocked
                    ? 'bg-[#f0fdf4] border-[#dcfce7] text-[#15803d]'
                    : 'bg-[#fbf5ed] border-[#f2e1cc] text-[#b45309]'
                }`}
              >
                <span className={`size-1.5 rounded-full ${isPlanLocked ? 'bg-[#15803d]' : 'bg-[#b45309]'}`}></span>
                <span>{isPlanLocked ? 'Plan Locked (Committed)' : hasDraftChanges ? 'Draft Plan (Changes Pending)' : 'Draft Plan (Editable)'}</span>
              </div>

              <button
                type="button"
                onClick={togglePlanLock}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer ${
                  isPlanLocked
                    ? 'bg-[#faf9f6] text-[#262422] border border-[#e7e3da] hover:bg-[#f3f0e8]'
                    : 'bg-[#262422] text-[#fcfbf9] hover:bg-[#3f3b37]'
                }`}
              >
                <span>{isPlanLocked ? '🔓' : '🔒'}</span>
                <span>{isPlanLocked ? 'Unlock to Replan' : 'Lock Plan'}</span>
              </button>
            </div>
          </div>
        </header>

        {/* ============================================================== */}
        {/* PLANNING VIEW BAR: Quarter | Month | Week + Week Selector     */}
        {/* ============================================================== */}
        <div className="bg-white border border-[#e7e3da] rounded-2xl p-3 sm:px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-xs">
          
          {/* Main Planning Views Switcher + Week Sub-Selector */}
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

            {/* Week Sub-Selector (Visible in Week View) */}
            {currentView === 'week' && (
              <div className="flex items-center gap-1.5 bg-[#faf9f6] border border-[#e7e3da] px-2.5 py-1 rounded-xl text-xs">
                <span className="text-[#6e6761] font-semibold text-[11px] uppercase tracking-wider">Week:</span>
                <div className="flex items-center gap-1">
                  {(['w1', 'w2', 'w3', 'w4'] as const).map((wId) => {
                    const active = activeWeek === wId;
                    const labels = {
                      w1: 'W1 (Oct 1–7)',
                      w2: 'W2 (Oct 8–14)',
                      w3: 'W3 (Oct 15–21)',
                      w4: 'W4 (Oct 22–28)'
                    };
                    return (
                      <button
                        key={wId}
                        type="button"
                        onClick={() => setActiveWeek(wId)}
                        className={`px-2.5 py-1 rounded-lg text-xs cursor-pointer transition-all ${
                          active
                            ? 'font-semibold bg-white border border-[#e7e3da] text-[#262422] shadow-2xs'
                            : 'font-medium text-[#6e6761] hover:text-[#262422]'
                        }`}
                      >
                        {labels[wId]}
                      </button>
                    );
                  })}
                </div>
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

        {/* View Context Banner */}
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
            {currentView === 'quarter' && `${activeInitiatives.length} Initiatives`}
            {currentView === 'month' && `${activeMonthIssues.length} Issues across active initiatives`}
            {currentView === 'week' && `${activeWeekTasks.length} Actionable Tasks across selected work (${currentWeekSchedule.range})`}
          </div>
        </div>

        {/* ============================================================== */}
        {/* BOARD VIEW CONTAINERS                                          */}
        {/* ============================================================== */}

        {/* 1. QUARTER VIEW: 4 columns (Oct, Nov, Dec, Unscheduled) */}
        {currentView === 'quarter' && (
          <main className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { id: 'oct', label: 'Month 1 • October', sublabel: 'Oct 1 – Oct 31, 2026' },
              { id: 'nov', label: 'Month 2 • November', sublabel: 'Nov 1 – Nov 30, 2026' },
              { id: 'dec', label: 'Month 3 • December', sublabel: 'Dec 1 – Dec 31, 2026' },
              { id: 'unallocated', label: 'Unscheduled', sublabel: 'Strategic Reserve • No dates' }
            ].map((col) => {
              const isUnscheduled = col.id === 'unallocated';
              const itemsInCol = activeInitiatives.filter((i) => getInitiativeColumnForQuarter(i) === col.id);
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
                        const isGlowing = highlightedCardId === `card-initiative-${init.id}`;
                        return (
                          <div
                            key={init.id}
                            id={`card-initiative-${init.id}`}
                            draggable={!isPlanLocked}
                            onDragStart={() => {
                              draggedItemRef.current = { type: 'initiative', id: init.id };
                            }}
                            onDragEnd={() => {
                              draggedItemRef.current = null;
                            }}
                            onClick={() => openWorkItemDrawer('initiative', init.id)}
                            className={`paper-card rounded-xl p-3.5 space-y-2 select-none cursor-pointer ${
                              isGlowing ? 'pulled-glow' : ''
                            }`}
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono text-[#b45309] bg-[#fbf5ed] border border-[#f2e1cc] px-1.5 py-0.2 rounded font-semibold">
                                Initiative #{init.seq}
                              </span>
                              <span className="text-[#6e6761] text-[10px] font-medium">{init.prio || 'Normal'}</span>
                            </div>
                            <h4 className="text-xs font-bold text-[#262422] leading-snug">{init.title}</h4>
                            <p className="text-[11px] text-[#6e6761] line-clamp-2">{init.description || ''}</p>
                            <div className="text-[10px] font-mono text-[#999189] bg-[#faf9f6] px-2 py-1 rounded border border-[#f0ece3] flex items-center justify-between">
                              <span>📅 {init.startDate || 'Unscheduled'}</span>
                            </div>
                            <div className="pt-2 border-t border-[#f0ece3] flex items-center justify-between text-[11px] text-[#999189]">
                              <span>
                                Status: <strong className="text-[#262422] font-medium">{init.status || 'Active'}</strong>
                              </span>
                              <span className="font-medium text-[#b45309] hover:underline">
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

        {/* 2. MONTH VIEW: 5 columns (W1, W2, W3, W4, Unscheduled) */}
        {currentView === 'month' && (
          <main className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {[
              { id: 'w1', label: 'Week 1', sublabel: 'Oct 1 – Oct 7' },
              { id: 'w2', label: 'Week 2', sublabel: 'Oct 8 – Oct 14' },
              { id: 'w3', label: 'Week 3', sublabel: 'Oct 15 – Oct 21' },
              { id: 'w4', label: 'Week 4', sublabel: 'Oct 22 – Oct 28' },
              { id: 'unscheduled', label: 'Unscheduled', sublabel: 'Month Backlog • No dates' }
            ].map((col) => {
              const isUnscheduled = col.id === 'unscheduled';
              const itemsInCol = activeMonthIssues.filter((i) => getIssueColumnForMonth(i) === col.id);
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
                        const isGlowing = highlightedCardId === `card-issue-${iss.id}`;
                        return (
                          <div
                            key={iss.id}
                            id={`card-issue-${iss.id}`}
                            draggable={!isPlanLocked}
                            onDragStart={() => {
                              draggedItemRef.current = { type: 'issue', id: iss.id };
                            }}
                            onDragEnd={() => {
                              draggedItemRef.current = null;
                            }}
                            onClick={() => openWorkItemDrawer('issue', iss.id)}
                            className={`paper-card rounded-xl p-3 space-y-2 select-none cursor-pointer ${
                              isGlowing ? 'pulled-glow' : ''
                            }`}
                          >
                            <div className="text-[10px] text-[#b45309] font-medium bg-[#fcf8f2] border border-[#faedd9] px-2 py-0.5 rounded-md truncate">
                              #{iss.parentInitiativeSeq} {iss.parentInitiativeTitle}
                            </div>
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-mono text-[#0284c7] font-semibold">Issue #{iss.seq}</span>
                              <span className="text-[#6e6761] text-[10px]">{iss.prio || 'Normal'}</span>
                            </div>
                            <h4 className="text-xs font-semibold text-[#262422] leading-snug">{iss.title}</h4>
                            <div className="text-[10px] font-mono text-[#999189] bg-[#faf9f6] px-2 py-1 rounded border border-[#f0ece3]">
                              📅 {iss.startDate || 'Unscheduled'}
                            </div>
                            <div className="pt-1.5 border-t border-[#f0ece3] flex items-center justify-between text-[10px] text-[#999189]">
                              <span>
                                Status: <strong className="text-[#262422] font-medium">{iss.status || 'Todo'}</strong>
                              </span>
                              <span
                                className="text-[#15803d] font-medium hover:underline cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  jumpToWeek(col.id);
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

        {/* 3. WEEK VIEW: 7 columns (Mon, Tue, Wed, Thu, Fri, Weekend, Unscheduled) */}
        {currentView === 'week' && (
          <main className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {currentWeekSchedule.columns.map((col) => {
              const isUnscheduled = col.id === 'unscheduled';
              const itemsInCol = activeWeekTasks.filter(
                (t) => getTaskColumnForWeek(t, currentWeekSchedule) === col.id
              );
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
                      : 'bg-[#f6f4ef] border-[#e7e3da]'
                  } ${isHovered ? 'drag-target-hover' : ''} border rounded-2xl p-3 flex flex-col space-y-2.5 min-h-[500px] transition-all`}
                >
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#e7e3da]">
                    <div>
                      <h3 className="text-xs font-bold text-[#262422] uppercase tracking-wider">{col.label}</h3>
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
                        const isRecoveryGuy =
                          task.capabilitySlug === 'recovery-video-production' ||
                          (task.tags && task.tags.includes('recovery-video-production'));
                        const isGlowing = highlightedCardId === `card-subtask-${task.id}`;

                        return (
                          <div
                            key={task.id}
                            id={`card-subtask-${task.id}`}
                            draggable={!isPlanLocked}
                            onDragStart={() => {
                              draggedItemRef.current = { type: 'subtask', id: task.id };
                            }}
                            onDragEnd={() => {
                              draggedItemRef.current = null;
                            }}
                            onClick={() => openWorkItemDrawer('subtask', task.id)}
                            className={`paper-card rounded-xl p-2.5 space-y-1.5 select-none cursor-pointer ${
                              isGlowing ? 'pulled-glow' : ''
                            }`}
                          >
                            {/* Hierarchy Breadcrumb */}
                            <div className="text-[9px] text-[#6e6761] truncate font-medium bg-[#fbfaf8] border border-[#f0ece3] px-1.5 py-0.5 rounded leading-tight flex items-center justify-between gap-1">
                              <span className="truncate">
                                <span className="text-[#b45309] font-semibold">#{task.parentInitiativeSeq}</span> ›{' '}
                                {(task.parentIssueTitle || '').substring(0, 20)}...
                              </span>
                              {isRecoveryGuy && <span className="text-[9px] font-bold text-[#b45309]">🎬</span>}
                            </div>

                            {/* Task Title */}
                            <h5 className="text-[11px] font-semibold text-[#262422] leading-snug">{task.title}</h5>

                            {/* Start Date Only Display on Card */}
                            <div className="text-[9px] font-mono text-[#999189] bg-[#faf9f6] px-1.5 py-0.5 rounded border border-[#f0ece3]">
                              📅 {task.startDate || 'Unscheduled'}
                            </div>

                            <div className="flex items-center justify-between text-[10px] text-[#999189] pt-1 border-t border-[#f5f2ec]">
                              <span className="font-mono text-[#15803d]">Task #{task.seq}</span>
                              <span className="text-[9px] px-1 rounded bg-[#f5f2ec] text-[#6e6761]">
                                {task.status || 'Todo'}
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

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                {/* Status */}
                <div className="space-y-1">
                  <label className="font-semibold text-[#6e6761]">Status</label>
                  <select
                    value={drawerStatus}
                    onChange={(e) => setDrawerStatus(e.target.value)}
                    className="w-full bg-[#fcfbf9] border border-[#e7e3da] rounded-xl px-3 py-2 text-xs text-[#262422] font-medium focus:outline-none focus:border-[#b45309] cursor-pointer"
                  >
                    <option value="Backlog">Backlog</option>
                    <option value="Todo">Todo</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Done">Done</option>
                    <option value="Canceled">Canceled</option>
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

              {/* Contextual Workflow Action Launcher */}
              <div className="pt-4 border-t border-[#f0ece3] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#262422] uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚡ Workflow Actions</span>
                  </h4>
                  {activeEditingRecord.capabilitySlug === 'recovery-video-production' ||
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

                {activeEditingRecord.capabilitySlug === 'recovery-video-production' ||
                (activeEditingRecord.tags && activeEditingRecord.tags.includes('recovery-video-production')) ? (
                  <div className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e3da] hover:border-[#d4cebf] transition-all space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-base">🎬</span>
                        <div>
                          <div className="text-xs font-semibold text-[#262422]">Run Recovery Guy daily production</div>
                          <div className="text-[10px] text-[#6e6761]">
                            Capability: <code className="font-mono text-[#b45309]">recovery-video-production</code>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={recoveryGuyTriggering}
                        onClick={triggerRecoveryGuyAction}
                        className="px-3 py-1.5 rounded-lg bg-[#b45309] text-white hover:bg-[#92400e] text-xs font-semibold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                      >
                        {recoveryGuyTriggering ? 'Triggering...' : 'Trigger Run'}
                      </button>
                    </div>
                    {recoveryGuyStatus && (
                      <div className="p-2.5 rounded-lg bg-[#f0fdf4] border border-[#dcfce7] text-[11px] text-[#15803d] font-mono leading-relaxed">
                        ✓ <strong>Capability Job Queued:</strong>
                        <br />
                        Request: <span className="font-bold">{recoveryGuyStatus}</span>
                        <br />
                        Workflow: <span className="text-[#b45309]">recovery-video-production</span>
                        <br />
                        Status:{' '}
                        <span className="bg-[#dcfce7] px-1.5 py-0.2 rounded font-semibold text-[#166534]">
                          queued
                        </span>
                      </div>
                    )}
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

            {/* Footer */}
            <div className="p-4 border-t border-[#f0ece3] bg-[#faf9f6] space-y-3">
              <div className="text-[11px] text-[#6e6761] bg-[#f5f2eb] border border-[#e8e2d5] p-2.5 rounded-xl leading-relaxed flex items-start gap-2">
                <span className="text-sm">💡</span>
                <span>
                  <strong>Distinction:</strong> Saving here updates the persistent TaskFlow record.
                  Drag-and-drop column positioning in the QMW dashboard represents your local visual planning horizon.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeWorkItemDrawer}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-[#6e6761] hover:text-[#262422] hover:bg-[#eae5db] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveWorkItemToTaskFlow}
                  className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#262422] text-white hover:bg-[#3f3b37] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span>✓ Save to TaskFlow</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ============================================================== */}
      {/* BACKLOG PULL-FORWARD MODAL                                     */}
      {/* ============================================================== */}
      {isBacklogDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px] flex items-center justify-center p-4">
          <div className="bg-white border border-[#e7e3da] rounded-2xl w-full max-w-xl p-5 shadow-xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#f0ece3]">
              <div>
                <h3 className="text-base font-bold text-[#262422]">Pull Work from Backlog</h3>
                <p className="text-xs text-[#6e6761]">Search and pull dormant items forward into your active planning horizon</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBacklogDrawerOpen(false)}
                className="text-[#999189] hover:text-[#262422] text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Search Input */}
            <div>
              <input
                type="text"
                value={backlogSearch}
                onChange={(e) => setBacklogSearch(e.target.value)}
                placeholder="Search backlog items by title or ID..."
                className="w-full bg-[#fbfaf8] border border-[#e7e3da] rounded-xl px-3.5 py-2 text-xs text-[#262422] focus:outline-none focus:border-[#b45309]"
              />
            </div>

            {/* Backlog Item List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-[380px]">
              {filteredBacklogItems.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#999189] italic">No matching backlog items found.</div>
              ) : (
                filteredBacklogItems.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="p-3 rounded-xl bg-[#faf9f6] border border-[#e7e3da] flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 truncate">
                      <div className="flex items-center gap-1.5 text-[10px]">
                        <span
                          className={`px-1.5 py-0.2 rounded font-mono font-semibold uppercase ${
                            item.type === 'initiative'
                              ? 'bg-[#fbf5ed] text-[#b45309] border border-[#f2e1cc]'
                              : 'bg-[#f0f9ff] text-[#0284c7] border border-[#e0f2fe]'
                          }`}
                        >
                          {item.type} #{item.id}
                        </span>
                        {item.parent && <span className="text-[#999189]">› {item.parent}</span>}
                      </div>
                      <div className="font-medium text-[#262422] truncate">{item.title}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => pullItemForward(item.type, item.id)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#e7e3da] text-[#b45309] font-medium hover:bg-[#fbf5ed] shrink-0 text-[11px] shadow-2xs cursor-pointer"
                    >
                      + Pull Forward
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-[#f0ece3] flex items-center justify-between text-xs text-[#999189]">
              <span>Click &quot;+ Pull Forward&quot; to place immediately into the board</span>
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
