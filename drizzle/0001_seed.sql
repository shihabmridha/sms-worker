-- Seed default global provider settings (priority order: bulksmsbd, mimsms).
-- Hand-written (not drizzle-kit generated): data-only, no schema change, so
-- it's safe to append without touching meta/_journal.json.
INSERT OR IGNORE INTO provider_settings (provider, enabled, priority, sender_id) VALUES ('bulksmsbd', 1, 1, NULL), ('mimsms', 1, 2, NULL);
