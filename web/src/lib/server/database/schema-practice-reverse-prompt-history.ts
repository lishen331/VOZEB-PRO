export const REVERSE_PROMPT_HISTORY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS practice_reverse_prompt_history (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    school_id text NOT NULL,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    source_key text,
    analysis_mode text NOT NULL,
    extra_requirement text NOT NULL,
    analysis_text text,
    trial_id text,
    trial_at timestamptz,
    trial_status text,
    trial_prompt text,
    success_id text,
    success_prompt text,
    success_asset_key text,
    success_asset_scope text,
    success_width integer,
    success_height integer
);
CREATE INDEX IF NOT EXISTS vozeb_pro_reverse_prompt_history_owner_updated_idx ON practice_reverse_prompt_history (school_id, user_id, updated_at DESC, id DESC) WHERE analysis_text IS NOT NULL;
CREATE INDEX IF NOT EXISTS vozeb_pro_reverse_prompt_history_trial_idx ON practice_reverse_prompt_history (trial_id) WHERE trial_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS vozeb_pro_reverse_prompt_history_source_idx ON practice_reverse_prompt_history (source_key) WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS vozeb_pro_reverse_prompt_history_result_idx ON practice_reverse_prompt_history (success_asset_key) WHERE success_asset_key IS NOT NULL;

CREATE OR REPLACE FUNCTION vozeb_pro_sync_reverse_prompt_history() RETURNS trigger AS $$
DECLARE
    media jsonb;
    media_url text;
    media_key text;
    media_scope text;
BEGIN
    IF NEW.execution_profile IS DISTINCT FROM 'open-source-practice' THEN RETURN NULL; END IF;
    IF NEW.task_type = 'text' AND NEW.status = 'success' AND (NEW.payload->'result'->>'content') <> '' THEN
        UPDATE practice_reverse_prompt_history SET analysis_text = NEW.payload->'result'->>'content', updated_at = GREATEST(updated_at, NEW.updated_at)
        WHERE id = NEW.id AND user_id = NEW.user_id AND school_id = NEW.school_id AND analysis_text IS NULL;
    ELSIF NEW.task_type = 'image' THEN
        IF NOT EXISTS (SELECT 1 FROM practice_reverse_prompt_history WHERE trial_id = NEW.id AND user_id = NEW.user_id AND school_id = NEW.school_id) THEN RETURN NULL; END IF;
        IF NEW.status IN ('error', 'cancelled') THEN
            UPDATE practice_reverse_prompt_history SET trial_status = 'failed', updated_at = GREATEST(updated_at, NEW.updated_at)
            WHERE trial_id = NEW.id AND user_id = NEW.user_id AND school_id = NEW.school_id AND trial_status IS DISTINCT FROM 'failed';
        ELSIF NEW.status = 'success' THEN
            media := COALESCE(NEW.payload->'result'->'results'->0, NEW.payload->'result');
            media_url := COALESCE(NULLIF(media->>'serverUrl', ''), media->>'dataUrl');
            IF media_url LIKE '/api/generation-log-assets/permanent/%' THEN
                media_key := substr(media_url, length('/api/generation-log-assets/') + 1);
                media_scope := 'generation';
            ELSIF media_url LIKE '/api/reference-assets/permanent/%' THEN
                media_key := substr(media_url, length('/api/reference-assets/') + 1);
                media_scope := 'reference';
            END IF;
            IF media_key IS NOT NULL AND EXISTS (SELECT 1 FROM local_media_assets WHERE storage_key = media_key AND owner_user_id = NEW.user_id AND type = 'image' AND scope = media_scope AND storage_class = 'permanent') THEN
                UPDATE practice_reverse_prompt_history SET trial_status = 'success', success_id = NEW.id, success_prompt = trial_prompt,
                    success_asset_key = media_key, success_asset_scope = media_scope,
                    success_width = CASE WHEN jsonb_typeof(media->'width') = 'number' THEN (media->>'width')::numeric::int ELSE 0 END,
                    success_height = CASE WHEN jsonb_typeof(media->'height') = 'number' THEN (media->>'height')::numeric::int ELSE 0 END,
                    updated_at = GREATEST(updated_at, NEW.updated_at)
                WHERE trial_id = NEW.id AND user_id = NEW.user_id AND school_id = NEW.school_id AND (success_id IS DISTINCT FROM NEW.id OR success_asset_key IS DISTINCT FROM media_key);
            ELSE
                -- Success can precede durable asset writeback. Do not keep a finished task pending forever.
                UPDATE practice_reverse_prompt_history SET trial_status = 'success', updated_at = GREATEST(updated_at, NEW.updated_at)
                WHERE trial_id = NEW.id AND user_id = NEW.user_id AND school_id = NEW.school_id AND trial_status IS DISTINCT FROM 'success';
            END IF;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS vozeb_pro_reverse_prompt_history_task_sync ON generation_tasks;
CREATE TRIGGER vozeb_pro_reverse_prompt_history_task_sync AFTER UPDATE OF status, payload ON generation_tasks
FOR EACH ROW WHEN (NEW.status IN ('success', 'error', 'cancelled')) EXECUTE FUNCTION vozeb_pro_sync_reverse_prompt_history();
`;
