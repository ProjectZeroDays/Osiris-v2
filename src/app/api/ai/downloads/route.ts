import { NextResponse } from "next/server";
import {
  startDownload,
  listDownloads,
  listInstalledModels,
  removeModel,
} from "@/lib/ai/model-download.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The model download manager's HTTP surface.
 *
 * A download starts, and the list shows what is running and what is
 * already on disk. The host is checked in the manager; this route does
 * not have to know the allowlist.
 */

export async function GET() {
  const [jobs, installed] = await Promise.all([
    Promise.resolve(listDownloads()),
    listInstalledModels(),
  ]);
  return NextResponse.json(
    { jobs, installed },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const p = body as { url?: string; filename?: string; action?: string };

  if (p?.action === "remove") {
    if (!p.filename) {
      return NextResponse.json({ error: "Name the file to remove." }, { status: 400 });
    }
    const removed = await removeModel(p.filename);
    return NextResponse.json({ ok: removed }, { status: removed ? 200 : 404 });
  }

  if (!p?.url || !p?.filename) {
    return NextResponse.json(
      { error: "A download needs a URL and a filename." },
      { status: 400 },
    );
  }

  try {
    const job = await startDownload(p.url, p.filename);
    return NextResponse.json({ ok: true, job }, { status: 202 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "DOWNLOAD_FAILED";
    return NextResponse.json(
      { error: message },
      { status: message.includes("NOT_ALLOWED") || message.includes("INVALID") ? 400 : 502 },
    );
  }
}
