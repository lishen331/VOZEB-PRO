import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ provider: "file", records: [] as unknown[], postgresQuery: vi.fn() }));
vi.mock("@/lib/server/database", () => ({ ensurePostgresSchema: vi.fn(), getDatabaseProvider: () => mocks.provider, postgresQuery: mocks.postgresQuery }));
vi.mock("@/lib/server/data-adapter", () => ({ readJsonDataFile: async () => mocks.records }));

import { queryStoredGenerationTasks } from "./generation-task-store";

const options = { userId: "student-a", localEditSchoolId: "school-a", statuses: ["success"], limit: 5 };

function row(id: string, createdAt: number, override: Record<string, unknown> = {}, payloadOverride: Record<string, unknown> = {}) {
    return {
        id,
        userId: "student-a",
        schoolId: "school-a",
        type: "image",
        status: "success",
        executionProfile: "open-source-practice",
        expiresAt: Date.now() + 60_000,
        createdAt,
        updatedAt: 999 - createdAt,
        payload: { id, source: "practice", kind: "edit", title: "局部编辑", mask: { url: "/mask.png" }, ...payloadOverride },
        ...override,
    };
}

describe("local edit history query", () => {
    beforeEach(() => {
        mocks.provider = "file";
        mocks.records = [];
        mocks.postgresQuery.mockReset();
    });

    it("filters by user, school, expiration, status and tool before taking five newest submissions", async () => {
        mocks.records = [
            row("other-user", 100, { userId: "student-b" }),
            row("other-school", 99, { schoolId: "school-b" }),
            row("expired", 98, { expiresAt: Date.now() - 1 }),
            row("not-finished", 97, { status: "error" }),
            row("production", 96, { executionProfile: "production" }),
            row("other-tool", 95, {}, { title: "表情参考" }),
            row("no-mask", 94, {}, { mask: null }),
            ...Array.from({ length: 7 }, (_, i) => row(`valid-${i}`, i)),
        ];
        const result = await queryStoredGenerationTasks<{ id: string }>("image", options);
        expect(result.map((task) => task.id)).toEqual(["valid-6", "valid-5", "valid-4", "valid-3", "valid-2"]);
    });

    it("pushes all mandatory filters and the limit into PostgreSQL", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [] });
        await queryStoredGenerationTasks("image", options);
        const [sql, values] = mocks.postgresQuery.mock.calls[0];
        for (const filter of [
            "user_id = $1",
            "task_type = $2",
            "expires_at > now()",
            "school_id = $3",
            "execution_profile = 'open-source-practice'",
            "payload->>'source' = 'practice'",
            "payload->>'kind' = 'edit'",
            "payload->>'title' = '局部编辑'",
            "jsonb_typeof(payload->'mask') = 'object'",
            "status = ANY($4::text[])",
            "ORDER BY created_at DESC, id DESC LIMIT $5",
        ])
            expect(sql).toContain(filter);
        expect(values).toEqual(["student-a", "image", "school-a", ["success"], 5]);
    });
});
