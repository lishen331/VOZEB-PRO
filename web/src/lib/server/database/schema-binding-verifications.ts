export const BINDING_VERIFICATION_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS binding_verifications (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    fingerprint text NOT NULL,
    status text NOT NULL CHECK (status IN ('running','passed','failed','needs_review')),
    payload jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS binding_verifications_passed_idx ON binding_verifications (fingerprint,created_at DESC) WHERE status='passed';
CREATE INDEX IF NOT EXISTS binding_verifications_user_idx ON binding_verifications (user_id,created_at DESC);
`;
