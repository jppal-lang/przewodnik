-- JP 2026-11-07: „panel admina nie otwiera się” — nowa bramka działa, ale Authenticator jeszcze nie włączony (brak sekretu),
-- a restart bramki skasował stare sesje. Jedna prośba o link włączenia Authenticatora (DM tylko do JP, admin-link.mjs --process).
INSERT INTO ops.admin_link_requests (requested_by, purpose)
SELECT 'Claude: panel nie otwiera się (JP 2026-11-07)', 'totp'
WHERE NOT EXISTS (SELECT 1 FROM ops.admin_totp WHERE secret IS NOT NULL);
