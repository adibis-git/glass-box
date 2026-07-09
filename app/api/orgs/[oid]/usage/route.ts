// Usage metering endpoint (v3 §17). Members+ can read their org's run/token
// totals, a 14-day breakdown, and a rough Sonnet-rate cost estimate. No LLM.

import { authorize, authzErrorResponse } from "@/lib/authz";
import { getOrgUsage } from "@/lib/usage";

export const runtime = "nodejs";

type Params = { params: Promise<{ oid: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { oid } = await params;
  try {
    await authorize(oid, "MEMBER");
    const usage = await getOrgUsage(oid, 14);
    return Response.json({ usage });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed." }, { status: 500 });
  }
}
