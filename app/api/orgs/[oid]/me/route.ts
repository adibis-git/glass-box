// The caller's own membership settings — currently the persona used for
// persona-aware framing (v3 §3). Any member can set their own persona.

import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { audit } from "@/lib/audit";
import { Persona } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

/** Update the caller's own Membership.persona (MEMBER+). Null clears it. */
export async function PATCH(req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    const ctx = await authorize(oid, "MEMBER");

    const body = (await req.json().catch(() => ({}))) as { persona?: string | null };
    if (body.persona === undefined) {
      return Response.json({ error: "Nothing to update." }, { status: 400 });
    }
    let persona: Persona | null = null;
    if (body.persona !== null) {
      if (!(Object.values(Persona) as string[]).includes(body.persona)) {
        return Response.json({ error: "Invalid role." }, { status: 400 });
      }
      persona = body.persona as Persona;
    }

    await prisma.membership.update({
      where: { userId_orgId: { userId: ctx.userId, orgId: oid } },
      data: { persona },
    });
    await audit({
      orgId: oid, actorId: ctx.userId, action: "member.persona_change",
      targetType: "user", targetId: ctx.userId,
      metadata: { persona }, req,
    });
    return Response.json({ ok: true, persona });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
