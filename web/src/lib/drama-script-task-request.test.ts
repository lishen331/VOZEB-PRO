import { describe, expect, it } from "vitest";

import { createDramaScriptTaskRequest } from "./drama-script-task-request";

describe("createDramaScriptTaskRequest", () => {
    it("leaves model selection to the configured default text model", () => {
        const request = createDramaScriptTaskRequest({
            projectId: "drama-one",
            episodeId: "episode-one",
            prompt: "请创作一个短剧剧本",
            requestId: "drama-script:drama-one:episode-one:1",
        });

        expect(request).not.toHaveProperty("config");
        expect(request.context).toEqual({
            surface: "drama",
            projectId: "drama-one",
            episodeId: "episode-one",
            clientRequestId: "drama-script:drama-one:episode-one:1",
        });
        expect(request.messages).toEqual([{ role: "user", content: "请创作一个短剧剧本" }]);
    });
});
