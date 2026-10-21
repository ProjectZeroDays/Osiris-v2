import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * Device secrets, and rotating them.
 *
 * A sensor proves itself with a shared secret, and the platform keeps
 * only the secret's hash. A secret that never changes is a secret that
 * eventually leaks and cannot be replaced without breaking the device.
 *
 * So a secret can be rotated: the new one takes effect at once, and the
 * old one keeps working for a grace window — long enough for a sensor to
 * be told the new one, short enough that a leaked secret stops working.
 *
 * These tests need a database.
 */

const DATABASE_URL =
  process.env.OSIRIS_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const hasDatabase = Boolean(DATABASE_URL);

if (DATABASE_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = DATABASE_URL;
}

const describeDb = hasDatabase ? describe : describe.skip;

describeDb("device secrets", () => {
  const tenant = "t-device-test";

  let device: typeof import("@/lib/auth/device.server");
  let db: typeof import("@/db/client.server");
  let schema: typeof import("@/db/schema");

  beforeAll(async () => {
    device = await import("@/lib/auth/device.server");
    db = await import("@/db/client.server");
    schema = await import("@/db/schema");
  }, 60_000);

  afterAll(async () => {
    const client = db?.getDb();
    if (!client) return;
    await client
      .delete(schema.devices)
      .where(eq(schema.devices.tenantId, tenant))
      .catch(() => undefined);
    await client
      .delete(schema.tenants)
      .where(eq(schema.tenants.id, tenant))
      .catch(() => undefined);
  });

  /** A tenant, if there is not one already. */
  async function ensureTenant() {
    await db
      .getDb()!
      .insert(schema.tenants)
      .values({ id: tenant, name: "Devices" })
      .onConflictDoNothing();
  }

  /** A request that presents a device's secret. */
  const presenting = (id: string, secret: string) =>
    new Request("http://localhost/api/integrations/ingest", {
      headers: { "X-OSIRIS-Device": `${id}:${secret}` },
    });

  it("makes a secret, and shows it once", async () => {
    await ensureTenant();
    const created = await device.createDevice({
      id: "dev-1",
      tenantId: tenant,
      label: "Rooftop",
      allowedTools: ["esp32-drone-rid"],
    });

    expect(created).not.toBeNull();
    expect(created!.secret.length).toBeGreaterThan(20);
    // The platform keeps only the hash, so the secret is in the answer
    // and nowhere else.
    const row = await db.getDb()!.select().from(schema.devices).where(eq(schema.devices.id, "dev-1"));
    expect(row[0].secretHash).toBe(device.hashDeviceSecret(created!.secret));
    expect(JSON.stringify(row[0])).not.toContain(created!.secret);
  });

  it("resolves a device that presents its secret", async () => {
    await ensureTenant();
    const created = await device.createDevice({
      id: "dev-2",
      tenantId: tenant,
      label: "Rooftop",
      allowedTools: ["esp32-drone-rid"],
    });

    const resolved = await device.resolveDevice(presenting("dev-2", created!.secret));
    expect(resolved).not.toBeNull();
    expect(resolved!.deviceId).toBe("dev-2");
    expect(resolved!.tenantId).toBe(tenant);
    expect(resolved!.allowedTools).toEqual(["esp32-drone-rid"]);
  });

  it("refuses a wrong secret", async () => {
    await ensureTenant();
    await device.createDevice({ id: "dev-3", tenantId: tenant, label: "Rooftop" });
    expect(await device.resolveDevice(presenting("dev-3", "not-the-secret"))).toBeNull();
  });

  it("takes the new secret at once, and keeps the old one for a window", async () => {
    await ensureTenant();
    const created = await device.createDevice({ id: "dev-4", tenantId: tenant, label: "Rooftop" });
    const oldSecret = created!.secret;

    const rotated = await device.rotateDeviceSecret("dev-4", tenant);
    expect(rotated).not.toBeNull();
    expect(rotated!.secret).not.toBe(oldSecret);
    expect(rotated!.previousSecretValidUntil).toBeTruthy();

    // The new secret works at once.
    const withNew = await device.resolveDevice(presenting("dev-4", rotated!.secret));
    expect(withNew).not.toBeNull();

    // And the old one still works, because the device has not been told
    // yet and a rotation that silences it is not a rotation.
    const withOld = await device.resolveDevice(presenting("dev-4", oldSecret));
    expect(withOld).not.toBeNull();
  });

  it("stops accepting the old secret once the window has passed", async () => {
    await ensureTenant();
    const created = await device.createDevice({ id: "dev-5", tenantId: tenant, label: "Rooftop" });
    const oldSecret = created!.secret;
    await device.rotateDeviceSecret("dev-5", tenant);

    // The window is closed by moving the rotation back past its end,
    // rather than by waiting for it.
    const client = db.getDb()!;
    await client
      .update(schema.devices)
      .set({
        secretRotatedAt: new Date(Date.now() - device.PREVIOUS_SECRET_GRACE_MS - 1000),
      })
      .where(eq(schema.devices.id, "dev-5"));

    expect(await device.resolveDevice(presenting("dev-5", oldSecret))).toBeNull();
  });

  it("rotates a second time, and the first old secret stops working", async () => {
    await ensureTenant();
    const first = await device.createDevice({ id: "dev-6", tenantId: tenant, label: "Rooftop" });
    const second = await device.rotateDeviceSecret("dev-6", tenant);
    const third = await device.rotateDeviceSecret("dev-6", tenant);

    // Only one previous secret is kept, so the first old secret is gone
    // the moment the second rotation happens.
    expect(await device.resolveDevice(presenting("dev-6", first!.secret))).toBeNull();
    expect(await device.resolveDevice(presenting("dev-6", second!.secret))).not.toBeNull();
    expect(await device.resolveDevice(presenting("dev-6", third!.secret))).not.toBeNull();
  });

  it("does not rotate a device of another tenant", async () => {
    await ensureTenant();
    await device.createDevice({ id: "dev-7", tenantId: tenant, label: "Rooftop" });
    expect(await device.rotateDeviceSecret("dev-7", "some-other-tenant")).toBeNull();
    // And the secret is untouched.
    const row = await db.getDb()!.select().from(schema.devices).where(eq(schema.devices.id, "dev-7"));
    expect(row[0].previousSecretHash).toBeNull();
    expect(row[0].secretRotatedAt).toBeNull();
  });

  it("lists a tenant's devices without their secrets", async () => {
    await ensureTenant();
    const list = await device.listDevices(tenant);
    expect(list.length).toBeGreaterThan(0);
    for (const d of list) {
      expect(d).not.toHaveProperty("secret");
      expect(d.tenantId).toBe(tenant);
    }
  });

  it("says when the previous secret stops working", async () => {
    await ensureTenant();
    const created = await device.createDevice({ id: "dev-8", tenantId: tenant, label: "Rooftop" });
    const rotated = await device.rotateDeviceSecret("dev-8", tenant);

    const list = await device.listDevices(tenant);
    const row = list.find((d) => d.id === "dev-8");
    expect(row?.previousSecretValidUntil).toBeTruthy();
    expect(row?.previousSecretValidUntil).toBe(rotated!.previousSecretValidUntil);
    expect(created!.secret).toBeTruthy();
  });

  it("refuses a request with no device header at all", async () => {
    expect(
      await device.resolveDevice(
        new Request("http://localhost/api/integrations/ingest"),
      ),
    ).toBeNull();
  });

  it("refuses a header with no secret in it", async () => {
    expect(
      await device.resolveDevice(
        new Request("http://localhost/api/integrations/ingest", {
          headers: { "X-OSIRIS-Device": "dev-1:" },
        }),
      ),
    ).toBeNull();
  });

  it("refuses a device that does not exist", async () => {
    expect(
      await device.resolveDevice(presenting("no-such-device", "anything")),
    ).toBeNull();
  });
});
