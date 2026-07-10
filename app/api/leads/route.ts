// Public lead capture from the marketing site (Book-a-demo / Contact). Stores the
// Lead in-DB for review in /app/admin/leads. There is NO external sending — this is
// a self-hosted lead inbox, in keeping with the "your data stays on your infra" wedge.

import { prisma } from "@/lib/db";

export const runtime = "nodejs";

// Minimal in-memory rate limit (per IP, 5 submissions / 10 min) — mirrors the
// signup route. Good enough for a single-host deployment.
const buckets = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now > b.reset) {
    buckets.set(ip, { count: 1, reset: now + 10 * 60_000 });
    return false;
  }
  b.count += 1;
  return b.count > 5;
}

const SOURCES = new Set(["demo", "pricing", "landing", "contact", "use-cases", "how-it-works"]);

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  let body: {
    name?: string;
    email?: string;
    company?: string;
    role?: string;
    message?: string;
    source?: string;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 120);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  if (!name) return Response.json({ error: "Please enter your name." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Please enter a valid work email." }, { status: 400 });
  }

  const source = SOURCES.has(String(body.source)) ? String(body.source) : "landing";

  await prisma.lead.create({
    data: {
      name,
      email,
      company: body.company ? String(body.company).trim().slice(0, 160) : null,
      role: body.role ? String(body.role).trim().slice(0, 120) : null,
      message: body.message ? String(body.message).trim().slice(0, 4000) : null,
      source,
      ip: ip.slice(0, 64),
      userAgent: (req.headers.get("user-agent") ?? "").slice(0, 256) || null,
    },
  });

  return Response.json({ ok: true });
}
