import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

/** Audit log — ADMIN+. Cursor pagination via ?cursor=<id>&action=<prefix>. */
export async function GET(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "ADMIN");
    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const action = url.searchParams.get("action");
    const take = 50;

    const logs = await prisma.auditLog.findMany({
      where: {
        orgId: oid,
        ...(action ? { action: { startsWith: action } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: take + 1,
      ...(cursor ? { cursor: { id: BigInt(cursor) }, skip: 1 } : {}),
    });

    const hasMore = logs.length > take;
    const page = hasMore ? logs.slice(0, take) : logs;

    return Response.json({
      logs: page.map((l) => ({
        id: l.id.toString(),
        actorId: l.actorId,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        metadata: l.metadata,
        ip: l.ip,
        createdAt: l.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1].id.toString() : null,
    });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
