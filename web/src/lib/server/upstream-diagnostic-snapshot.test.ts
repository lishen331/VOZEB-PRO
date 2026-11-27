import { describe, expect, it } from "vitest";
import { appendDiagnosticEvent, diagnosticPayloadJson, sanitizeDiagnosticEvent } from "./media-task-diagnostics";
import { upstreamRequestSnapshot, upstreamResponseSnapshot } from "./upstream-diagnostic-snapshot";

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).buffer;

describe("upstream diagnostic snapshots", () => {
    it("preserves final parameters and reference order, but strips secrets and inline media", () => {
        const body = bytes({
            model: "vendor",
            prompt: "最终提示词",
            n: 2,
            references: ["https://cdn.example/a.png?X-Amz-Signature=private", "data:image/png;base64,QUJD", "https://cdn.example/b.png"],
            headers: { Authorization: "private" },
            apiKey: "private",
            nested: { access_token: "private" },
            custom: "private",
        });
        const requestBody = upstreamRequestSnapshot(body, ["private"]);
        const sanitized = sanitizeDiagnosticEvent({ phase: "upstream_request", operation: "create", requestBody });
        expect(sanitized.operation).toBe("create");
        expect(JSON.parse(String(sanitized.requestBody))).toMatchObject({ model: "vendor", prompt: "最终提示词", n: 2, references: ["https://cdn.example/a.png", "[media omitted]", "https://cdn.example/b.png"] });
        expect(JSON.stringify(sanitized)).not.toMatch(/private|QUJD/);
    });

    it("keeps multipart prompt, repeated files in order and no filenames or bytes", () => {
        const form = new FormData();
        form.set("prompt", "结合两张图");
        form.append("image[]", new File(["one"], "private-a.png", { type: "image/png" }));
        form.append("image[]", new File(["longer"], "private-b.png", { type: "image/png" }));
        const snapshot = upstreamRequestSnapshot(form);
        expect(JSON.parse(String(snapshot))).toMatchObject({
            prompt: "结合两张图",
            "image[]": [
                { type: "image/png", bytes: 3 },
                { type: "image/png", bytes: 6 },
            ],
        });
        expect(snapshot).not.toContain("private");
    });

    it("distinguishes task IDs, HTTP 200 business failures and result URLs", () => {
        const queued = upstreamResponseSnapshot(bytes({ code: 0, data: { taskId: "vendor-57", status: "running" } }));
        expect(queued).toMatchObject({ upstreamTaskId: "vendor-57", state: "running" });
        const success = upstreamResponseSnapshot(bytes({ data: [{ url: "https://cdn.example/out.png?token=foo" }], id: "req-id", usage: { count: 1 } }));
        expect(success.upstreamTaskId).toBeUndefined();
        expect(JSON.parse(String(success.upstreamResultUrls))).toEqual(["https://cdn.example/out.png"]);
        expect(success.responseBody).toContain("https://cdn.example/out.png");
        expect(success.responseBody).not.toContain("foo");
        const failure = upstreamResponseSnapshot(bytes({ data: { taskId: "vendor-57", status: "failed", error: { code: "BAD_DIMENSION", message: "wrong size Bearer private" } } }));
        expect(failure).toMatchObject({ upstreamTaskId: "vendor-57", state: "failed", errorCode: "BAD_DIMENSION", errorMessage: "wrong size [redacted]" });
    });

    it("reports blue-cloud business failures with the nested error rather than the successful HTTP envelope", () => {
        const options = { taskIdField: "result.taskId", statusField: "result.status", resultField: "result.result.images", successCodes: ["1"], httpOk: true };
        const rejected = upstreamResponseSnapshot(bytes({ code: 1, msg: "ok", result: { taskId: "blue-one", status: "FAILED", result: {}, errorCode: "BIZ_ERROR", errorMessage: "provider rejected the request" } }), options);
        expect(rejected).toMatchObject({ upstreamTaskId: "blue-one", state: "FAILED", errorCode: "BIZ_ERROR", errorMessage: "provider rejected the request" });
        const pending = upstreamResponseSnapshot(bytes({ code: 1, msg: "ok", result: { taskId: "blue-one", status: "PENDING" } }), options);
        expect(pending).toMatchObject({ upstreamTaskId: "blue-one", state: "PENDING" });
        expect(pending.errorMessage).toBeUndefined();
        const completed = upstreamResponseSnapshot(
            bytes({ code: 1, result: { taskId: "blue-one", status: "SUCCEEDED", result: { images: [{ url: "https://cdn.example/result.png?sig=hidden" }], inputImages: [{ url: "https://cdn.example/input.png" }] } } }),
            options,
        );
        expect(JSON.parse(String(completed.upstreamResultUrls))).toEqual(["https://cdn.example/result.png"]);
    });

    it("keeps the submitted request/response and newest evidence through frequent polls", () => {
        let events = appendDiagnosticEvent([], { phase: "task_created" }, 1);
        events = appendDiagnosticEvent(events, { phase: "upstream_request", operation: "create", requestBody: JSON.stringify({ prompt: "之前提交" }) }, 2);
        events = appendDiagnosticEvent(events, { phase: "upstream_body_complete", operation: "create", upstreamTaskId: "vendor-57", responseBody: JSON.stringify({ taskId: "vendor-57" }) }, 3);
        for (let i = 0; i < 180; i++) events = appendDiagnosticEvent(events, { phase: "upstream_body_complete", operation: "query", responseBody: diagnosticPayloadJson({ text: "测试 ".repeat(600), status: i }) }, i + 4);
        expect(events.some((event) => event.requestBody?.toString().includes("之前提交"))).toBe(true);
        expect(events.some((event) => event.operation === "create" && event.upstreamTaskId === "vendor-57")).toBe(true);
        expect(events.at(-1)?.responseBody).toContain("179");
    });
});
