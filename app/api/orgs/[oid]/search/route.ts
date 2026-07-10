import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

/** Global search across the active org — conversations, datasets, and members.
 * Any member can search; results are always scoped to `oid`. */
export async function GET(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "MEMBER");

    const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return Response.json({ conversations: [], datasets: [], members: [] });
    }

    const [conversations, sources, memberships] = await Promise.all([
      prisma.conversation.findMany({
        where: { orgId: oid, title: { contains: q, mode: "insensitive" } },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true },
        take: 6,
      }),
      prisma.source.findMany({
        where: { orgId: oid, name: { contains: q, mode: "insensitive" } },
        orderBy: { createdAt: "desc" },
        select: { id: true, name: true, kind: true },
        take: 6,
      }),
      prisma.membership.findMany({
        where: {
          orgId: oid,
          user: {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
        },
        orderBy: { createdAt: "asc" },
        include: { user: { select: { id: true, name: true, email: true } } },
        take: 6,
      }),
    ]);

    return Response.json({
      conversations: conversations.map((c) => ({ id: c.id, title: c.title })),
      datasets: sources.map((s) => ({ id: s.id, name: s.name, kind: s.kind })),
      members: memberships.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
