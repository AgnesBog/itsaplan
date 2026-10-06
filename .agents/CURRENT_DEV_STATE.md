# Current Development State

**Last Updated:** 2026-10-06  
**Workspace:** `C:\Users\agnes\Projects\TaskFlowPlan`  
**Active Service:** `https://app.journaltogrow.com`

---

## Infrastructure & Environment Snapshot

- **Monorepo Structure**: Bun + Turborepo
  - Frontend: `apps/web` (Next.js SSR + shadcn/ui)
  - Backend: `apps/api` (Elysia + Drizzle ORM)
  - Packages: `packages/db` (Postgres schema), `packages/auth` (better-auth)
- **Production Host**: Google Cloud Run (`europe-west1`)
  - GCP Project: `taskflow-509812`
  - Web Service: `itsaplan-web` (Live Revision: `itsaplan-web-00013-4cz`, 100% traffic, HTTP 200/307)
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
- **Stage**: `LIVE VERIFIED & USER ACCEPTED` (Revision `itsaplan-web-00011-wmx` & `itsaplan-web-00012-bgs`)
- **Verified Invariants & Semantics**:
  1. **Scoping**: Project context derived strictly from `useShell()`.
  2. **Month → Week Date Propagation**: Moving an Issue to a week column automatically assigns that week's `startDate` to undated child Tasks (`subtasks`) without manufacturing a fake `dueDate`.
  3. **Symmetric Out-of-Month Detection**: Checked and verified symmetrically for earlier and later child task dates.
  4. **Forward-Only Status Progression**: Unstarted child tasks advance when parent moves to In Progress; Done children remain unchanged.
  5. **Issue Drawer Child Tasks Section**: Compact, clickable child tasks list with direct click-to-edit drill-down.

### Mobile New Issue & Subtask Modal Fix — BIOS-71 (`apps/web/src/features/issue/components/create/NewIssueModal.tsx`)
- **Stage**: `DEPLOYED & AWAITING HUMAN MOBILE ACCEPTANCE` (Revision `itsaplan-web-00013-4cz`)
- **Behavioral Invariants**:
  1. **Mobile Form Body**: Wraps Title, Description Editor, and Metadata Select Pills in a vertical scroll container (`overflow-y-auto`).
  2. **Sticky Mobile Action Footer**: Bottom action bar containing the **Create Issue button** (`submit`) is sticky at the bottom on mobile (`sticky bottom-0 z-20 bg-background/95 backdrop-blur-sm border-t`), keeping the primary action permanently visible and reachable without clipping.
  3. **Desktop Layout**: Preserves standard inline flow (`mt-4 flex items-center gap-2 border-t pt-3`) when `fullscreen` is false.

### Phase 1 Production Database Backup & Safety Net
- **Stage**: `LIVE VERIFIED & RESTORE TESTED` (2026-10-06)
- **Mechanism**: [`cloudbuild-backup.yaml`](file:///C:/Users/agnes/Projects/TaskFlowPlan/cloudbuild-backup.yaml) (On-demand PostgreSQL custom-format dump via Cloud Build + Secret Manager + GCS upload).
- **Verified Baseline Artifact**:
  - GCS Path: `gs://taskflow-attachments-509812/backups/taskflow-prod-20261006-115915.dump`
  - Size: 1,067,622 bytes (~1.02 MB, compressed gzip, format `CUSTOM`).
  - Structural Integrity: Verified readable via `pg_restore --list` (1,071 catalog TOC entries).
  - End-to-End Restore Test: `PASS` (Restored into temporary branch `test-restore-20261006` on 2026-10-06; verified 134 tables, 279 issues, 49 initiatives; branch cleaned up immediately).

---

## Known Constraints & Do-Not-Rediscover

- Do NOT mutate or persist pseudo-initiative ID `0` (used for virtual unparented issue containers).
- `BoardIssue` records in `shellProject.issues` derive column status via `shellProject.columns.find(c => c.id === issue.columnId)`, not a top-level `.status` property.
- Headless development runs via Bridge/Agy require `--mode accept-edits`.
- Do not build Executive/Portfolio cross-project QMW views until explicitly requested.
- Neon Free Tier quota allows 0 protected branches (`HTTP 422` on `update_branch(protected: true)`).
- `InitiativeDialog.tsx` mobile layout shares a similar fullscreen clipping structure and is recorded for future remediation.

---

## Immediate Next Action

- Perform human mobile acceptance testing on `https://app.journaltogrow.com` for BIOS-71 (New Issue Modal layout, scrolling content, and sticky Create Issue button reachability).

