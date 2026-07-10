// Admin-only: update a captured lead's status from the /app/admin/leads inbox.
// Leads are global (they come from the anonymous marketing site), so this gates on
// the caller being an OWNER/ADMIN of ANY workspace rather than an org-scoped check.

import { prisma } from "@/lib/db";
import { requireSession, authzErrorResponse } from "@/lib/authz";
import { isPlatformAdmin } from "@/lib/platformAdmin";
import type { LeadStatus } from "@/lib/generated/prisma/client";

export const runtime = "nodejs";

const STATUSES = new Set<LeadStatus>(["NEW", "CONTACTED", "QUALIFIED", "CLOSED"]);

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }

  if (!isPlatformAdmin(session.email)) {
    return Response.json({ error: "Platform admin access required." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { status?: string };
  const status = String(body.status ?? "").toUpperCase();
  if (!STATUSES.has(status as LeadStatus)) {
    return Response.json({ error: "Invalid status." }, { status: 400 });
  }

  const updated = await prisma.lead
    .update({ where: { id }, data: { status: status as LeadStatus } })
    .catch(() => null);
  if (!updated) return Response.json({ error: "Lead not found." }, { status: 404 });

  return Response.json({ ok: true, status: updated.status });
}
