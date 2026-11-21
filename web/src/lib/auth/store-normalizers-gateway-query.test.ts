import { describe, expect, it } from "vitest";

import { normalizeSystemChannelAdvancedConfig } from "./store-normalizers";

// 这些字段一旦被规范化函数丢掉，渠道调用会静默退回默认行为
// （GET 查询 + 标准成功码白名单），表现为上游一直失败，很难排查。
describe("custom gateway query settings survive normalization", () => {
    it("keeps queryMethod and successCodes at channel level", () => {
        const normalized = normalizeSystemChannelAdvancedConfig({
            protocol: "custom",
            queryPath: "/aiservice/images/tasks/detail",
            queryMethod: "POST",
            successCodes: ["1"],
        } as never);
        expect(normalized?.queryMethod).toBe("POST");
        expect(normalized?.successCodes).toEqual(["1"]);
    });

    it("keeps the query body template", () => {
        const normalized = normalizeSystemChannelAdvancedConfig({
            protocol: "custom",
            queryMethod: "POST",
            queryBodyTemplate: '{"taskId":"{{taskId}}","verbose":true}',
        } as never);
        expect(normalized?.queryBodyTemplate).toBe('{"taskId":"{{taskId}}","verbose":true}');
    });

    it("keeps per-model query settings inside modelConfigs", () => {
        const normalized = normalizeSystemChannelAdvancedConfig({
            protocol: "custom",
            modelConfigs: {
                "cdance2.0-0807": {
                    capability: "video",
                    queryPath: "/aiservice/videos/tasks/detail",
                    queryMethod: "POST",
                    successCodes: ["1"],
                },
            },
        } as never);
        expect(normalized?.modelConfigs?.["cdance2.0-0807"]).toMatchObject({
            queryMethod: "POST",
            successCodes: ["1"],
        });
    });

    it("drops the method when it is neither GET nor POST", () => {
        const normalized = normalizeSystemChannelAdvancedConfig({ protocol: "custom", queryMethod: "PATCH" } as never);
        expect(normalized?.queryMethod).toBeUndefined();
    });
});
