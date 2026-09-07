export const POSTGRESQL_IP_LIBRARY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ip_file_cleanup_queue (
    id text PRIMARY KEY,
    storage_provider text NOT NULL,
    storage_key text NOT NULL,
    external_storage_id text,
    external_object_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_file_cleanup_queue_provider_check CHECK (storage_provider IN ('local', 'object'))
);

-- The product no longer has IP versions. Old IP-library rows are intentionally
-- discarded once, while their storage locations remain in the cleanup queue.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '20260906_ip_library_sub_ip_reset') THEN
        IF to_regclass('ip_content_files') IS NOT NULL THEN
            INSERT INTO ip_file_cleanup_queue (id, storage_provider, storage_key, external_storage_id, external_object_key)
            SELECT id, storage_provider, storage_key, external_storage_id, external_object_key
            FROM ip_content_files
            ON CONFLICT (id) DO NOTHING;
        END IF;

        DROP TABLE IF EXISTS ip_download_records;
        DROP TABLE IF EXISTS ip_usage_records;
        DROP TABLE IF EXISTS ip_school_grants;
        DROP TABLE IF EXISTS ip_items;
        -- Legacy packages point to ip_versions through current_version_id.
        -- CASCADE removes that obsolete foreign key before the package reset.
        DROP TABLE IF EXISTS ip_versions CASCADE;
        -- Package and child covers point at content files. CASCADE removes those
        -- old foreign keys before the replacement tables are created below.
        DROP TABLE IF EXISTS ip_content_files CASCADE;
        DROP TABLE IF EXISTS ip_sub_ips CASCADE;
        DROP TABLE IF EXISTS ip_packages CASCADE;

        INSERT INTO schema_migrations (version) VALUES ('20260906_ip_library_sub_ip_reset');
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS ip_packages (
    id text PRIMARY KEY,
    title text NOT NULL,
    slug text NOT NULL,
    summary text NOT NULL DEFAULT '',
    cover_file_id text,
    visibility text NOT NULL,
    status text NOT NULL DEFAULT 'enabled',
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_packages_visibility_check CHECK (visibility IN ('public', 'school')),
    CONSTRAINT ip_packages_status_check CHECK (status IN ('enabled', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ip_packages_slug_idx ON ip_packages (lower(slug));
CREATE INDEX IF NOT EXISTS ip_packages_visibility_status_updated_idx ON ip_packages (visibility, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ip_sub_ips (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    cover_file_id text,
    tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_note text NOT NULL DEFAULT '',
    sort_order integer NOT NULL DEFAULT 0,
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_sub_ips_tags_check CHECK (jsonb_typeof(tags_json) = 'array'),
    CONSTRAINT ip_sub_ips_id_ip_unique UNIQUE (id, ip_id)
);

CREATE INDEX IF NOT EXISTS ip_sub_ips_ip_order_idx ON ip_sub_ips (ip_id, sort_order, created_at, id);
CREATE INDEX IF NOT EXISTS ip_sub_ips_cover_file_idx ON ip_sub_ips (cover_file_id) WHERE cover_file_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ip_content_files (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    sub_ip_id text NOT NULL REFERENCES ip_sub_ips(id) ON DELETE CASCADE,
    kind text NOT NULL,
    original_name text NOT NULL,
    extension text NOT NULL DEFAULT '',
    mime_type text NOT NULL,
    byte_size bigint NOT NULL,
    sha256 text NOT NULL,
    storage_provider text NOT NULL,
    storage_key text NOT NULL,
    external_storage_id text,
    external_object_key text,
    extracted_text text,
    metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'processing',
    error_message text,
    uploaded_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_content_files_kind_check CHECK (kind IN ('text', 'image', 'audio', 'video')),
    CONSTRAINT ip_content_files_storage_provider_check CHECK (storage_provider IN ('local', 'object')),
    CONSTRAINT ip_content_files_status_check CHECK (status IN ('processing', 'ready', 'failed', 'deleting')),
    CONSTRAINT ip_content_files_byte_size_check CHECK (byte_size >= 0),
    CONSTRAINT ip_content_files_metadata_check CHECK (jsonb_typeof(metadata_json) = 'object'),
    CONSTRAINT ip_content_files_id_ip_unique UNIQUE (id, ip_id),
    CONSTRAINT ip_content_files_id_sub_ip_unique UNIQUE (id, sub_ip_id)
);

CREATE INDEX IF NOT EXISTS ip_content_files_ip_sub_ip_status_created_idx ON ip_content_files (ip_id, sub_ip_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_content_files_storage_idx ON ip_content_files (storage_provider, storage_key);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE version = '20260907_ip_library_file_integrity') THEN
        INSERT INTO ip_file_cleanup_queue (id, storage_provider, storage_key, external_storage_id, external_object_key)
        SELECT id, storage_provider, storage_key, external_storage_id, external_object_key
        FROM ip_content_files
        WHERE sub_ip_id IS NULL
        ON CONFLICT (id) DO NOTHING;

        UPDATE ip_packages SET cover_file_id = NULL WHERE cover_file_id IN (SELECT id FROM ip_content_files WHERE sub_ip_id IS NULL);
        UPDATE ip_sub_ips SET cover_file_id = NULL WHERE cover_file_id IN (SELECT id FROM ip_content_files WHERE sub_ip_id IS NULL);
        -- On a legacy reset, ip_items was deliberately dropped above and is
        -- recreated below. Only clean it when a previous schema still has it.
        IF to_regclass('ip_items') IS NOT NULL THEN
            DELETE FROM ip_items WHERE file_id IN (SELECT id FROM ip_content_files WHERE sub_ip_id IS NULL);
        END IF;
        DELETE FROM ip_content_files WHERE sub_ip_id IS NULL;
        INSERT INTO schema_migrations (version) VALUES ('20260907_ip_library_file_integrity');
    END IF;

    ALTER TABLE ip_content_files ALTER COLUMN sub_ip_id SET NOT NULL;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_sub_ips_id_ip_unique') THEN
        ALTER TABLE ip_sub_ips ADD CONSTRAINT ip_sub_ips_id_ip_unique UNIQUE (id, ip_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_content_files_id_sub_ip_unique') THEN
        ALTER TABLE ip_content_files ADD CONSTRAINT ip_content_files_id_sub_ip_unique UNIQUE (id, sub_ip_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_content_files_sub_ip_ip_fk') THEN
        ALTER TABLE ip_content_files ADD CONSTRAINT ip_content_files_sub_ip_ip_fk FOREIGN KEY (sub_ip_id, ip_id) REFERENCES ip_sub_ips(id, ip_id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_packages_cover_file_fk') THEN
        ALTER TABLE ip_packages ADD CONSTRAINT ip_packages_cover_file_fk FOREIGN KEY (cover_file_id) REFERENCES ip_content_files(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_sub_ips_cover_file_fk') THEN
        ALTER TABLE ip_sub_ips ADD CONSTRAINT ip_sub_ips_cover_file_fk FOREIGN KEY (cover_file_id) REFERENCES ip_content_files(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_packages_cover_file_ip_fk') THEN
        ALTER TABLE ip_packages ADD CONSTRAINT ip_packages_cover_file_ip_fk FOREIGN KEY (cover_file_id, id) REFERENCES ip_content_files(id, ip_id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_sub_ips_cover_file_sub_ip_fk') THEN
        ALTER TABLE ip_sub_ips ADD CONSTRAINT ip_sub_ips_cover_file_sub_ip_fk FOREIGN KEY (cover_file_id, id) REFERENCES ip_content_files(id, sub_ip_id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS ip_items (
    id text PRIMARY KEY,
    sub_ip_id text NOT NULL REFERENCES ip_sub_ips(id) ON DELETE CASCADE,
    kind text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    file_id text NOT NULL REFERENCES ip_content_files(id) ON DELETE RESTRICT,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_items_kind_check CHECK (kind IN ('text', 'image', 'audio', 'video')),
    CONSTRAINT ip_items_category_check CHECK (
        (kind = 'text' AND category IN ('story_summary', 'worldbuilding', 'character_biography', 'script', 'derivative_script', 'creation_notes')) OR
        (kind = 'image' AND category IN ('character', 'scene', 'prop', 'effect', 'style')) OR
        (kind = 'audio' AND category IN ('background_music', 'theme_music', 'character_voice', 'narration', 'sound_effect')) OR
        (kind = 'video' AND category IN ('trailer', 'action', 'performance', 'shot', 'clip'))
    ),
    CONSTRAINT ip_items_file_required_check CHECK (btrim(file_id) <> '')
);

CREATE INDEX IF NOT EXISTS ip_items_sub_ip_order_idx ON ip_items (sub_ip_id, sort_order, created_at, id);
CREATE INDEX IF NOT EXISTS ip_items_sub_ip_kind_category_idx ON ip_items (sub_ip_id, kind, category, sort_order);
CREATE INDEX IF NOT EXISTS ip_items_file_idx ON ip_items (file_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_items_file_sub_ip_fk') THEN
        ALTER TABLE ip_items ADD CONSTRAINT ip_items_file_sub_ip_fk FOREIGN KEY (file_id, sub_ip_id) REFERENCES ip_content_files(id, sub_ip_id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS ip_school_grants (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    sub_ip_id text NOT NULL REFERENCES ip_sub_ips(id) ON DELETE CASCADE,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    mode text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    note text NOT NULL DEFAULT '',
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_school_grants_mode_check CHECK (mode IN ('multi_school', 'exclusive')),
    CONSTRAINT ip_school_grants_status_check CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    CONSTRAINT ip_school_grants_window_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS ip_school_grants_ip_sub_ip_school_created_idx ON ip_school_grants (ip_id, sub_ip_id, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_school_grants_school_status_window_idx ON ip_school_grants (school_id, status, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS ip_usage_records (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    sub_ip_id text NOT NULL REFERENCES ip_sub_ips(id) ON DELETE CASCADE,
    item_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    school_id text REFERENCES schools(id) ON DELETE SET NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_usage_records_item_ids_check CHECK (jsonb_typeof(item_ids_json) = 'array'),
    CONSTRAINT ip_usage_records_action_check CHECK (action IN ('reference', 'download_item', 'download_package')),
    CONSTRAINT ip_usage_records_target_type_check CHECK (target_type IN ('canvas', 'drama', 'practice', 'download'))
);

CREATE INDEX IF NOT EXISTS ip_usage_records_ip_created_idx ON ip_usage_records (ip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_usage_records_sub_ip_created_idx ON ip_usage_records (sub_ip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_usage_records_school_created_idx ON ip_usage_records (school_id, created_at DESC) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ip_usage_records_user_created_idx ON ip_usage_records (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ip_download_records (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    sub_ip_id text NOT NULL REFERENCES ip_sub_ips(id) ON DELETE CASCADE,
    item_id text REFERENCES ip_items(id) ON DELETE SET NULL,
    school_id text REFERENCES schools(id) ON DELETE SET NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    download_type text NOT NULL,
    result text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_download_records_type_check CHECK (download_type IN ('item', 'package')),
    CONSTRAINT ip_download_records_result_check CHECK (result IN ('succeeded', 'failed')),
    CONSTRAINT ip_download_records_item_check CHECK ((download_type = 'item' AND item_id IS NOT NULL) OR (download_type = 'package' AND item_id IS NULL))
);

CREATE INDEX IF NOT EXISTS ip_download_records_ip_created_idx ON ip_download_records (ip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_download_records_sub_ip_created_idx ON ip_download_records (sub_ip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_download_records_school_created_idx ON ip_download_records (school_id, created_at DESC) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ip_download_records_user_created_idx ON ip_download_records (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION ip_library_validate_school_grant()
RETURNS trigger AS $$
DECLARE
    package_visibility text;
BEGIN
    SELECT visibility INTO package_visibility FROM ip_packages WHERE id = NEW.ip_id FOR UPDATE;
    IF package_visibility <> 'school' OR NOT EXISTS (SELECT 1 FROM ip_sub_ips WHERE id = NEW.sub_ip_id AND ip_id = NEW.ip_id) THEN
        RAISE EXCEPTION 'IP grant does not match a school sub IP' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'active' AND EXISTS (
        SELECT 1 FROM ip_school_grants AS existing
        WHERE existing.sub_ip_id = NEW.sub_ip_id
          AND existing.id <> NEW.id
          AND existing.status = 'active'
          AND (existing.school_id = NEW.school_id OR existing.mode = 'exclusive' OR NEW.mode = 'exclusive')
          AND tstzrange(existing.starts_at, COALESCE(existing.ends_at, 'infinity'::timestamptz), '[)')
              && tstzrange(NEW.starts_at, COALESCE(NEW.ends_at, 'infinity'::timestamptz), '[)')
    ) THEN
        RAISE EXCEPTION 'Conflicting IP school grant' USING ERRCODE = '23505';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ip_school_grants_validate ON ip_school_grants;
CREATE TRIGGER ip_school_grants_validate BEFORE INSERT OR UPDATE ON ip_school_grants FOR EACH ROW EXECUTE FUNCTION ip_library_validate_school_grant();
DROP TRIGGER IF EXISTS ip_packages_set_updated_at ON ip_packages;
CREATE TRIGGER ip_packages_set_updated_at BEFORE UPDATE ON ip_packages FOR EACH ROW EXECUTE FUNCTION vozeb_pro_set_updated_at();
DROP TRIGGER IF EXISTS ip_sub_ips_set_updated_at ON ip_sub_ips;
CREATE TRIGGER ip_sub_ips_set_updated_at BEFORE UPDATE ON ip_sub_ips FOR EACH ROW EXECUTE FUNCTION vozeb_pro_set_updated_at();
DROP TRIGGER IF EXISTS ip_school_grants_set_updated_at ON ip_school_grants;
CREATE TRIGGER ip_school_grants_set_updated_at BEFORE UPDATE ON ip_school_grants FOR EACH ROW EXECUTE FUNCTION vozeb_pro_set_updated_at();
DROP TRIGGER IF EXISTS ip_content_files_set_updated_at ON ip_content_files;
CREATE TRIGGER ip_content_files_set_updated_at BEFORE UPDATE ON ip_content_files FOR EACH ROW EXECUTE FUNCTION vozeb_pro_set_updated_at();
`;
