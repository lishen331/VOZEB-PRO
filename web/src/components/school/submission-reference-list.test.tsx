import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SubmissionReferenceList } from "./submission-reference-list";

describe("SubmissionReferenceList", () => {
    it("renders every media type and unavailable references", () => {
        const html = renderToStaticMarkup(
            <SubmissionReferenceList
                references={[
                    { reference: { type: "asset", id: "image-a" }, title: "图片", mediaType: "image", previewUrl: "/image.png", availability: "available" },
                    { reference: { type: "generation", id: "video-a" }, title: "视频", mediaType: "video", previewUrl: "/video.mp4", availability: "available" },
                    { reference: { type: "generation", id: "audio-a" }, title: "音频", mediaType: "audio", previewUrl: "/audio.mp3", availability: "available" },
                    { reference: { type: "work", id: "text-a" }, title: "文本", mediaType: "text", availability: "available" },
                    { reference: { type: "canvas", id: "deleted" }, title: "已删除成果", mediaType: "unknown", availability: "unavailable" },
                ]}
            />,
        );

        expect(html).toContain("图片");
        expect(html).toContain("<img");
        expect(html).toContain("<video");
        expect(html).toContain("<audio");
        expect(html).toContain("文本成果，无在线预览");
        expect(html).toContain("成果当前不可用");
    });
});
