# Development Continuity Protocol

This workspace uses a lightweight continuity workflow to preserve progress across sessions and prevent redundant exploration.

## Core Rules for All Development Sessions

1. **Read Current State First**:
   - Before searching the codebase or starting investigations, read `.agents/CURRENT_DEV_STATE.md`.
   - Resume directly from the established, verified state. Do not re-investigate or rediscover already verified facts.

2. **Targeted Access & Minimal Search**:
   - Navigate directly to known paths, components, and configs recorded in the state checkpoint.
   - Avoid broad repository, disk, or network searches when paths and symbols are already documented.
   - For genuinely broad, open-ended codebase exploration, delegate to an isolated research subagent.

3. **Avoid Repetition & Course-Correct**:
   - Never repeat completed tests, inspections, or deployments already recorded as verified.
   - If an investigation or search exceeds 2-3 turns without new findings, stop and course-correct.

4. **Status Progression Classification**:
   Always classify development deliverables using standard stages:
   - `CODE COMPLETE`: Code written, integrated, and type-checked locally.
   - `TESTED`: Unit/integration or end-to-end assertions verified.
   - `DEPLOYED`: Artifact built (e.g. Cloud Build) and revision serving (e.g. Cloud Run).
   - `LIVE VERIFIED`: Verified functioning against the live database/production environment.

5. **Update Checkpoint on Session Completion**:
   - Before ending any session involving code changes, configuration updates, or deployments, update `.agents/CURRENT_DEV_STATE.md`.
   - Record the exact stage, verified facts, active constraints, and immediate next action.
