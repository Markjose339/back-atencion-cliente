INSERT INTO "permissions" ("id", "name")
VALUES ('ticketresetpermission000', 'reiniciar tickets')
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
JOIN "permissions" p ON p."name" = 'reiniciar tickets'
WHERE r."name" = 'administrador'
ON CONFLICT DO NOTHING;
