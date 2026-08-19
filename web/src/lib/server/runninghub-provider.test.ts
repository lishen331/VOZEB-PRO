import { describe, expect, it, vi } from "vitest";

import { queryRunningHubTask, submitRunningHubTask, uploadRunningHubMedia } from "./runninghub-provider";

const config = {
    protocol: "runninghub" as const,
    createPath: "/openapi/v2/task/create",
    queryPath: "/openapi/v2/task/status/:task_id",
    taskIdField: "data.taskId",
    resultField: "data.output.download_url",
    statusField: "data.status",
};

describe("RunningHub provider", () => {
    it("uses bearer auth and configured base/create path without guessing", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/openapi/v2/task/create");
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
            return Response.json({ data: { taskId: "task-one", status: "queued" } });
        });

        await expect(submitRunningHubTask({ baseUrl: "https://runninghub.example/", apiKey: "secret", config, payload: { node: "workflow" }, fetchImpl })).resolves.toMatchObject({ taskId: "task-one" });
    });

    it("requires configured create/query paths and response fields", async () => {
        const fetchImpl = vi.fn();
        await expect(submitRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config: { ...config, createPath: "" }, payload: {}, fetchImpl })).rejects.toThrow("createPath");
        await expect(queryRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config: { ...config, queryPath: "" }, taskId: "task-one", fetchImpl })).rejects.toThrow("queryPath");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("reads only configured status/result fields", async () => {
        const fetchImpl = vi.fn(async () => Response.json({ data: { status: "success", output: { download_url: "https://cdn.example/result.mp4" }, result: "wrong" } }));

        await expect(queryRunningHubTask({ baseUrl: "https://runninghub.example", apiKey: "secret", config, taskId: "task one", fetchImpl })).resolves.toEqual({ status: "success", resultUrl: "https://cdn.example/result.mp4", raw: expect.any(Object) });
    });

    it("uploads media through the documented binary endpoint and returns short-lived download_url", async () => {
        const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            expect(String(input)).toBe("https://runninghub.example/openapi/v2/media/upload/binary");
            expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
            expect(init?.body).toBeInstanceOf(FormData);
            return Response.json({ data: { download_url: "https://cdn.example/uploaded.png" } });
        });

        await expect(uploadRunningHubMedia({ baseUrl: "https://runninghub.example", apiKey: "secret", file: new Blob(["image"], { type: "image/png" }), fileName: "reference.png", fetchImpl })).resolves.toBe("https://cdn.example/uploaded.png");
    });
});
