import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The sensor push.
 *
 * A box on a rooftop proves itself with a shared secret, and the push
 * is the one path a sensor has. It was broken: the route validated the
 * array inside the body against a schema shaped as an object holding that
 * array, so every Remote ID and Flock push was refused as invalid before
 * it was read.
 *
 * Nothing tested the route, which is why it stayed broken. These tests
 * drive it end to end: a device is created, it pushes, and the push is
 * accepted.
 *
 * They need a database.
 */

const DATABASE_URL =
  process.env.OSIRIS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL);

if (DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

const describeDb = hasDatabase ? describe : describe.skip;

describeDb("the sensor push", () => {
  const tenant = "t-push-test";

  let route: typeof import("../ingest/route");
  let device: typeof import("@/lib/auth/device.server");
  let db: typeof import("@/db/client.server");
  let schema: typeof import("@/db/schema");
  let quota: typeof import("@/lib/integrations/quota.server");

  const secrets = new Map<string, string>();

  beforeAll(async () => {
    route = await import("../ingest/route");
    device = await import("@/lib/auth/device.server");
    db = await import("@/db/client.server");
    schema = await import("@/db/schema");
    // The quota module reaches the database client, and the client reads
    // DATABASE_URL when it is first loaded — so it has to be imported
    // after the variable is set, not at the top of the file.
    quota = await import("@/lib/integrations/quota.server");
  });

  afterAll(async () => {
    const client = db?.getDb();
    if (!client) return;
    // Three tables, not one: the device's credentials, the camera it
    // was, and the drone it saw. Leaving the entity rows behind would
    // make the next run's observation count start where this one ended.
    for (const id of [tenant]) {
      await client
        .delete(schema.surveillanceDevices)
        .where(eq(schema.surveillanceDevices.tenantId, id))
        .catch(() => undefined);
      await client
        .delete(schema.drones)
        .where(eq(schema.drones.tenantId, id))
        .catch(() => undefined);
      await client
        .delete(schema.findings)
        .where(eq(schema.findings.tenantId, id))
        .catch(() => undefined);
      await client
        .delete(schema.devices)
        .where(eq(schema.devices.tenantId, id))
        .catch(() => undefined);
      await client
        .delete(schema.tenants)
        .where(eq(schema.tenants.id, id))
        .catch(() => undefined);
    }
  });

  /** A device of this tenant, with a secret to present. */
  async function makeDevice(id: string, allowedTools: string[]) {
    await db
      .getDb()!
      .insert(schema.tenants)
      .values({ id: tenant, name: "Push" })
      .onConflictDoNothing();
    const created = await device.createDevice({
      id,
      tenantId: tenant,
      label: id,
      allowedTools,
    });
    secrets.set(id, created!.secret);
    return created!.secret;
  }

  /** A push from a device. */
  const push = (id: string, body: unknown, secret?: string) =>
    route.POST(
      new Request("http://localhost/api/integrations/ingest", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-OSIRIS-Device": `${id}:${secret ?? secrets.get(id) ?? ""}`,
        },
        body: JSON.stringify(body),
      }),
    );

  it("refuses a push with no device at all", async () => {
    const res = await route.POST(
      new Request("http://localhost/api/integrations/ingest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "remote-id", frames: [] }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("refuses a push with the wrong secret", async () => {
    await makeDevice("push-1", ["esp32-drone-rid"]);
    const res = await push(
      "push-1",
      { kind: "remote-id", frames: [] },
      "not-the-secret",
    );
    expect(res.status).toBe(401);
  });

  it("accepts a Remote ID frame", async () => {
    // The bug this covers: the route validated the array inside the body
    // against a schema shaped as an object holding that array, so every
    // push was refused as invalid.
    await makeDevice("push-2", ["esp32-drone-rid"]);
    const res = await push("push-2", {
      kind: "remote-id",
      frames: [
        {
          uasId: "drone-1",
          sourceDevice: "push-2",
          rssi: -60,
          drone: { lat: 30.2672, lon: -97.7431, altM: 120 },
          operator: { lat: 30.1, lon: -97.6 },
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBeGreaterThan(0);
  });

  it("accepts a Flock detection", async () => {
    // The same bug, on the other path that had it.
    await makeDevice("push-3", ["flock-detector"]);
    const res = await push("push-3", {
      kind: "flock",
      detections: [
        {
          mac: "aa:bb:cc:dd:ee:ff",
          method: "wifi",
          rssi: -70,
          sourceDevice: "push-3",
          gps: { lat: 30.2672, lon: -97.7431 },
          count: 3,
        },
      ],
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("refuses a device that may not push for that tool", async () => {
    // The device chooses the kind; the record decides whether it is
    // allowed to.
    await makeDevice("push-4", ["flock-detector"]);
    const res = await push("push-4", { kind: "remote-id", frames: [] });
    expect(res.status).toBe(403);
  });

  it("refuses a push of a kind it does not know", async () => {
    await makeDevice("push-5", ["esp32-drone-rid"]);
    const res = await push("push-5", { kind: "not-a-kind", frames: [] });
    expect(res.status).toBe(400);
  });

  it("refuses a frame that does not match the schema", async () => {
    // The validation is still there: it is the shape that was wrong, not
    // the checking.
    await makeDevice("push-6", ["esp32-drone-rid"]);
    const res = await push("push-6", {
      kind: "remote-id",
      frames: [{ uasId: "", sourceDevice: "push-6" }],
    });
    expect(res.status).toBe(400);
  });

  it("keeps a device's findings in its own tenant", async () => {
    // The device never chooses its tenant; that comes from the device
    // record, so a compromised device cannot write into another tenant.
    await makeDevice("push-7", ["esp32-drone-rid"]);
    await push("push-7", {
      kind: "remote-id",
      frames: [
        {
          uasId: "drone-7",
          sourceDevice: "push-7",
          drone: { lat: 30.2672, lon: -97.7431 },
        },
      ],
    });

    const client = db.getDb()!;
    const rows = await client
      .select()
      .from(schema.findings)
      .where(eq(schema.findings.tenantId, tenant));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.tenantId).toBe(tenant);
    }
  });

  it("records the camera as a thing, not only as a sighting", async () => {
    // A camera seen once is a guess; a camera seen a hundred times is
    // still a guess, but it is one guess and a hundred sightings, and
    // the count is the interesting part. The finding is the moment; the
    // device row is the camera.
    await makeDevice("push-8", ["flock-detector"]);
    const detection = {
      kind: "flock",
      detections: [
        {
          mac: "bb:cc:dd:ee:ff:00",
          method: "wifi",
          rssi: -70,
          sourceDevice: "push-8",
          gps: { lat: 30.2672, lon: -97.7431 },
        },
      ],
    };

    // The row is cleared first, so the count is this test's and not
    // whatever a previous run left behind.
    const client = db.getDb()!;
    await client
      .delete(schema.surveillanceDevices)
      .where(eq(schema.surveillanceDevices.id, "flock:bb:cc:dd:ee:ff:00"))
      .catch(() => undefined);

    await push("push-8", detection);
    await push("push-8", detection);

    const rows = await client
      .select()
      .from(schema.surveillanceDevices)
      .where(eq(schema.surveillanceDevices.id, "flock:bb:cc:dd:ee:ff:00"));

    expect(rows).toHaveLength(1);
    expect(rows[0].observations).toBe(2);
    expect(rows[0].tenantId).toBe(tenant);
    expect(rows[0].firstSeen).toBeInstanceOf(Date);
    expect(rows[0].lastSeen).toBeInstanceOf(Date);
  });

  it("records the drone, with its last known position", async () => {
    await makeDevice("push-9", ["esp32-drone-rid"]);
    await push("push-9", {
      kind: "remote-id",
      frames: [
        {
          uasId: "drone-9",
          sourceDevice: "push-9",
          drone: { lat: 30.2672, lon: -97.7431, altM: 120 },
        },
      ],
    });

    const client = db.getDb()!;
    const rows = await client
      .select()
      .from(schema.drones)
      .where(eq(schema.drones.id, "rid:drone-9"));

    expect(rows).toHaveLength(1);
    expect(rows[0].uasId).toBe("drone-9");
    expect(rows[0].tenantId).toBe(tenant);
    expect(rows[0].lat).toBeCloseTo(30.2672);
    expect(rows[0].altM).toBe(120);
  });

  it("refuses a device that pushes past its allowance", async () => {
    // The plan's risk list names "rate limits" alongside device identity
    // and rotation, and this is what they were missing. A device that
    // pushes without limit is not just noise: every frame is a write, a
    // finding and a beacon.
    await makeDevice("push-10", ["flock-detector"]);
    const client = db.getDb()!;

    // The counter is emptied, and then set to the limit, so the test does
    // not have to push two million frames to prove the bound.
    const key = quota.deviceQuotaKey("push-10");
    const day = new Date().toISOString().slice(0, 10);
    await client
      .delete(schema.quotaCounters)
      .where(eq(schema.quotaCounters.tool, key))
      .catch(() => undefined);
    await client
      .insert(schema.quotaCounters)
      .values({
        tenantId: tenant,
        tool: key,
        day,
        count: 0,
        costUnits: quota.DEVICE_DAILY_FRAME_QUOTA,
        costUnit: "frame",
      })
      .onConflictDoNothing();

    const res = await push("push-10", {
      kind: "flock",
      detections: [
        {
          mac: "dd:ee:ff:00:11:22",
          method: "wifi",
          sourceDevice: "push-10",
          gps: { lat: 30.2672, lon: -97.7431 },
        },
      ],
    });

    expect(res.status).toBe(429);
    expect((await res.json()).errorCode).toBe("DEVICE_PUSH_QUOTA_EXCEEDED");
  });

  it("charges a device's own allowance, not a shared one", async () => {
    // One sensor misbehaving on one roof must not starve the others.
    await makeDevice("push-11", ["flock-detector"]);
    await makeDevice("push-12", ["flock-detector"]);

    const client = db.getDb()!;
    const day = new Date().toISOString().slice(0, 10);
    await client
      .insert(schema.quotaCounters)
      .values({
        tenantId: tenant,
        tool: quota.deviceQuotaKey("push-11"),
        day,
        count: 0,
        costUnits: quota.DEVICE_DAILY_FRAME_QUOTA,
        costUnit: "frame",
      })
      .onConflictDoNothing();

    const refused = await push("push-11", {
      kind: "flock",
      detections: [
        {
          mac: "ee:ff:00:11:22:33",
          method: "wifi",
          sourceDevice: "push-11",
          gps: { lat: 30.2672, lon: -97.7431 },
        },
      ],
    });
    expect(refused.status).toBe(429);

    // The other device is unaffected.
    const allowed = await push("push-12", {
      kind: "flock",
      detections: [
        {
          mac: "ff:00:11:22:33:44",
          method: "wifi",
          sourceDevice: "push-12",
          gps: { lat: 30.2672, lon: -97.7431 },
        },
      ],
    });
    expect(allowed.status).toBe(200);
  });

  it("does not charge a device for a push it was refused for", async () => {
    // The charge happens after the body is validated, so a malformed push
    // costs nothing.
    await makeDevice("push-13", ["flock-detector"]);
    const client = db.getDb()!;
    await client
      .delete(schema.quotaCounters)
      .where(eq(schema.quotaCounters.tool, quota.deviceQuotaKey("push-13")))
      .catch(() => undefined);

    const res = await push("push-13", {
      kind: "flock",
      detections: [{ mac: "too-short", method: "wifi", sourceDevice: "push-13" }],
    });
    expect(res.status).toBe(400);

    const rows = await client
      .select()
      .from(schema.quotaCounters)
      .where(eq(schema.quotaCounters.tool, quota.deviceQuotaKey("push-13")));
    expect(rows).toHaveLength(0);
  });
});
