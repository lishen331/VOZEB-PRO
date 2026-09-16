import { BUILTIN_SCRIPT_SKILLS, scriptAgentProfileDefaults } from "./script-agent-skills";
import type { QueryExecutor } from "./database/postgres";

export async function seedBuiltinScriptAgentConfiguration(db: QueryExecutor) {
    for (const skill of BUILTIN_SCRIPT_SKILLS) {
        const existing = await db.query<{ current_version?: unknown; content_hash?: unknown }>(
            "SELECT current_version, content_hash FROM vozeb_pro_practice_script_skills s LEFT JOIN vozeb_pro_practice_script_skill_versions v ON v.skill_id = s.id AND v.version = s.current_version WHERE s.id = $1",
            [skill.id],
        );
        const previous = existing.rows[0];
        const previousHash = typeof previous?.content_hash === "string" ? previous.content_hash : "";
        const previousVersion = Number(previous?.current_version || 0);
        const version = previousHash && previousHash !== skill.contentHash ? Math.max(skill.version, previousVersion + 1) : skill.version;
        await db.query(
            `INSERT INTO vozeb_pro_practice_script_skills (id, name, description, category, enabled, applicable_agents, current_version)
             VALUES ($1, $2, $3, $4, true, $5::jsonb, $6)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, applicable_agents = EXCLUDED.applicable_agents, current_version = CASE WHEN EXCLUDED.current_version > vozeb_pro_practice_script_skills.current_version THEN EXCLUDED.current_version ELSE vozeb_pro_practice_script_skills.current_version END`,
            [skill.id, skill.name, skill.description, skill.category, JSON.stringify(skill.agents), version],
        );
        await db.query(
            `INSERT INTO vozeb_pro_practice_script_skill_versions (skill_id, version, markdown_content, content_hash, source_license)
             VALUES ($1, $2, $3, $4, 'VOZEB-PRO original') ON CONFLICT (skill_id, version) DO NOTHING`,
            [skill.id, version, skill.markdown, skill.contentHash],
        );
    }
    for (const profile of scriptAgentProfileDefaults()) {
        await db.query(
            `INSERT INTO vozeb_pro_practice_script_agent_profiles (agent_key, name, reasoning_mode, batch_config, tool_allowlist, skill_bindings)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
             ON CONFLICT (agent_key) DO NOTHING`,
            [profile.agentKey, profile.name, profile.reasoningMode, JSON.stringify(profile.batchConfig), JSON.stringify(profile.toolAllowlist), JSON.stringify(profile.skillBindings)],
        );
    }
}
