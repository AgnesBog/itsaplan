import {
  db,
  capability,
  capabilityInvocation,
  team,
  teamMember,
  type Capability,
  type CapabilityInvocation,
} from '@repo/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { HttpError, iso } from '#shared/lib';
import { createComment } from '#modules/issues/activity';

export function mapCapability(row: Capability) {
  return {
    id: row.id,
    teamId: row.teamId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    executionType: row.executionType,
    brandRestrictionId: row.brandRestrictionId,
    executionConfig: (row.executionConfig ?? {}) as Record<string, unknown>,
    inputSchema: (row.inputSchema ?? {}) as Record<string, unknown>,
    timeoutSeconds: row.timeoutSeconds,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function mapInvocation(row: CapabilityInvocation, capabilitySlug?: string) {
  return {
    id: row.id,
    requestId: row.requestId,
    capabilityId: row.capabilityId,
    capabilitySlug: capabilitySlug ?? undefined,
    teamId: row.teamId,
    issueId: row.issueId,
    brandId: row.brandId,
    status: row.status as 'queued' | 'running' | 'ready_for_approval' | 'completed' | 'partial' | 'failed',
    exitCode: row.exitCode,
    message: row.message,
    reviewUrl: row.reviewUrl,
    inputPayload: (row.inputPayload ?? {}) as Record<string, unknown>,
    outputPayload: (row.outputPayload ?? {}) as Record<string, unknown>,
    error: row.error,
    leaseExpiresAt: row.leaseExpiresAt ? iso(row.leaseExpiresAt) : null,
    lastHeartbeatAt: row.lastHeartbeatAt ? iso(row.lastHeartbeatAt) : null,
    startedAt: row.startedAt ? iso(row.startedAt) : null,
    finishedAt: row.finishedAt ? iso(row.finishedAt) : null,
    attempts: row.attempts,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export async function getDefaultTeamId(userId: string): Promise<number> {
  const memberRows = await db
    .select({ teamId: teamMember.teamId })
    .from(teamMember)
    .where(eq(teamMember.userId, userId))
    .limit(1);
  if (memberRows[0]?.teamId) return memberRows[0].teamId;

  const teamRows = await db.select({ id: team.id }).from(team).limit(1);
  if (teamRows[0]?.id) return teamRows[0].id;

  throw new HttpError(400, 'No team found for user');
}

export async function listCapabilities(teamId: number) {
  const rows = await db
    .select()
    .from(capability)
    .where(eq(capability.teamId, teamId))
    .orderBy(desc(capability.createdAt));
  return rows.map(mapCapability);
}

export async function getCapabilityBySlug(teamId: number, slug: string) {
  const rows = await db
    .select()
    .from(capability)
    .where(and(eq(capability.teamId, teamId), eq(capability.slug, slug)))
    .limit(1);
  const row = rows[0];
  return row ? mapCapability(row) : null;
}

export async function createCapability(
  teamId: number,
  input: {
    id?: string;
    slug: string;
    name: string;
    description?: string;
    executionType: 'local_runner' | 'cloud_http' | 'ai_agent';
    brandRestrictionId?: string | null;
    executionConfig?: Record<string, unknown>;
    inputSchema?: Record<string, unknown>;
    timeoutSeconds?: number;
  },
) {
  const id = input.id || input.slug;
  const [row] = await db
    .insert(capability)
    .values({
      id,
      teamId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      executionType: input.executionType,
      brandRestrictionId: input.brandRestrictionId,
      executionConfig: input.executionConfig ?? {},
      inputSchema: input.inputSchema ?? {},
      timeoutSeconds: input.timeoutSeconds ?? 3600,
    })
    .onConflictDoUpdate({
      target: [capability.teamId, capability.slug],
      set: {
        name: input.name,
        description: input.description,
        executionType: input.executionType,
        brandRestrictionId: input.brandRestrictionId,
        executionConfig: input.executionConfig ?? {},
        inputSchema: input.inputSchema ?? {},
        timeoutSeconds: input.timeoutSeconds ?? 3600,
        updatedAt: new Date(),
      },
    })
    .returning();
  return mapCapability(row);
}

export async function invokeCapability(
  teamId: number,
  input: {
    capabilitySlug: string;
    requestId?: string;
    issueId?: number | null;
    brandId?: string | null;
    inputPayload?: Record<string, unknown>;
  },
  userId?: string | null,
) {
  const cap = await getCapabilityBySlug(teamId, input.capabilitySlug);
  if (!cap) {
    throw new HttpError(404, `Capability '${input.capabilitySlug}' not found`);
  }

  if (cap.brandRestrictionId && input.brandId && cap.brandRestrictionId !== input.brandId) {
    throw new HttpError(
      400,
      `Capability '${cap.slug}' is restricted to brand '${cap.brandRestrictionId}'`,
    );
  }

  const effectiveBrandId = input.brandId || cap.brandRestrictionId || null;
  const requestId =
    input.requestId ||
    `req_${cap.slug.slice(0, 10)}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  const [row] = await db
    .insert(capabilityInvocation)
    .values({
      requestId,
      capabilityId: cap.id,
      teamId,
      issueId: input.issueId ?? null,
      brandId: effectiveBrandId,
      status: 'queued',
      inputPayload: input.inputPayload ?? {},
      outputPayload: {},
      attempts: 0,
    })
    .returning();

  if (input.issueId) {
    try {
      await createComment({
        issueId: input.issueId,
        actorUserId: userId ?? null,
        body: `Triggered capability **${cap.name}** (\`${cap.slug}\`). Request ID: \`${requestId}\``,
      });
    } catch (err) {
      console.warn(`[capabilities] could not post comment to issue ${input.issueId}:`, err);
    }
  }

  return mapInvocation(row, cap.slug);
}

export async function claimRunnerJob(teamId: number, leaseSeconds = 300) {
  const leaseSecs = Math.max(30, Math.min(3600, leaseSeconds));
  const rows = await db.execute(sql`
    UPDATE capability_invocation ci
    SET attempts = ci.attempts + 1,
        status = 'running',
        started_at = COALESCE(ci.started_at, now()),
        last_heartbeat_at = now(),
        lease_expires_at = now() + make_interval(secs => ${leaseSecs}),
        updated_at = now()
    WHERE ci.id = (
      SELECT q.id FROM capability_invocation q
      JOIN capability c ON c.id = q.capability_id
      WHERE q.team_id = ${teamId}
        AND c.execution_type = 'local_runner'
        AND (
          (q.status = 'queued' AND (q.lease_expires_at IS NULL OR q.lease_expires_at <= now()))
          OR
          (q.status = 'running' AND q.lease_expires_at <= now())
        )
        AND q.attempts < 5
      ORDER BY q.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING
      ci.id,
      ci.request_id AS "requestId",
      ci.capability_id AS "capabilityId",
      (SELECT c.slug FROM capability c WHERE c.id = ci.capability_id) AS "capabilitySlug",
      (SELECT c.name FROM capability c WHERE c.id = ci.capability_id) AS "capabilityName",
      (SELECT c.execution_type FROM capability c WHERE c.id = ci.capability_id) AS "executionType",
      (SELECT c.execution_config FROM capability c WHERE c.id = ci.capability_id) AS "executionConfig",
      ci.input_payload AS "inputPayload",
      ci.brand_id AS "brandId",
      ci.issue_id AS "issueId",
      ci.attempts,
      ci.lease_expires_at AS "leaseExpiresAt"
  `);

  const row = (rows as unknown as any[])[0];
  if (!row) return null;

  return {
    id: Number(row.id),
    requestId: String(row.requestId),
    capabilityId: String(row.capabilityId),
    capabilitySlug: String(row.capabilitySlug),
    capabilityName: String(row.capabilityName),
    executionType: String(row.executionType),
    executionConfig: (row.executionConfig ?? {}) as Record<string, unknown>,
    inputPayload: (row.inputPayload ?? {}) as Record<string, unknown>,
    brandId: row.brandId ? String(row.brandId) : null,
    issueId: row.issueId ? Number(row.issueId) : null,
    attempts: Number(row.attempts),
    leaseExpiresAt: new Date(row.leaseExpiresAt).toISOString(),
  };
}

export async function heartbeatRunnerJob(
  teamId: number,
  invocationId: number,
  leaseSeconds = 300,
): Promise<boolean> {
  const leaseSecs = Math.max(30, Math.min(3600, leaseSeconds));
  const rows = await db.execute(sql`
    UPDATE capability_invocation
    SET last_heartbeat_at = now(),
        lease_expires_at = now() + make_interval(secs => ${leaseSecs}),
        updated_at = now()
    WHERE id = ${invocationId}
      AND team_id = ${teamId}
      AND status = 'running'
    RETURNING id
  `);
  return (rows as unknown as any[]).length > 0;
}

export async function updateRunnerStatus(
  teamId: number,
  invocationId: number,
  data: {
    status: 'queued' | 'running' | 'ready_for_approval' | 'completed' | 'partial' | 'failed';
    exitCode?: number | null;
    message?: string | null;
    reviewUrl?: string | null;
    outputPayload?: Record<string, unknown>;
    error?: string | null;
  },
  userId?: string | null,
) {
  const isTerminal = data.status === 'completed' || data.status === 'failed';
  const finishedAtExpr = isTerminal ? sql`now()` : undefined;

  const [row] = await db
    .update(capabilityInvocation)
    .set({
      status: data.status,
      exitCode: data.exitCode ?? undefined,
      message: data.message ?? undefined,
      reviewUrl: data.reviewUrl ?? undefined,
      outputPayload: data.outputPayload ?? undefined,
      error: data.error ?? undefined,
      finishedAt: finishedAtExpr,
      updatedAt: new Date(),
    })
    .where(and(eq(capabilityInvocation.id, invocationId), eq(capabilityInvocation.teamId, teamId)))
    .returning();

  if (!row) return null;

  if (row.issueId) {
    try {
      let commentText = `**Capability Update**: \`${data.status}\``;
      if (data.message) commentText += `\n${data.message}`;
      if (data.reviewUrl) commentText += `\n\n[Open Approval Dashboard](${data.reviewUrl})`;
      if (data.error) commentText += `\n\n**Error**: ${data.error}`;

      await createComment({
        issueId: row.issueId,
        actorUserId: userId ?? null,
        body: commentText,
      });
    } catch (err) {
      console.warn(`[capabilities] could not post comment to issue ${row.issueId}:`, err);
    }
  }

  const cap = await db
    .select({ slug: capability.slug })
    .from(capability)
    .where(eq(capability.id, row.capabilityId))
    .limit(1);

  return mapInvocation(row, cap[0]?.slug);
}

export async function getInvocationByRequestId(teamId: number, requestId: string) {
  const rows = await db
    .select()
    .from(capabilityInvocation)
    .where(and(eq(capabilityInvocation.teamId, teamId), eq(capabilityInvocation.requestId, requestId)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const cap = await db
    .select({ slug: capability.slug })
    .from(capability)
    .where(eq(capability.id, row.capabilityId))
    .limit(1);

  return mapInvocation(row, cap[0]?.slug);
}
