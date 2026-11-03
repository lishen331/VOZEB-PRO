import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SystemModelChannel } from "@/lib/auth/store";
import { ChannelEnableControls, RunningHubChannelFields } from "./runninghub-channel-fields";

const channel = {
    id: "rh",
    name: "RunningHub",
    baseUrl: "https://runninghub.example",
    apiKey: "secret",
    apiFormat: "openai" as const,
    models: ["workflow-image"],
    enabled: false,
    purpose: "open-source-practice" as const,
    advancedConfig: {
        protocol: "runninghub" as const,
        textModel: "",
        imageModel: "",
        videoModel: "",
        createPath: "",
        queryPath: "",
        requestTemplate: "",
        resultField: "",
        statusField: "",
        durationRange: "",
        referenceRule: "",
        supportsReferenceImage: false,
        supportsReferenceVideo: false,
        supportsReferenceAudio: false,
        modelConfigs: {},
    },
} satisfies SystemModelChannel;

describe("runninghub channel fields", () => {
    it("renders separate production and practice switches plus the fixed practice-channel notice", () => {
        const markup = renderToStaticMarkup(
            <>
                <ChannelEnableControls channel={channel} onChange={vi.fn()} />
                <RunningHubChannelFields channel={channel} onChange={vi.fn()} />
            </>,
        );
        expect(markup).toContain("正式生产");
        expect(markup).toContain("无限练习");
        expect(markup).toContain("RunningHub 渠道只用于无限练习");
        expect(markup).toContain("RunningHub 无限练习渠道");
        expect(markup).toContain("RunningHub 官方文档");
        expect(markup).not.toContain("渠道用途");
        expect(markup).not.toContain("创建路径");
        expect(markup).not.toContain("查询路径");
        expect(markup).not.toContain("请求模板");
        expect(markup).not.toContain("任务 ID 字段");
    });

    it("marks the production switch disabled for runninghub channels", () => {
        const markup = renderToStaticMarkup(<ChannelEnableControls channel={channel} onChange={vi.fn()} />);
        expect(markup).toContain('role="switch" aria-checked="false" disabled=""');
    });
});
