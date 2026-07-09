// Extracted text of a DOCUMENT SourceVersion (v3 §14) — powers the
// click-to-scroll "Source document" panel in the conversation workspace.
// Read-only, VIEWER+. Fail-soft: tabular sources → 400, missing artifacts → 404,
// so the UI can degrade to "no source panel" rather than erroring the page.

import { prisma } from "@/lib/db";
import { authorize, authzErrorResponse } from "@/lib/authz";
import { getStorage } from "@/server/storage";
import { isDocProfile, type DocProfile } from "@/lib/agent/context";

export const runtime = "nodejs";
export const maxDuration = 30;

type Params = { params: Promise<{ oid: string; sid: string }> };

export async function GET(req: Request, { params }: Params) {
  const { oid, sid } = await params;
  try {
    await authorize(oid, "VIEWER");

    const source = await prisma.source.findFirst({
      where: { id: sid, orgId: oid },
      select: { kind: true },
    });
    if (!source) return Response.json({ error: "Source not found." }, { status: 404 });
    if (source.kind !== "DOCUMENT") {
      return Response.json(
        { error: "Extracted text is only available for document sources." },
        { status: 400 },
      );
    }

    const url = new URL(req.url);
    const vParam = url.searchParams.get("version");
    const versionNum = vParam !== null ? Number(vParam) : null;
    if (vParam !== null && !Number.isInteger(versionNum)) {
      return Response.json({ error: "'version' must be an integer." }, { status: 400 });
    }

    // Given version, or the latest ready one.
    const version = await prisma.sourceVersion.findFirst({
      where: {
        sourceId: sid,
        deletedAt: null,
        ...(versionNum !== null ? { version: versionNum } : { status: "READY" }),
      },
      orderBy: { version: "desc" },
      select: { version: true, extractedTextKey: true, storageKey: true, profile: true },
    });
    if (!version) return Response.json({ error: "Version not found." }, { status: 404 });

    const key = version.extractedTextKey ?? version.storageKey;
    let text: string;
    try {
      text = await getStorage().getText(key);
    } catch {
      return Response.json(
        { error: "Extracted text is not available for this version." },
        { status: 404 },
      );
    }

    const sections = isDocProfile(version.profile)
      ? (version.profile as DocProfile).sections
      : [];

    return Response.json({ version: version.version, text, sections });
  } catch (err) {
    return authzErrorResponse(err) ?? Response.json({ error: "Failed to load text." }, { status: 500 });
  }
}
