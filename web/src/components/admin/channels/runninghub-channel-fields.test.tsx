import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { SystemModelChannel } from "@/lib/auth/store";
import { ChannelPurposeControl, RunningHubChannelFields } from "./runninghub-channel-fields";

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
    it("renders the fixed practice-channel notice without generic async contract controls", () => {
        const markup = renderToStaticMarkup(
            <>
                <ChannelPurposeControl channel={channel} onChange={vi.fn()} />
                <RunningHubChannelFields channel={channel} onChange={vi.fn()} />
            </>,
        );
        expect(markup).toContain("无限练习");
        expect(markup).toContain("RunningHub 无限练习渠道");
        expect(markup).toContain("RunningHub 官方文档");
        expect(markup).not.toContain("创建路径");
        expect(markup).not.toContain("查询路径");
        expect(markup).not.toContain("请求模板");
        expect(markup).not.toContain("任务 ID 字段");
    });
});
