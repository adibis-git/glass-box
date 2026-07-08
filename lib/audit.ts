// Audit trail helper — one call per security-relevant action.
// actorId null = system (retention cron, automated purges).

import { prisma } from "@/lib/db";

export interface AuditInput {
  orgId: string;
  actorId?: string | null;
  action: string; // e.g. "dataset.upload", "member.role_change"
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  req?: Request;
}

function clientMeta(req?: Request): { ip?: string; userAgent?: string } {
  if (!req) return {};
  const fwd = req.headers.get("x-forwarded-for");
  return {
    ip: fwd ? fwd.split(",")[0].trim() : undefined,
    userAgent: req.headers.get("user-agent") ?? undefined,
  };
}

/** Fire-and-forget-safe: audit failures are logged, never break the request. */
export async function audit(input: AuditInput): Promise<void> {
  const { ip, userAgent } = clientMeta(input.req);
  try {
    await prisma.auditLog.create({
      data: {
        orgId: input.orgId,
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        metadata: input.metadata as object | undefined,
        ip,
        userAgent,
      },
    });
  } catch (err) {
    console.error("[audit] write failed:", err);
  }
}
