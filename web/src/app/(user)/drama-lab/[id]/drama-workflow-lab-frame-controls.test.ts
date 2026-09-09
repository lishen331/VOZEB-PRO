import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workbenchPath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx");

describe("drama lab storyboard frame controls", () => {
    it("keeps tail extraction and candidate acceptance inside the drama-lab APIs", async () => {
        const source = await readFile(workbenchPath, "utf8");
        expect(source).toContain("/extract-tail-frame?episodeId=");
        expect(source).toContain("/accept-first-frame-candidate?");
        expect(source).toContain("replaceExisting");
        expect(source).toContain("firstFrameCandidate");
    });

    it("exposes a visible batch cancellation action while image/video batches run", async () => {
        const source = await readFile(workbenchPath, "utf8");
        expect(source).toContain("batchAbortRef.current?.abort()");
        expect(source).toContain("取消批量任务");
        expect(source).toContain('batchRunning === "image" || batchRunning === "video"');
        expect(source).toContain("已跳过");
        expect(source).toContain("executableCandidates");
    });
    it("scopes recovery to the project and episode instead of callback identity", async () => {
        const source = await readFile(workbenchPath, "utf8");
        expect(source).toContain("const recoveryReloadRef = useRef(onReload)");
        expect(source).toContain("recoveryReloadRef.current = onReload");
        expect(source).toContain("[episodeId, project.id]");
    });

    it("renders per-frame upload and lock controls with independent busy keys", async () => {
        const source = await readFile(workbenchPath, "utf8");
        expect(source).toContain("/frames/upload?episodeId=");
        expect(source).toContain("/frames/${frameType}/lock?episodeId=");
        expect(source).toContain("frame-upload:${frameType}:${shot.id}");
        expect(source).toContain("frame-lock:${frameType}:${shot.id}");
        expect(source).toContain("onUploadFrame");
        expect(source).toContain("onToggleFrameLock");
    });
});
