import { describe, expect, it } from "vitest";

import { authorizeSystemAiProxyRequest } from "./system-ai-proxy-policy";

const logicalModels = [
    {
        id: "doubao-seedance-2-0",
        name: "视频",
        capability: "video" as const,
        enabled: true,
        bindings: [{ id: "b", channelId: "mohui", upstreamModel: "doubao-seedance-2-0", enabled: true, priority: 1 }],
    },
];

const base = {
    search: "",
    channelId: "mohui",
    upstreamModel: "doubao-seedance-2-0",
    logicalModels,
    apiFormat: "openai" as const,
    paths: { create: ["/v1/videos/generations"], query: ["/v1/videos/generations/:task_id"] },
};

describe("模汇 Seedance proxy paths", () => {
    it("treats POST /v1/videos/generations as create, not as a query for task 'generations'", () => {
        expect(authorizeSystemAiProxyRequest({ ...base, method: "POST", path: ["v1", "videos", "generations"], pointsUsageKind: "video" })).toMatchObject({ allowed: true, operation: "create" });
    });

    it("still treats GET /v1/videos/generations/:id as a query", () => {
        expect(authorizeSystemAiProxyRequest({ ...base, method: "GET", path: ["v1", "videos", "generations", "task_abc"] })).toMatchObject({ allowed: true, operation: "query", upstreamTaskId: "task_abc" });
    });
});
