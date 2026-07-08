import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

/** List members (any role can see who's in the org). */
export async function GET(_req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "VIEWER");
    const members = await prisma.membership.findMany({
      where: { orgId: oid },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({
      members: members.map((m) => ({
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        image: m.user.image,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
