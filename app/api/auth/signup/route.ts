// Registration: creates User + personal Organization + OWNER membership in one
// transaction. (The Credentials provider has no built-in signup flow.)

import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Persona } from "@/lib/generated/prisma/enums";

export const runtime = "nodejs";

// Minimal in-memory rate limit (per IP, 10 signups / 10 min). Good enough for a
// single-host deployment; swap for a shared store when scaling out.
const buckets = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.reset) {
    buckets.set(ip, { count: 1, reset: now + 10 * 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > 10;
}

function slugify(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  return `${base || "org"}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many signups. Try again later." }, { status: 429 });
  }

  let body: { email?: string; password?: string; name?: string; orgName?: string; persona?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const name = String(body.name ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters." }, { status: 400 });
  }
  if (!name) {
    return Response.json({ error: "Enter your name." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return Response.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const orgName = String(body.orgName ?? "").trim() || `${name.split(" ")[0]}'s workspace`;

  // Optional functional role → persona-aware framing (v3 §3).
  const persona =
    body.persona && (Object.values(Persona) as string[]).includes(body.persona)
      ? (body.persona as Persona)
      : null;

  const { user, org } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email, name, passwordHash },
    });
    const org = await tx.organization.create({
      data: {
        name: orgName,
        slug: slugify(orgName),
        memberships: { create: { userId: user.id, role: "OWNER", persona } },
      },
    });
    return { user, org };
  });

  await audit({
    orgId: org.id,
    actorId: user.id,
    action: "auth.signup",
    targetType: "user",
    targetId: user.id,
    metadata: { email },
    req,
  });

  return Response.json({ ok: true, orgId: org.id }, { status: 201 });
}
