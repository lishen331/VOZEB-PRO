export const SCHEMA_CUSTOM_VOICES = `
CREATE TABLE IF NOT EXISTS custom_voices (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('minimax', 'qwen')),
    tts_model TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('clone', 'design')),
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('creating', 'ready', 'failed', 'deleted')),
    upstream_voice_id TEXT,
    preview_url TEXT,
    preview_mime_type TEXT,
    failure_reason TEXT,
    shared BOOLEAN NOT NULL DEFAULT FALSE,
    charge_receipt_id TEXT,
    upstream_request_id TEXT,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE custom_voices ADD COLUMN IF NOT EXISTS saved BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE custom_voices ADD COLUMN IF NOT EXISTS source_fingerprint TEXT;
ALTER TABLE custom_voices ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;
ALTER TABLE custom_voices ADD COLUMN IF NOT EXISTS unlocked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS custom_voices_owner_idx ON custom_voices (owner_user_id, status, tts_model, created_at DESC);
CREATE INDEX IF NOT EXISTS custom_voices_shared_idx ON custom_voices (shared, status, tts_model) WHERE shared = TRUE;
CREATE INDEX IF NOT EXISTS custom_voices_expires_idx ON custom_voices (expires_at) WHERE expires_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS custom_voices_fingerprint_idx ON custom_voices (owner_user_id, channel_id, source_fingerprint) WHERE source_fingerprint IS NOT NULL;
`;
