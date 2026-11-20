import { describe, expect, it } from "vitest";

import { sanitizeAdvancedConfig } from "./image-task-support";

// 任务 config 是从渠道拷贝的。自建网关靠这三个字段才能正确查询和判定成功，
// 一旦在拷贝时被剥掉，轮询会退回 GET、成功响应会被判成失败。
describe("sanitizeAdvancedConfig keeps custom gateway query settings", () => {
    it("keeps queryMethod, body template and success codes", () => {
        const sanitized = sanitizeAdvancedConfig({
            protocol: "custom",
            queryPath: "/aiservice/images/tasks/detail",
            queryMethod: "POST",
            queryBodyTemplate: '{"taskId":"{{taskId}}"}',
            successCodes: ["1"],
        } as never);
        expect(sanitized?.queryMethod).toBe("POST");
        expect(sanitized?.queryBodyTemplate).toBe('{"taskId":"{{taskId}}"}');
        expect(sanitized?.successCodes).toEqual(["1"]);
    });

    it("omits the settings entirely when the channel did not declare them", () => {
        const sanitized = sanitizeAdvancedConfig({ protocol: "openai", queryPath: "/images/generations" } as never);
        expect(sanitized?.queryMethod).toBeUndefined();
        expect(sanitized?.successCodes).toBeUndefined();
    });
});
