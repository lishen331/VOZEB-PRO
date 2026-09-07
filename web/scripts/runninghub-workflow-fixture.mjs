import http from "node:http";

const port = Number(process.env.VOZEB_PRO_RUNNINGHUB_FIXTURE_PORT || 4030);
let nextId = 1;
const tasks = new Map();
const uploads = [];
const queries = [];

function json(res, status, value) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(value));
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (req.method === "GET" && url.pathname === "/health") return json(res, 200, { ok: true });
    if (req.method === "POST" && url.pathname === "/__reset") {
        tasks.clear();
        uploads.length = 0;
        queries.length = 0;
        nextId = 1;
        return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/openapi/getJsonApiFormat") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        if (!/^\d+$/.test(String(parsed.workflowId || ""))) return json(res, 400, { code: 400, message: "workflow id required" });
        const workflowNodes = { 138: { class_type: "TextInput", inputs: { value: "{{prompt}}" } }, 147: { class_type: "LoadImage", inputs: { image: "default.png" } }, 92: { class_type: "SaveVideo", inputs: { video: ["77", 0] } } };
        return json(res, 200, {
            code: 0,
            data: {
                workflowType: "MiniMaxH3ReferenceToVideo",
                prompt: JSON.stringify(workflowNodes),
            },
        });
    }
    if (req.method === "GET" && url.pathname === "/__state") return json(res, 200, { tasks: [...tasks.values()].map(publicTask), uploads, queries });
    if (req.method === "POST" && url.pathname === "/openapi/v2/task/create") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        const id = `fixture-task-${nextId++}`;
        const failed = parsed.nodeInfoList?.some((item) => String(item.fieldValue || "").includes("__FAIL__"));
        tasks.set(id, { id, status: failed ? "FAILED" : "SUCCESS", kind: workflowKind(parsed.workflowId), payload: parsed });
        return json(res, 200, { code: 0, data: { taskId: id } });
    }
    const query = url.pathname.match(/^\/openapi\/v2\/task\/query\/([^/]+)$/);
    if (req.method === "GET" && query) {
        const task = tasks.get(query[1]);
        if (!task) return json(res, 404, { code: 404, message: "task not found" });
        return json(res, 200, { code: 0, data: { status: task.status, result: task.status === "SUCCESS" ? resultUrl(task.kind) : undefined, error: task.status === "FAILED" ? "fixture task rejected" : undefined } });
    }
    if (req.method === "POST" && url.pathname === "/openapi/v2/media/upload/binary") {
        const body = await readBody(req);
        const filenameMatch = body.match(/filename=(?:"([^"]+)"|([^;\r\n]+))/i);
        const filename = filenameMatch?.[1] || filenameMatch?.[2]?.trim();
        if (filename) uploads.push(filename);
        return json(res, 200, { code: 0, data: { fileName: "api/fixture/uploaded-media.png" } });
    }
    if (req.method === "POST" && url.pathname === "/task/openapi/create") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        const id = `fixture-task-${nextId++}`;
        const failed = parsed.nodeInfoList?.some((item) => String(item.fieldValue || "").includes("__FAIL__"));
        tasks.set(id, { id, status: failed ? "FAILED" : "SUCCESS", kind: workflowKind(parsed.workflowId), payload: parsed });
        return json(res, 200, { code: 0, data: { taskId: id } });
    }
    if (req.method === "POST" && url.pathname === "/openapi/v2/query") {
        const body = await readBody(req);
        const parsed = body ? JSON.parse(body) : {};
        if (!String(parsed.apiKey || "").trim() || !String(parsed.taskId || "").trim()) return json(res, 400, { code: 400, message: "apiKey and taskId required" });
        queries.push({ taskId: String(parsed.taskId), hasApiKey: true });
        const task = tasks.get(parsed.taskId);
        if (!task) return json(res, 404, { code: 404, message: "task not found" });
        const url = resultUrl(task.kind);
        return json(
            res,
            200,
            task.status === "SUCCESS"
                ? { status: task.status, results: [{ url, fileUrl: url, fileType: fileType(task.kind), nodeId: outputNodeId(task), taskCostTime: "3128" }] }
                : { status: task.status, failedReason: "fixture task rejected", results: [] },
        );
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

function workflowKind(workflowId) {
    if (String(workflowId) === "2090436770948272130") return "audio";
    if (String(workflowId) === "2079446871415808002") return "video";
    return "image";
}

function resultUrl(kind) {
    return "https://fixture.invalid/runninghub-result." + (kind === "audio" ? "mp3" : kind === "image" ? "png" : "mp4");
}

function fileType(kind) {
    return kind === "audio" ? "AUDIO" : kind === "video" ? "VIDEO" : "IMAGE";
}

function outputNodeId(task) {
    return (
        {
            "2090436762698080258": "35",
            "2090436220538150914": "67",
            "2090436223860039681": "424",
            "2090436537182932994": "29",
            "2090436770948272130": "90",
            "2079446871415808002": "75",
            "2090436199843454978": "92",
        }[String(task.payload?.workflowId)] || "first-output"
    );
}

function publicTask(task) {
    const { apiKey: _apiKey, ...payload } = task.payload || {};
    return { ...task, payload };
}
