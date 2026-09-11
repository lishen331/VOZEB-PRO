import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const files = new Map<string, unknown>();
    return { files, getDatabaseProvider: vi.fn(() => "file"), readJsonDataFile: vi.fn(), writeJsonDataFile: vi.fn(), withJsonDataFileLock: vi.fn() };
});

vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: mocks.getDatabaseProvider, ensurePostgresSchema: vi.fn(), postgresQuery: vi.fn() }));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: mocks.readJsonDataFile,
    writeJsonDataFile: mocks.writeJsonDataFile,
    withJsonDataFileLock: mocks.withJsonDataFileLock,
}));

import { addDramaLabStoryOption, listDramaLabStoryOptions } from "./drama-lab-story-options-service";

describe("drama lab account story options", () => {
    beforeEach(() => {
        mocks.files.clear();
        mocks.readJsonDataFile.mockImplementation(async (_name: string, fallback: unknown) => structuredClone(mocks.files.get(_name) ?? fallback));
        mocks.writeJsonDataFile.mockImplementation(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value)));
        mocks.withJsonDataFileLock.mockImplementation(async (_name: string, callback: () => Promise<unknown>) => callback());
    });

    it("persists custom styles/types per account and lists them across projects", async () => {
        await addDramaLabStoryOption("user-1", "style", "赛博朋克悬疑");
        await addDramaLabStoryOption("user-1", "type", "职场复仇");
        await addDramaLabStoryOption("user-2", "style", "只属于另一个账号");

        await expect(listDramaLabStoryOptions("user-1")).resolves.toEqual({ styles: ["赛博朋克悬疑"], types: ["职场复仇"] });
        await expect(listDramaLabStoryOptions("user-2")).resolves.toEqual({ styles: ["只属于另一个账号"], types: [] });
    });

    it("deduplicates the same custom value", async () => {
        await addDramaLabStoryOption("user-1", "style", "都市现实");
        const duplicate = await addDramaLabStoryOption("user-1", "style", "都市现实");
        expect(duplicate).toEqual({ kind: "style", value: "都市现实" });
        await expect(listDramaLabStoryOptions("user-1")).resolves.toEqual({ styles: ["都市现实"], types: [] });
    });
});
