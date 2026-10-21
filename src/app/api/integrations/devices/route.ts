import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthContext, hasRole } from "@/lib/auth/context.server";
import {
  createDevice,
  listDevices,
  rotateDeviceSecret,
} from "@/lib/auth/device.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The devices that may push into the platform.
 *
 * A sensor is not a user: it has no session, no role and no way to sign
 * in. It proves itself with a shared secret, and the platform keeps only
 * the secret's hash. This route is where those secrets are made.
 *
 * It is an administrative route, and it says so: giving something the
 * ability to push into the platform is an administrative act, so the
 * caller has to be one. The tenant is the caller's own, taken from the
 * session and never from the request.
 *
 * **A secret is shown once.** The platform stores only its hash, so it
 * cannot show it again. A caller that loses one rotates it, and the old
 * one keeps working for a grace window so the device is not silenced
 * while it is being told.
 */

const CreateSchema = z.object({
  id: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9._-]+$/, "A device id may hold letters, digits, dots, dashes and underscores."),
  label: z.string().min(1).max(120),
  allowedTools: z.array(z.string().min(1).max(120)).max(50).optional(),
});

/** The caller's tenant, or why there is none. */
function denied(reason: string, status = 403) {
  return NextResponse.json({ ok: false, error: reason }, { status });
}

export async function GET() {
  const auth = await getAuthContext();
  if (!auth.authenticated || !auth.tenantId) {
    return denied("UNAUTHENTICATED", 401);
  }

  const devices = await listDevices(auth.tenantId);
  return NextResponse.json(
    { ok: true, devices, count: devices.length },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Create a device. The secret is in the answer, and nowhere else. */
export async function POST(req: Request) {
  const auth = await getAuthContext();
  if (!auth.authenticated || !auth.tenantId) {
    return denied("UNAUTHENTICATED", 401);
  }
  if (!hasRole(auth, "admin")) {
    return denied("ADMIN_REQUIRED");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "INVALID_DEVICE", detail: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const created = await createDevice({
    id: parsed.data.id,
    tenantId: auth.tenantId,
    label: parsed.data.label,
    allowedTools: parsed.data.allowedTools,
  });
  if (!created) {
    return NextResponse.json(
      { ok: false, error: "NO_DATABASE_CONFIGURED" },
      { status: 503 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      device: created,
      detail:
        "The secret is shown once. The platform keeps only its hash, so it cannot show it again — if you lose it, rotate.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}

/** Rotate a device's secret. */
export async function PUT(req: Request) {
  const auth = await getAuthContext();
  if (!auth.authenticated || !auth.tenantId) {
    return denied("UNAUTHENTICATED", 401);
  }
  if (!hasRole(auth, "admin")) {
    return denied("ADMIN_REQUIRED");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Send a JSON body." }, { status: 400 });
  }

  const id = (body as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) {
    return NextResponse.json(
      { ok: false, error: "Say which device to rotate." },
      { status: 400 },
    );
  }

  const rotated = await rotateDeviceSecret(id, auth.tenantId);
  if (!rotated) {
    return NextResponse.json(
      { ok: false, error: "DEVICE_NOT_FOUND" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      device: rotated,
      detail:
        "The new secret is shown once. The previous one keeps working until the grace window ends, so the device is not silenced while it is being told.",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
