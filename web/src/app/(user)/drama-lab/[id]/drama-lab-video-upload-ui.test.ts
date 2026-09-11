import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";

describe("drama lab storyboard video upload", () => {
    it("provides a persisted video upload action beside storyboard video generation", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("const uploadVideo = async (shot: Shot, file: File)");
        expect(source).toContain("/video/upload?episodeId=${encodeURIComponent(episode.id)}");
        expect(source).toContain("onUploadVideo={uploadVideo}");
        expect(source).toContain('accept="video/mp4,video/webm,video/quicktime"');
        expect(source).toContain('aria-label="选择分镜视频文件"');
        expect(source).toContain("上传分镜视频");
        expect(source.indexOf("生成分镜视频")).toBeLessThan(source.indexOf("上传分镜视频"));
    });
});
