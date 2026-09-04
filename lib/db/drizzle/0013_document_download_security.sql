-- VETRA-SEC-03: Add documents.download permission for the secure,
-- tenant-scoped document download route. Granted to every role that
-- currently holds documents.read so existing access is preserved.

INSERT INTO "permissions" ("key", "description") VALUES
  ('documents.download', 'Download uploaded document files')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp.role_id, p.id
FROM "role_permissions" rp
JOIN "permissions" src ON src.id = rp.permission_id AND src.key = 'documents.read'
JOIN "permissions" p ON p.key = 'documents.download'
ON CONFLICT DO NOTHING;
