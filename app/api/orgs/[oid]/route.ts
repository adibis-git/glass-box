import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

/** Rename org / update retention (OWNER; retention also allowed for ADMIN). */
export async function PATCH(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      retentionDays?: number | null;
      domain?: string | null;
      vertical?: string | null;
    };

    const wantsRename = body.name !== undefined;
    const ctx = await authorize(oid, wantsRename ? "OWNER" : "ADMIN");

    const data: {
      name?: string;
      retentionDays?: number | null;
      domain?: string | null;
      vertical?: string | null;
    } = {};
    if (wantsRename) {
      const name = String(body.name ?? "").trim();
      if (!name) return Response.json({ error: "Name cannot be empty." }, { status: 400 });
      data.name = name;
    }
    if (body.retentionDays !== undefined) {
      if (body.retentionDays !== null && (!Number.isInteger(body.retentionDays) || body.retentionDays < 1)) {
        return Response.json({ error: "retentionDays must be a positive integer or null." }, { status: 400 });
      }
      data.retentionDays = body.retentionDays;
    }
    // Workspace framing (v3 §3) — ADMIN+ (covered by the authorize above).
    if (body.domain !== undefined) {
      const domain = String(body.domain ?? "").trim();
      data.domain = domain || null;
    }
    if (body.vertical !== undefined) {
      const vertical = String(body.vertical ?? "").trim();
      data.vertical = vertical || null;
    }

    const org = await prisma.organization.update({ where: { id: oid }, data });
    await audit({
      orgId: oid, actorId: ctx.userId, action: "org.update",
      targetType: "org", targetId: oid, metadata: data as Record<string, unknown>, req,
    });
    return Response.json({ org });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Delete org — OWNER only. Cascades all rows; storage purge handled separately. */
export async function DELETE(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const ctx = await authorize(oid, "OWNER");
    // Collect storage keys BEFORE the cascade wipes the rows.
    const datasets = await prisma.dataset.findMany({
      where: { orgId: oid },
      select: { storageKey: true, originalStorageKey: true },
    });
    await prisma.organization.delete({ where: { id: oid } });

    // Best-effort storage cleanup (import lazily to keep the route light).
    const { getStorage } = await import("@/server/storage");
    const storage = getStorage();
    for (const d of datasets) {
      await storage.delete(d.storageKey).catch(() => {});
      if (d.originalStorageKey) await storage.delete(d.originalStorageKey).catch(() => {});
    }

    console.log(`[org.delete] org=${oid} by=${ctx.userId} datasets=${datasets.length}`);
    return Response.json({ ok: true });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
