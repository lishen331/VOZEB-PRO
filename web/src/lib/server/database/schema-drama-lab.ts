/**
 * Drama Lab (短剧实验室) Schema Extension
 *
 * 这是 LocalMiniDrama 功能的 PostgreSQL 数据库扩展
 * 集成到 VOZEB PRO 的现有 drama_projects 架构中
 */

export const DRAMA_LAB_SCHEMA_SQL = `
-- 早期短剧实验室版本未纳入 PostgreSQL 表名前缀。首次升级时只重命名旧表，保留原有数据。
DO $drama_lab_table_prefix$
DECLARE
    table_suffix text;
BEGIN
    FOREACH table_suffix IN ARRAY ARRAY[
        'ai_configs', 'character_library', 'scene_library', 'prop_library',
        'async_tasks', 'image_generations', 'video_generations', 'video_merges',
        'assets', 'image_proxy_cache', 'ai_model_map', 'global_settings'
    ]
    LOOP
        IF to_regclass('public.' || 'drama_lab_' || table_suffix) IS NOT NULL
           AND to_regclass('public.' || 'vozeb_pro_drama_lab_' || table_suffix) IS NULL THEN
            EXECUTE format(
                'ALTER TABLE %I RENAME TO %I',
                'drama_lab_' || table_suffix,
                'vozeb_pro_drama_lab_' || table_suffix
            );
        END IF;
    END LOOP;
END
$drama_lab_table_prefix$;

-- ============================================================================
-- LocalMiniDrama 集成表结构
-- ============================================================================

-- AI 配置表（模型、提供商配置）
CREATE TABLE IF NOT EXISTS drama_lab_ai_configs (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service_type text NOT NULL DEFAULT 'text',
    provider text NOT NULL DEFAULT '',
    name text NOT NULL DEFAULT '',
    base_url text DEFAULT '',
    api_key text,
    model text,
    default_model text,
    endpoint text,
    query_endpoint text,
    priority integer DEFAULT 0,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT drama_lab_ai_configs_service_type CHECK (service_type IN ('text', 'image', 'video', 'audio'))
);

CREATE INDEX IF NOT EXISTS drama_lab_ai_configs_user_active_idx ON drama_lab_ai_configs (user_id, is_active, service_type);

-- 分集表（episodes 数据从 drama_projects.project_json 中提取）
-- 为了与 LocalMiniDrama 兼容，我们在 project_json 中存储 episodes 数组
-- 但为了查询性能，创建一个视图或使用 GIN 索引

-- 角色表（存储在 project_json.characters 中）
-- 公共角色库
CREATE TABLE IF NOT EXISTS drama_lab_character_library (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT '',
    category text,
    image_url text,
    local_path text,
    description text,
    appearance text,
    tags text,
    source_type text,
    source_id text,
    identity_anchors jsonb DEFAULT '{}'::jsonb,
    style_tokens text,
    color_palette jsonb DEFAULT '[]'::jsonb,
    four_view_image_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS drama_lab_character_library_user_idx ON drama_lab_character_library (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS drama_lab_character_library_project_idx ON drama_lab_character_library (project_id, deleted_at) WHERE project_id IS NOT NULL;

-- 场景库
CREATE TABLE IF NOT EXISTS drama_lab_scene_library (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    location text NOT NULL DEFAULT '',
    time text,
    prompt text,
    polished_prompt text,
    description text,
    image_url text,
    local_path text,
    category text,
    tags text,
    source_type text,
    source_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS drama_lab_scene_library_user_idx ON drama_lab_scene_library (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS drama_lab_scene_library_project_idx ON drama_lab_scene_library (project_id, deleted_at) WHERE project_id IS NOT NULL;

-- 道具库
CREATE TABLE IF NOT EXISTS drama_lab_prop_library (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    name text NOT NULL DEFAULT '',
    description text,
    prompt text,
    image_url text,
    local_path text,
    category text,
    tags text,
    source_type text,
    source_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS drama_lab_prop_library_user_idx ON drama_lab_prop_library (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS drama_lab_prop_library_project_idx ON drama_lab_prop_library (project_id, deleted_at) WHERE project_id IS NOT NULL;

-- 异步任务表（用于生成任务跟踪）
CREATE TABLE IF NOT EXISTS drama_lab_async_tasks (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    type text NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    progress integer DEFAULT 0,
    message text,
    resource_id text,
    result jsonb DEFAULT '{}'::jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT drama_lab_async_tasks_status CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS drama_lab_async_tasks_user_status_idx ON drama_lab_async_tasks (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS drama_lab_async_tasks_resource_idx ON drama_lab_async_tasks (resource_id) WHERE resource_id IS NOT NULL;

-- 图片生成记录
CREATE TABLE IF NOT EXISTS drama_lab_image_generations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    storyboard_id text,
    scene_id text,
    character_id text,
    provider text,
    prompt text,
    negative_prompt text,
    model text,
    frame_type text,
    reference_images jsonb DEFAULT '[]'::jsonb,
    size text,
    quality text,
    image_url text,
    local_path text,
    width integer,
    height integer,
    status text DEFAULT 'pending',
    task_id text,
    error_msg text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT drama_lab_image_generations_status CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS drama_lab_image_generations_user_idx ON drama_lab_image_generations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS drama_lab_image_generations_project_idx ON drama_lab_image_generations (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS drama_lab_image_generations_task_idx ON drama_lab_image_generations (task_id) WHERE task_id IS NOT NULL;

-- 视频生成记录
CREATE TABLE IF NOT EXISTS drama_lab_video_generations (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    storyboard_id text,
    provider text,
    prompt text,
    model text,
    duration real,
    aspect_ratio text,
    resolution text,
    image_url text,
    first_frame_url text,
    last_frame_url text,
    reference_image_urls jsonb DEFAULT '[]'::jsonb,
    video_url text,
    local_path text,
    status text DEFAULT 'pending',
    task_id text,
    provider_task_id text,
    error_msg text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT drama_lab_video_generations_status CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS drama_lab_video_generations_user_idx ON drama_lab_video_generations (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS drama_lab_video_generations_project_idx ON drama_lab_video_generations (project_id, created_at DESC) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS drama_lab_video_generations_task_idx ON drama_lab_video_generations (task_id) WHERE task_id IS NOT NULL;

-- 视频合成任务
CREATE TABLE IF NOT EXISTS drama_lab_video_merges (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    episode_id text,
    title text,
    provider text,
    model text,
    status text DEFAULT 'pending',
    scenes jsonb DEFAULT '[]'::jsonb,
    merge_options jsonb DEFAULT '{}'::jsonb,
    task_id text,
    merged_url text,
    duration integer,
    error_msg text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    deleted_at timestamptz,
    CONSTRAINT drama_lab_video_merges_status CHECK (status IN ('pending', 'running', 'completed', 'error', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS drama_lab_video_merges_user_idx ON drama_lab_video_merges (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS drama_lab_video_merges_project_idx ON drama_lab_video_merges (project_id, created_at DESC) WHERE project_id IS NOT NULL;

-- 素材资产表
CREATE TABLE IF NOT EXISTS drama_lab_assets (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id text REFERENCES drama_projects(id) ON DELETE CASCADE,
    name text,
    type text,
    category text,
    url text,
    local_path text,
    file_size bigint,
    mime_type text,
    width integer,
    height integer,
    duration real,
    image_gen_id text,
    video_gen_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT drama_lab_assets_type CHECK (type IN ('image', 'video', 'audio', 'other'))
);

CREATE INDEX IF NOT EXISTS drama_lab_assets_user_idx ON drama_lab_assets (user_id, type, created_at DESC);
CREATE INDEX IF NOT EXISTS drama_lab_assets_project_idx ON drama_lab_assets (project_id, created_at DESC) WHERE project_id IS NOT NULL;

-- 图片代理缓存（用于外部图片的本地代理）
CREATE TABLE IF NOT EXISTS drama_lab_image_proxy_cache (
    id text PRIMARY KEY,
    cache_key text NOT NULL UNIQUE,
    proxy_url text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drama_lab_image_proxy_cache_created_idx ON drama_lab_image_proxy_cache (created_at);

-- AI 模型路由映射表
CREATE TABLE IF NOT EXISTS drama_lab_ai_model_map (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key text NOT NULL,
    service_type text NOT NULL DEFAULT 'text',
    config_id text,
    model_override text,
    description text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, key)
);

CREATE INDEX IF NOT EXISTS drama_lab_ai_model_map_user_key_idx ON drama_lab_ai_model_map (user_id, key);

-- 全局设置表
CREATE TABLE IF NOT EXISTS drama_lab_global_settings (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key text NOT NULL,
    value text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, key)
);

-- ============================================================================
-- 扩展 drama_projects 表的 project_json 结构
-- ============================================================================
-- project_json 结构应包含：
-- {
--   "id": "project-id",
--   "title": "项目标题",
--   "summary": "项目简介",
--   "style": "视觉风格",
--   "ratio": "9:16",
--   "genre": "类型",
--   "tags": ["标签"],
--   "metadata": {
--     "aspect_ratio": "9:16",
--     ...
--   },
--   "episodes": [
--     {
--       "id": "episode-id",
--       "title": "第1集",
--       "script": "剧本内容",
--       "description": "分集简介",
--       "duration": 0,
--       "reviewStatus": "pending",
--       "shots": [
--         {
--           "id": "shot-id",
--           "sceneId": "scene-id",
--           "storyboardNumber": 1,
--           "description": "分镜描述",
--           "dialogue": "对白",
--           "action": "动作",
--           "imagePrompt": "图片提示词",
--           "videoPrompt": "视频提示词",
--           "imageUrl": "图片URL",
--           "videoUrl": "视频URL",
--           "duration": 5.0,
--           "storyboardStatus": "pending",
--           "generationStatus": "pending",
--           ...
--         }
--       ]
--     }
--   ],
--   "characters": [
--     {
--       "id": "character-id",
--       "name": "角色名",
--       "description": "描述",
--       "appearance": "外貌",
--       "imageUrl": "图片URL",
--       ...
--     }
--   ],
--   "scenes": [
--     {
--       "id": "scene-id",
--       "location": "地点",
--       "time": "时间",
--       "prompt": "场景提示词",
--       "imageUrl": "图片URL",
--       ...
--     }
--   ],
--   "props": [
--     {
--       "id": "prop-id",
--       "name": "道具名",
--       "description": "描述",
--       "imageUrl": "图片URL",
--       ...
--     }
--   ]
-- }

-- 创建 GIN 索引以提高 JSON 查询性能
CREATE INDEX IF NOT EXISTS drama_projects_episodes_gin_idx ON drama_projects USING GIN ((project_json->'episodes'));
CREATE INDEX IF NOT EXISTS drama_projects_characters_gin_idx ON drama_projects USING GIN ((project_json->'characters'));
CREATE INDEX IF NOT EXISTS drama_projects_scenes_gin_idx ON drama_projects USING GIN ((project_json->'scenes'));

-- 后台配置：提示词模板
CREATE TABLE IF NOT EXISTS drama_lab_prompt_templates (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_key varchar(80),
    name varchar(200) NOT NULL,
    category varchar(32) NOT NULL,
    template text NOT NULL,
    variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT drama_lab_prompt_templates_category CHECK (category IN ('script', 'character', 'scene', 'prop', 'storyboard', 'image', 'video'))
);

ALTER TABLE drama_lab_prompt_templates ADD COLUMN IF NOT EXISTS template_key varchar(80);
ALTER TABLE drama_lab_prompt_templates DROP CONSTRAINT IF EXISTS drama_lab_prompt_templates_category;
ALTER TABLE drama_lab_prompt_templates
    ADD CONSTRAINT drama_lab_prompt_templates_category
    CHECK (category IN ('script', 'character', 'scene', 'prop', 'storyboard', 'image', 'video'));

CREATE INDEX IF NOT EXISTS drama_lab_prompt_templates_user_category_idx
    ON drama_lab_prompt_templates (user_id, category, updated_at DESC)
    WHERE deleted_at IS NULL;

-- Prompt overrides are global inside the Short Drama Lab.  user_id remains
-- as the audit/authorization owner for backwards-compatible rows, but it is
-- deliberately excluded from runtime lookup.
UPDATE drama_lab_prompt_templates
SET template_key = CASE template_key
    WHEN 'story_generation' THEN 'story_expansion_system'
    WHEN 'storyboard_output_format' THEN 'storyboard_user_suffix'
    ELSE template_key
END
WHERE template_key IN ('story_generation', 'storyboard_output_format');

DELETE FROM drama_lab_prompt_templates older
USING drama_lab_prompt_templates newer
WHERE older.template_key IS NOT NULL
  AND older.deleted_at IS NULL
  AND newer.template_key = older.template_key
  AND newer.deleted_at IS NULL
  AND (newer.updated_at, newer.id) > (older.updated_at, older.id);

DROP INDEX IF EXISTS drama_lab_prompt_templates_user_key_idx;
CREATE UNIQUE INDEX IF NOT EXISTS drama_lab_prompt_templates_global_key_idx
    ON drama_lab_prompt_templates (template_key)
    WHERE deleted_at IS NULL AND template_key IS NOT NULL;

-- 后台配置：业务场景
CREATE TABLE IF NOT EXISTS drama_lab_business_scenarios (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(200) NOT NULL,
    aspect_ratio varchar(20) NOT NULL DEFAULT '9:16',
    resolution varchar(32) NOT NULL DEFAULT '1080x1920',
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS drama_lab_business_scenarios_user_updated_idx
    ON drama_lab_business_scenarios (user_id, updated_at DESC)
    WHERE deleted_at IS NULL;

-- 后台配置：短剧生成设置（每个管理员用户一行，避免配置互相覆盖）
CREATE TABLE IF NOT EXISTS drama_lab_generation_settings (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    image_concurrency integer NOT NULL DEFAULT 3,
    video_concurrency integer NOT NULL DEFAULT 1,
    max_batch_size integer NOT NULL DEFAULT 10,
    image_timeout integer NOT NULL DEFAULT 180,
    video_timeout integer NOT NULL DEFAULT 1800,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT drama_lab_generation_settings_image_concurrency CHECK (image_concurrency BETWEEN 1 AND 32),
    CONSTRAINT drama_lab_generation_settings_video_concurrency CHECK (video_concurrency BETWEEN 1 AND 16),
    CONSTRAINT drama_lab_generation_settings_max_batch_size CHECK (max_batch_size BETWEEN 1 AND 100),
    CONSTRAINT drama_lab_generation_settings_image_timeout CHECK (image_timeout BETWEEN 10 AND 3600),
    CONSTRAINT drama_lab_generation_settings_video_timeout CHECK (video_timeout BETWEEN 30 AND 7200)
);

-- 后台配置：Stable Diffusion 2 资产元数据。实际文件存放在 VOZEB_PRO_DATA_DIR 下。
CREATE TABLE IF NOT EXISTS drama_lab_sd2_assets (
    id text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(255) NOT NULL,
    type varchar(32) NOT NULL,
    file_size bigint NOT NULL DEFAULT 0,
    file_path text,
    download_url text,
    mime_type varchar(120),
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT drama_lab_sd2_assets_type CHECK (type IN ('lora', 'checkpoint', 'vae'))
);

CREATE INDEX IF NOT EXISTS drama_lab_sd2_assets_user_type_idx
    ON drama_lab_sd2_assets (user_id, type, updated_at DESC)
    WHERE deleted_at IS NULL;
`;
