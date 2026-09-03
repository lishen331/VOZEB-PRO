import { describe, expect, it } from "vitest";

import { DRAMA_LAB_SCHEMA_SQL } from "./schema-drama-lab";

describe("Drama Lab schema compatibility migration", () => {
    it("copies only missing legacy generation keys from the newest row", () => {
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("'generation_settings'");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("ORDER BY updated_at DESC, id DESC");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("FROM drama_lab_generation_settings");
        expect(DRAMA_LAB_SCHEMA_SQL).toMatch(/FROM drama_lab_generation_settings\s+WHERE deleted_at IS NULL\s+ORDER BY updated_at DESC, id DESC/);
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("UPDATE app_settings AS settings");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("? 'image'");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("? 'video'");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("? 'dramaMaxBatchSize'");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("? 'dramaImageTimeoutSeconds'");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("? 'dramaVideoTimeoutSeconds'");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("jsonb_build_object('image', legacy.image_concurrency)");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("jsonb_build_object('video', legacy.video_concurrency)");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("jsonb_build_object('dramaMaxBatchSize', legacy.max_batch_size)");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("jsonb_build_object('dramaImageTimeoutSeconds', legacy.image_timeout)");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("jsonb_build_object('dramaVideoTimeoutSeconds', legacy.video_timeout)");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("OR NOT ((CASE WHEN jsonb_typeof(settings.generation_defaults)");
    });

    it("keeps global prompt overrides after the last editor account is deleted", () => {
        const promptTable = DRAMA_LAB_SCHEMA_SQL.match(/CREATE TABLE IF NOT EXISTS drama_lab_prompt_templates \((.|\n)*?\n\);/)?.[0] || "";
        expect(promptTable).toContain("user_id text REFERENCES users(id) ON DELETE SET NULL");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("ALTER TABLE drama_lab_prompt_templates ALTER COLUMN user_id DROP NOT NULL");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL");
        expect(promptTable).not.toContain("user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("DROP CONSTRAINT IF EXISTS drama_lab_prompt_templates_user_id_fkey");
        expect(DRAMA_LAB_SCHEMA_SQL).toContain("DROP CONSTRAINT IF EXISTS vozeb_pro_drama_lab_prompt_templates_user_id_fkey");
    });
});
