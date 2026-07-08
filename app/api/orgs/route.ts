import { prisma } from "@/lib/db";
import { requireSession, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

/** List organizations the current user belongs to. */
export async function GET() {
  try {
    const { userId } = await requireSession();
    const memberships = await prisma.membership.findMany({
      where: { userId },
      include: { org: { select: { id: true, name: true, slug: true, createdAt: true } } },
      orderBy: { createdAt: "asc" },
    });
    return Response.json({
      orgs: memberships.map((m) => ({ ...m.org, role: m.role })),
    });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}

/** Create a new organization (creator becomes OWNER). */
export async function POST(req: Request) {
  try {
    const { userId } = await requireSession();
    const body = (await req.json().catch(() => ({}))) as { name?: string };
    const name = String(body.name ?? "").trim();
    if (!name) return Response.json({ error: "Organization name is required." }, { status: 400 });

    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "org"}-${Math.random().toString(36).slice(2, 8)}`;

    const org = await prisma.organization.create({
      data: { name, slug, memberships: { create: { userId, role: "OWNER" } } },
    });
    await audit({ orgId: org.id, actorId: userId, action: "org.create", targetType: "org", targetId: org.id, req });
    return Response.json({ org }, { status: 201 });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
