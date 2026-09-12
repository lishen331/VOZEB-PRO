import { BUILTIN_SCRIPT_SKILLS, scriptAgentProfileDefaults } from "./script-agent-skills";
import type { QueryExecutor } from "./database/postgres";

export async function seedBuiltinScriptAgentConfiguration(db: QueryExecutor) {
    for (const skill of BUILTIN_SCRIPT_SKILLS) {
        await db.query(
            `INSERT INTO practice_script_skills (id, name, description, category, enabled, applicable_agents, current_version)
             VALUES ($1, $2, $3, $4, true, $5::jsonb, $6)
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, applicable_agents = EXCLUDED.applicable_agents`,
            [skill.id, skill.name, skill.description, skill.category, JSON.stringify(skill.agents), skill.version],
        );
        await db.query(
            `INSERT INTO practice_script_skill_versions (skill_id, version, markdown_content, content_hash, source_license)
             VALUES ($1, $2, $3, $4, 'VOZEB-PRO original') ON CONFLICT (skill_id, version) DO NOTHING`,
            [skill.id, skill.version, skill.markdown, skill.contentHash],
        );
    }
    for (const profile of scriptAgentProfileDefaults()) {
        await db.query(
            `INSERT INTO practice_script_agent_profiles (agent_key, name, reasoning_mode, batch_config, tool_allowlist, skill_bindings)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
             ON CONFLICT (agent_key) DO NOTHING`,
            [profile.agentKey, profile.name, profile.reasoningMode, JSON.stringify(profile.batchConfig), JSON.stringify(profile.toolAllowlist), JSON.stringify(profile.skillBindings)],
        );
    }
}
