-- A local tenant, a user, an asset and a consent, for the end-to-end check.
-- The platform refuses an unauthenticated request when a database is
-- configured, so the check needs a session to present.
--
-- The user here has no password: a password is a scrypt hash, and a hash
-- written by hand would not match what the platform makes. Give the
-- account one with:
--
--     npm run user:password -- operator@osiris.local <password>
--
-- A deployment with no accounts at all does not need this file — the
-- platform's first-run screen creates the first administrator and signs
-- it in. This seed is for a local database that already has rows.

INSERT INTO tenants (id, name) VALUES ('single-tenant', 'Local')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO users (id, tenant_id, email, roles)
  VALUES ('local-operator', 'single-tenant', 'operator@osiris.local', '["analyst", "admin"]'::jsonb)
  ON CONFLICT (id) DO NOTHING;

INSERT INTO assets (id, tenant_id, label, kind)
  VALUES ('asset-1', 'single-tenant', 'Lab asset', 'host')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO consents (id, tenant_id, actor_id, scope)
  VALUES ('c1', 'single-tenant', 'local-operator', 'tool-collection:collection.execute')
  ON CONFLICT (id) DO NOTHING;
