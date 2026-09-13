import { describe, expect, it, vi } from "vitest";
import { seedBuiltinScriptAgentConfiguration } from "./script-agent-seed";

describe("script Agent configuration seed", () => {
    it("creates a new version when the stored current Skill hash is stale", async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ current_version: 1, content_hash: "old-hash" }] })
            .mockResolvedValue({ rows: [] });
        await seedBuiltinScriptAgentConfiguration({ query } as never);
        const firstSkillVersionInsert = query.mock.calls.find((call) => String(call[0]).includes("INSERT INTO vozeb_pro_practice_script_skill_versions"));
        expect(firstSkillVersionInsert?.[1]?.[1]).toBeGreaterThan(1);
    });

    it("seeds the short-film Skill catalog and profile bindings idempotently", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        await seedBuiltinScriptAgentConfiguration({ query } as never);
        const sql = query.mock.calls.map((call) => String(call[0])).join("\n");
        expect(sql).toContain("vozeb_pro_practice_script_skills");
        expect(sql).toContain("vozeb_pro_practice_script_skill_versions");
        expect(sql).toContain("vozeb_pro_practice_script_agent_profiles");
        const values = query.mock.calls.flatMap((call) => call[1] || []);
        expect(values).toContain("carrier-vlog");
        expect(values).toContain("carrier-tvc");
        expect(values).toContain("purpose-place-seeding");
        expect(values).toContain("relationship-friends");
    });
});
