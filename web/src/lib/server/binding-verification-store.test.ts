import { beforeEach, describe, expect, it, vi } from "vitest";
const data = vi.hoisted(() => ({ rows: [] as unknown[] }));
vi.mock("./database", () => ({ getDatabaseProvider: () => "file", ensurePostgresSchema: vi.fn(), postgresQuery: vi.fn() }));
vi.mock("./data-adapter", () => ({
    readJsonDataFile: vi.fn(async () => structuredClone(data.rows)),
    writeJsonDataFile: vi.fn(async (_file: string, rows: unknown[]) => {
        data.rows = structuredClone(rows);
    }),
    withJsonDataFileLock: vi.fn(async (_file: string, callback: () => Promise<unknown>) => callback()),
}));
import { completeBindingVerification, createBindingVerification, getBindingVerification, updateBindingVerification, claimBindingVerification, hasPassedBindingVerification, getPassedBindingVerification } from "./binding-verification-store";
const input = { userId: "u", logicalModelId: "m", bindingId: "b", channelId: "c", capability: "image" as const, fingerprint: "fp", token: "secret", status: "running" as const, phase: "queued", fixtureUrls: [] };
describe("persistent binding proof", () => {
    beforeEach(() => {
        data.rows = [];
    });
    it("reuses an existing running or needs-review run for repeated POST", async () => {
        const first = await createBindingVerification(input);
        expect((await createBindingVerification(input)).id).toBe(first.id);
        await updateBindingVerification(first.id, { status: "needs_review" });
        expect((await createBindingVerification(input)).id).toBe(first.id);
        await updateBindingVerification(first.id, { status: "passed" });
        expect((await createBindingVerification(input)).id).not.toBe(first.id);
    });
    it("only passes exact fingerprint after successful completion", async () => {
        const run = await createBindingVerification(input);
        expect(await hasPassedBindingVerification("fp")).toBe(false);
        await updateBindingVerification(run.id, { status: "failed" });
        expect(await hasPassedBindingVerification("fp")).toBe(false);
        await updateBindingVerification(run.id, { status: "passed", result: { url: "/media/image.png" } });
        expect(await hasPassedBindingVerification("fp")).toBe(true);
        expect(await hasPassedBindingVerification("changed")).toBe(false);
        expect(await getPassedBindingVerification("fp", "other")).toBeNull();
    });
    it("does not grant a second execution while one is in progress", async () => {
        const run = await createBindingVerification(input);
        expect(await claimBindingVerification(run.id, Date.now() + 1000)).not.toBeNull();
        expect(await claimBindingVerification(run.id, Date.now() + 1000)).toBeNull();
        await updateBindingVerification(run.id, { busyUntil: 0 });
        expect(await claimBindingVerification(run.id, Date.now() + 1000)).not.toBeNull();
    });
    it("never passes a late result after the run needs review", async () => {
        const run = await createBindingVerification(input);
        const lease = Date.now() + 1000;
        await claimBindingVerification(run.id, lease);
        await updateBindingVerification(run.id, { status: "needs_review", diagnostics: { requestDigest: "digest" } });
        expect(await completeBindingVerification(run.id, lease, { text: "late" })).toBeNull();
        expect(await hasPassedBindingVerification("fp")).toBe(false);
    });
    it("requires wire evidence and the active lease to pass", async () => {
        const run = await createBindingVerification(input);
        const lease = Date.now() + 1000;
        await claimBindingVerification(run.id, lease);
        expect(await completeBindingVerification(run.id, lease, { text: "result" })).toBeNull();
        await updateBindingVerification(run.id, { diagnostics: { requestDigest: "digest" } });
        expect(await completeBindingVerification(run.id, lease + 1, { text: "result" })).toBeNull();
        expect(await completeBindingVerification(run.id, lease, { text: "result" })).toMatchObject({ status: "passed" });
    });
    it("keeps proof independent from expiring generation tasks", async () => {
        const run = await createBindingVerification(input);
        expect(await getBindingVerification(run.id)).not.toHaveProperty("expiresAt");
    });
});
