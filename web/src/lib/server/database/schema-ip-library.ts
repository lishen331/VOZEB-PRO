export const POSTGRESQL_IP_LIBRARY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS ip_packages (
    id text PRIMARY KEY,
    title text NOT NULL,
    slug text NOT NULL,
    summary text NOT NULL DEFAULT '',
    cover_asset_id text,
    visibility text NOT NULL,
    authorization_mode text NOT NULL DEFAULT 'multi_school',
    status text NOT NULL DEFAULT 'draft',
    current_version_id text,
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_packages_visibility_check CHECK (visibility IN ('public', 'school')),
    CONSTRAINT ip_packages_authorization_mode_check CHECK (authorization_mode IN ('multi_school', 'exclusive')),
    CONSTRAINT ip_packages_status_check CHECK (status IN ('draft', 'published', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ip_packages_slug_idx ON ip_packages (lower(slug));
CREATE INDEX IF NOT EXISTS ip_packages_visibility_status_updated_idx ON ip_packages (visibility, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS ip_content_files (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    kind text NOT NULL,
    original_name text NOT NULL,
    extension text NOT NULL,
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
    CONSTRAINT ip_content_files_status_check CHECK (status IN ('processing', 'ready', 'failed')),
    CONSTRAINT ip_content_files_byte_size_check CHECK (byte_size >= 0),
    CONSTRAINT ip_content_files_metadata_check CHECK (jsonb_typeof(metadata_json) = 'object'),
    CONSTRAINT ip_content_files_ip_id_unique UNIQUE (id, ip_id)
);

CREATE INDEX IF NOT EXISTS ip_content_files_ip_status_created_idx ON ip_content_files (ip_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_content_files_storage_idx ON ip_content_files (storage_provider, storage_key);

CREATE TABLE IF NOT EXISTS ip_versions (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    version_number integer NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    cover_file_id text REFERENCES ip_content_files(id) ON DELETE RESTRICT,
    tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    source_note text NOT NULL DEFAULT '',
    change_note text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'draft',
    manifest_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    published_at timestamptz,
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_versions_number_check CHECK (version_number > 0),
    CONSTRAINT ip_versions_status_check CHECK (status IN ('draft', 'published', 'disabled')),
    CONSTRAINT ip_versions_tags_check CHECK (jsonb_typeof(tags_json) = 'array'),
    CONSTRAINT ip_versions_published_at_check CHECK ((status = 'published' AND published_at IS NOT NULL) OR (status <> 'published' AND published_at IS NULL)),
    CONSTRAINT ip_versions_ip_number_unique UNIQUE (ip_id, version_number),
    CONSTRAINT ip_versions_id_ip_unique UNIQUE (id, ip_id)
);

ALTER TABLE ip_versions ADD COLUMN IF NOT EXISTS cover_file_id text;
ALTER TABLE ip_versions ADD COLUMN IF NOT EXISTS tags_json jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ip_versions ADD COLUMN IF NOT EXISTS source_note text NOT NULL DEFAULT '';
ALTER TABLE ip_versions ADD COLUMN IF NOT EXISTS change_note text NOT NULL DEFAULT '';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_versions_cover_file_fk') THEN
        ALTER TABLE ip_versions ADD CONSTRAINT ip_versions_cover_file_fk FOREIGN KEY (cover_file_id) REFERENCES ip_content_files(id) ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ip_versions_ip_status_created_idx ON ip_versions (ip_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_versions_cover_file_idx ON ip_versions (cover_file_id) WHERE cover_file_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ip_items (
    id text PRIMARY KEY,
    version_id text NOT NULL REFERENCES ip_versions(id) ON DELETE CASCADE,
    kind text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    summary text NOT NULL DEFAULT '',
    file_id text NOT NULL REFERENCES ip_content_files(id) ON DELETE RESTRICT,
    text_content text,
    asset_id text,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_items_kind_check CHECK (kind IN ('text', 'image', 'audio', 'video')),
    CONSTRAINT ip_items_category_check CHECK (
        (kind = 'text' AND category IN ('story_summary', 'worldbuilding', 'character_biography', 'script', 'derivative_script', 'creation_notes')) OR
        (kind = 'image' AND category IN ('character', 'scene', 'prop', 'effect', 'style')) OR
        (kind = 'audio' AND category IN ('background_music', 'theme_music', 'character_voice', 'narration', 'sound_effect')) OR
        (kind = 'video' AND category IN ('trailer', 'action', 'performance', 'shot', 'clip'))
    ),
    CONSTRAINT ip_items_file_required_check CHECK (file_id IS NOT NULL AND btrim(file_id) <> '')
);

ALTER TABLE ip_items ADD COLUMN IF NOT EXISTS file_id text;
ALTER TABLE ip_items DROP CONSTRAINT IF EXISTS ip_items_content_check;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_items_file_fk') THEN
        ALTER TABLE ip_items ADD CONSTRAINT ip_items_file_fk FOREIGN KEY (file_id) REFERENCES ip_content_files(id) ON DELETE RESTRICT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_items_file_required_check') THEN
        ALTER TABLE ip_items ADD CONSTRAINT ip_items_file_required_check CHECK (file_id IS NOT NULL AND btrim(file_id) <> '') NOT VALID;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ip_items_version_order_idx ON ip_items (version_id, sort_order, created_at);
CREATE INDEX IF NOT EXISTS ip_items_version_kind_category_idx ON ip_items (version_id, kind, category, sort_order);
CREATE INDEX IF NOT EXISTS ip_items_file_idx ON ip_items (file_id);

CREATE TABLE IF NOT EXISTS ip_school_grants (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE CASCADE,
    school_id text NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
    mode text NOT NULL,
    status text NOT NULL DEFAULT 'active',
    starts_at timestamptz NOT NULL,
    ends_at timestamptz,
    note text NOT NULL DEFAULT '',
    member_access_enabled boolean NOT NULL DEFAULT false,
    member_access_updated_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    member_access_updated_at timestamptz,
    created_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_school_grants_mode_check CHECK (mode IN ('multi_school', 'exclusive')),
    CONSTRAINT ip_school_grants_status_check CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    CONSTRAINT ip_school_grants_window_check CHECK (ends_at IS NULL OR ends_at > starts_at)
);

ALTER TABLE ip_school_grants ADD COLUMN IF NOT EXISTS member_access_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE ip_school_grants ADD COLUMN IF NOT EXISTS member_access_updated_by_user_id text;
ALTER TABLE ip_school_grants ADD COLUMN IF NOT EXISTS member_access_updated_at timestamptz;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ip_school_grants_member_access_user_fk') THEN
        ALTER TABLE ip_school_grants ADD CONSTRAINT ip_school_grants_member_access_user_fk FOREIGN KEY (member_access_updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS ip_school_grants_ip_school_created_idx ON ip_school_grants (ip_id, school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_school_grants_school_status_window_idx ON ip_school_grants (school_id, status, starts_at, ends_at);
DROP INDEX IF EXISTS ip_school_grants_exclusive_active_idx;

CREATE TABLE IF NOT EXISTS ip_usage_records (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE RESTRICT,
    version_id text NOT NULL,
    item_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
    school_id text REFERENCES schools(id) ON DELETE SET NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action text NOT NULL,
    target_type text NOT NULL,
    target_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_usage_records_version_ip_fk FOREIGN KEY (version_id, ip_id) REFERENCES ip_versions(id, ip_id) ON DELETE RESTRICT,
    CONSTRAINT ip_usage_records_item_ids_check CHECK (jsonb_typeof(item_ids_json) = 'array'),
    CONSTRAINT ip_usage_records_action_check CHECK (action IN ('reference', 'download_item', 'download_package')),
    CONSTRAINT ip_usage_records_target_type_check CHECK (target_type IN ('canvas', 'drama', 'practice', 'download'))
);

CREATE INDEX IF NOT EXISTS ip_usage_records_ip_created_idx ON ip_usage_records (ip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_usage_records_school_created_idx ON ip_usage_records (school_id, created_at DESC) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ip_usage_records_user_created_idx ON ip_usage_records (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ip_download_records (
    id text PRIMARY KEY,
    ip_id text NOT NULL REFERENCES ip_packages(id) ON DELETE RESTRICT,
    version_id text NOT NULL,
    item_id text REFERENCES ip_items(id) ON DELETE RESTRICT,
    school_id text REFERENCES schools(id) ON DELETE SET NULL,
    user_id text NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    download_type text NOT NULL,
    result text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT ip_download_records_version_ip_fk FOREIGN KEY (version_id, ip_id) REFERENCES ip_versions(id, ip_id) ON DELETE RESTRICT,
    CONSTRAINT ip_download_records_type_check CHECK (download_type IN ('item', 'package')),
    CONSTRAINT ip_download_records_result_check CHECK (result IN ('succeeded', 'failed')),
    CONSTRAINT ip_download_records_item_check CHECK ((download_type = 'item' AND item_id IS NOT NULL) OR (download_type = 'package' AND item_id IS NULL))
);

CREATE INDEX IF NOT EXISTS ip_download_records_ip_created_idx ON ip_download_records (ip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ip_download_records_school_created_idx ON ip_download_records (school_id, created_at DESC) WHERE school_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ip_download_records_user_created_idx ON ip_download_records (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION ip_library_prevent_published_version_mutation()
RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'published' THEN
        RAISE EXCEPTION 'Published IP versions are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ip_versions_immutable ON ip_versions;
CREATE TRIGGER ip_versions_immutable BEFORE UPDATE OR DELETE ON ip_versions FOR EACH ROW EXECUTE FUNCTION ip_library_prevent_published_version_mutation();

CREATE OR REPLACE FUNCTION ip_library_prevent_published_item_mutation()
RETURNS trigger AS $$
DECLARE
    source_version_id text;
    target_version_id text;
BEGIN
    source_version_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.version_id END;
    target_version_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.version_id END;
    IF EXISTS (SELECT 1 FROM ip_versions WHERE id IN (source_version_id, target_version_id) AND status = 'published') THEN
        RAISE EXCEPTION 'Published IP version items are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ip_items_immutable ON ip_items;
CREATE TRIGGER ip_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON ip_items FOR EACH ROW EXECUTE FUNCTION ip_library_prevent_published_item_mutation();

CREATE OR REPLACE FUNCTION ip_library_prevent_published_file_mutation()
RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM ip_items AS item
        JOIN ip_versions AS version ON version.id = item.version_id
        WHERE item.file_id = OLD.id AND version.status = 'published'
    ) OR EXISTS (
        SELECT 1 FROM ip_versions AS version
        WHERE version.cover_file_id = OLD.id AND version.status = 'published'
    ) THEN
        RAISE EXCEPTION 'Published IP content files are immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ip_content_files_immutable ON ip_content_files;
CREATE TRIGGER ip_content_files_immutable BEFORE UPDATE OR DELETE ON ip_content_files FOR EACH ROW EXECUTE FUNCTION ip_library_prevent_published_file_mutation();

CREATE OR REPLACE FUNCTION ip_library_validate_school_grant()
RETURNS trigger AS $$
DECLARE
    package_visibility text;
    package_status text;
BEGIN
    SELECT visibility, status INTO package_visibility, package_status
    FROM ip_packages WHERE id = NEW.ip_id FOR UPDATE;
    IF package_visibility <> 'school' OR package_status <> 'published' THEN
        RAISE EXCEPTION 'IP grant does not match a published school IP' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'active' AND EXISTS (
        SELECT 1 FROM ip_school_grants AS existing
        WHERE existing.ip_id = NEW.ip_id
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
DROP TRIGGER IF EXISTS ip_school_grants_set_updated_at ON ip_school_grants;
CREATE TRIGGER ip_school_grants_set_updated_at BEFORE UPDATE ON ip_school_grants FOR EACH ROW EXECUTE FUNCTION vozeb_pro_set_updated_at();
DROP TRIGGER IF EXISTS ip_content_files_set_updated_at ON ip_content_files;
CREATE TRIGGER ip_content_files_set_updated_at BEFORE UPDATE ON ip_content_files FOR EACH ROW EXECUTE FUNCTION vozeb_pro_set_updated_at();
`;
