import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePracticeAccess: vi.fn() }));
vi.mock("@/lib/server/practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));

import { createPracticeSessionForUser, getPracticeSessionForUser, type PracticeSessionStore } from "./practice-session-service";

function memoryStore(): PracticeSessionStore {
    const records = new Map<string, any>();
    const requests = new Map<string, string>();
    return {
        getByRequest: vi.fn(async (userId, clientRequestId) => records.get(requests.get(`${userId}:${clientRequestId}`) || "") || null),
        create: vi.fn(async (input) => {
            const key = `${input.userId}:${input.clientRequestId}`;
            const existing = records.get(requests.get(key) || "");
            if (existing) return existing;
            const record = { ...input, executionProfile: "open-source-practice", createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z" };
            records.set(input.id, record);
            requests.set(key, input.id);
            return record;
        }),
        get: vi.fn(async (userId, id) => {
            const record = records.get(id);
            return record?.userId === userId ? record : null;
        }),
        update: vi.fn(async (userId, id, patch) => {
            const record = records.get(id);
            if (!record || record.userId !== userId) return null;
            const updated = { ...record, ...patch };
            records.set(id, updated);
            return updated;
        }),
    };
}

describe("practice sessions", () => {
    it("dispatches once for an idempotent client request and keeps provider details private", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-one", taskType: "image" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-image", capability: "image" as const }));
        const input = { module: "storyboard-image" as const, title: "镜头练习", input: { prompt: "雨夜车站" }, clientRequestId: "request-one" };

        const first = await createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel });
        const retry = await createPracticeSessionForUser({ id: "student-one", role: "user" }, input, { store, dispatch, resolveModel });

        expect(retry.id).toBe(first.id);
        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ executionProfile: "open-source-practice", capability: "image", logicalModelId: "practice-image", clientRequestId: "request-one" }));
        expect(first).toMatchObject({ status: "running", taskRefs: [{ taskId: "task-one", taskType: "image" }] });
        expect(first).not.toHaveProperty("prompt");
        expect(first).not.toHaveProperty("provider");
    });

    it("returns only the current user's stable public result", async () => {
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "student-one", role: "student" });
        const store = memoryStore();
        const dispatch = vi.fn(async () => ({ taskId: "task-one", taskType: "text" as const }));
        const resolveModel = vi.fn(async () => ({ logicalModelId: "practice-text", capability: "text" as const }));
        const created = await createPracticeSessionForUser({ id: "student-one", role: "user" }, { module: "script", title: "剧本练习", input: { prompt: "开场" }, clientRequestId: "request-two" }, { store, dispatch, resolveModel });

        await expect(getPracticeSessionForUser({ id: "student-one", role: "user" }, created.id, { store })).resolves.toMatchObject({ id: created.id, input: { prompt: "开场" } });
        await expect(getPracticeSessionForUser({ id: "other-user", role: "user" }, created.id, { store })).rejects.toMatchObject({ status: 404 });
    });
});
