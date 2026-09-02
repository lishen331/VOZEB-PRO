import http from "node:http";

const port = Number(process.env.VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT || 4030);
let nextId = 1;
const tasks = new Map();

function json(res, status, value) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
    if (req.method === "POST" && url.pathname === "/__reset") {
        tasks.clear();
        nextId = 1;
        return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/openapi/getJsonApiFormat") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        if (!/^\d+$/.test(String(parsed.workflowId || ""))) return json(res, 400, { code: 400, message: "workflow id required" });
        return json(res, 200, {
            code: 0,
            data: {
                workflowType: "MiniMaxH3ReferenceToVideo",
                nodes: { 138: { class_type: "TextInput", inputs: { value: "{{prompt}}" } }, 147: { class_type: "LoadImage", inputs: { image: "default.png" } }, 92: { class_type: "SaveVideo", inputs: { video: ["77", 0] } } },
            },
        });
    }
    if (req.method === "GET" && url.pathname === "/__state") return json(res, 200, { tasks: [...tasks.values()] });
    if (req.method === "POST" && url.pathname === "/openapi/v2/task/create") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        const id = `fixture-task-${nextId++}`;
        const failed = parsed.nodeInfoList?.some((item) => String(item.fieldValue || "").includes("__FAIL__"));
        tasks.set(id, { id, status: failed ? "FAILED" : "SUCCESS", payload: parsed });
        return json(res, 200, { code: 0, data: { taskId: id } });
    }
    const query = url.pathname.match(/^\/openapi\/v2\/task\/query\/([^/]+)$/);
    if (req.method === "GET" && query) {
        const task = tasks.get(query[1]);
        if (!task) return json(res, 404, { code: 404, message: "task not found" });
        return json(res, 200, { code: 0, data: { status: task.status, result: task.status === "SUCCESS" ? "https://fixture.invalid/runninghub-result.txt" : undefined } });
    }
    if (req.method === "POST" && url.pathname === "/openapi/v2/media/upload/binary") return json(res, 200, { code: 0, data: { download_url: "https://fixture.invalid/uploaded-media.png" } });
    if (req.method === "POST" && url.pathname === "/task/openapi/create") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        const id = `fixture-task-${nextId++}`;
        const failed = parsed.nodeInfoList?.some((item) => String(item.fieldValue || "").includes("__FAIL__"));
        tasks.set(id, { id, status: failed ? "FAILED" : "SUCCESS", payload: parsed });
        return json(res, 200, { code: 0, data: { taskId: id } });
    }
    if (req.method === "POST" && url.pathname === "/openapi/v2/query") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        const task = tasks.get(parsed.taskId);
        if (!task) return json(res, 404, { code: 404, message: "task not found" });
        return json(res, 200, { code: 0, data: { status: task.status, result: task.status === "SUCCESS" ? "https://fixture.invalid/runninghub-result.mp4" : undefined } });
    }
    return json(res, 404, { code: 404, message: "not found" });
});

server.listen(port, "127.0.0.1", () => process.stdout.write(`RunningHub fixture listening on ${port}\n`));

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}
