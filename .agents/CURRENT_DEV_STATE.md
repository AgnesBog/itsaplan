# Current Development State

**Last Updated:** 2026-10-06  
**Workspace:** `C:\Users\agnes\.gemini\antigravity\scratch\TaskFlowPlan`  
**Active Service:** `https://app.journaltogrow.com`

---

## Infrastructure & Environment Snapshot

- **Monorepo Structure**: Bun + Turborepo
  - Frontend: `apps/web` (Next.js SSR + shadcn/ui)
  - Backend: `apps/api` (Elysia + Drizzle ORM)
  - Packages: `packages/db` (Postgres schema), `packages/auth` (better-auth)
- **Production Host**: Google Cloud Run (`europe-west1`)
  - GCP Project: `taskflow-509812`
  - Web Service: `itsaplan-web` (Live Revision: `itsaplan-web-00011-wmx`, 100% traffic, HTTP 200/307)
  - API Service: `itsaplan-api` (Live Revision: `itsaplan-api-00006-62n`, 100% traffic)
  - Deployment Pipeline: `cloudbuild-web.yaml` / `cloudbuild.yaml`
- **Database**: Neon Serverless Postgres
  - Project: `taskflowplan` (`fragrant-hill-27768056`, region `aws-eu-central-1`)
  - Active Branch: `production` (`br-bold-darkness-b2w8yvqa`, size: 44.2 MB)
  - PITR Retention: 21,600s (6 hours)
  - Branch Protection: `false` (Neon free tier quota: 0 protected branches)
  - Snapshots/Schedules: None configured
- **Object Storage**: Google Cloud Storage (S3-compatible XML API)
  - Bucket: `gs://taskflow-attachments-509812` (Region `europe-west3`)
  - Soft Delete: Enabled (7 days retention / 604,800s)
  - Object Versioning: Disabled

---

## Verified Deliverables

### Project-Level QMW Planner (`apps/web/src/features/qmw/QmwPlannerPage.tsx`)
- **Stage**: `DEPLOYED & READY FOR LIVE ACCEPTANCE` (Revision `itsaplan-web-00011-wmx`)
- **Verified Invariants & Semantics**:
  1. **Scoping**: Project context derived strictly from `useShell()`. Hardcoded dropdowns and static fallback data removed.
  2. **Month → Week Date Propagation**: Moving an Issue to a week column automatically assigns that week's `startDate` to undated child Tasks (`subtasks`) without manufacturing a fake `dueDate`, while preserving intentionally scheduled child tasks.
  3. **Symmetric Out-of-Month Detection**:
     - Issues with 0 child tasks display: `⚠ No tasks — won’t appear in Weekly planning`.
     - Issues with child tasks scheduled outside the parent issue's month (either earlier OR later) display: `⚠ X child tasks scheduled outside this month`.
     - Issues marked Done that still have open child tasks display: `⚠ Done issue has X open tasks`.
  4. **Forward-Only Status Progression**:
     - When parent Issue advances to In Progress, unstarted/backlog child tasks advance to In Progress in UI and DB state.
     - Never moves children backward; preserves Done and Canceled children.
     - Does NOT automatically mark unfinished child tasks as Done when parent issue is marked Done, preserving true task state.
  5. **Issue Drawer Child Tasks Section**:
     - Compact, clickable Tasks section inside the Issue side drawer showing Task #seq, recurring badge, title, status badge, and Done indicator.
     - Direct click-to-edit drill-down replaces drawer content with the selected child task.
  6. **Mobile Accessibility**:
     - Sticky drawer action footer (`Cancel` / `✓ Save to TaskFlow`) with touch-friendly targets.
  7. **Persistence & Date Contracts**:
     - Uses `YYYY-MM-DD` / `null` format with `dueDate >= startDate` ordering and optimistic rollback.

### Phase 1 Production Database Backup & Safety Net
- **Stage**: `LIVE VERIFIED` (2026-10-06)
- **Mechanism**: [`cloudbuild-backup.yaml`](file:///C:/Users/agnes/.gemini/antigravity/scratch/TaskFlowPlan/cloudbuild-backup.yaml) (On-demand PostgreSQL custom-format dump via Cloud Build + Secret Manager + GCS upload).
- **Verified Baseline Artifact**:
  - GCS Path: `gs://taskflow-attachments-509812/backups/taskflow-prod-20261006-115915.dump`
  - Size: 1,067,622 bytes (~1.02 MB, compressed gzip, format `CUSTOM`).
  - Structural Integrity: Verified readable via `pg_restore --list` (1,071 catalog TOC entries).
  - Security: Connection string injected dynamically from GCP Secret Manager (`neon-database-url`).

---

## Backup & Disaster-Recovery Audit

- **Stage**: `AUDITED & PHASE 1 BASELINE ESTABLISHED` (2026-10-06)
- **Verified Protection**:
  - Neon PITR history retention: 6 hours (`history_retention_seconds: 21600`).
  - GCS Object Soft Delete: 7 days (`retentionDurationSeconds: 604800`).
  - Independent Baseline Backup: Live in `gs://taskflow-attachments-509812/backups/` extending recovery horizon indefinitely.
- **Known Plan Constraints**:
  - Neon Free tier quota allows 0 protected branches (`HTTP 422` on `update_branch(protected: true)`).
  - On-demand backup mechanism available via `cloudbuild-backup.yaml` before running database-affecting changes.

---

## Known Constraints & Do-Not-Rediscover

- Do NOT mutate or persist pseudo-initiative ID `0` (used for virtual unparented issue containers).
- `BoardIssue` records in `shellProject.issues` derive column status via `shellProject.columns.find(c => c.id === issue.columnId)`, not a top-level `.status` property.
- Headless development runs via Bridge/Agy require `--mode accept-edits`.
- Do not build Executive/Portfolio cross-project QMW views until explicitly requested.
- Neon Free Tier quota allows 0 protected branches (`HTTP 422` on `update_branch(protected: true)`).

---

## Immediate Next Action

- Perform live acceptance testing on the deployed revision `itsaplan-web-00011-wmx` for symmetric out-of-month warnings, Issue → child task status progression, and the Issue drawer Tasks section.
