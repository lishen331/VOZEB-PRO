import { describe, expect, it } from "vitest";

import { dramaLabCanvasProjectHandoffPrefix, dramaLabEpisodeCanvasHandoffId, parseDramaLabEpisodeCanvasHandoffId } from "./drama-lab-canvas-contract";

describe("drama lab canvas handoff contract", () => {
    it("parses the owning project and episode from a dedicated canvas handoff", () => {
        expect(parseDramaLabEpisodeCanvasHandoffId("drama-lab-canvas:drama-one:episode:episode-one")).toEqual({ projectId: "drama-one", episodeId: "episode-one" });
    });

    it("uses the final episode separator when the project id contains the same token", () => {
        expect(parseDramaLabEpisodeCanvasHandoffId("drama-lab-canvas:drama:episode:source:episode:episode-one")).toEqual({ projectId: "drama:episode:source", episodeId: "episode-one" });
    });

    it("round-trips reserved separator tokens without allowing handoff collisions", () => {
        const first = dramaLabEpisodeCanvasHandoffId("drama-one", "foo:episode:e2");
        const second = dramaLabEpisodeCanvasHandoffId("drama-one:episode:foo", "e2");

        expect(first).not.toBe(second);
        expect(first).toBe(`${dramaLabCanvasProjectHandoffPrefix("drama-one")}foo%3Aepisode%3Ae2`);
        expect(second).toBe(`${dramaLabCanvasProjectHandoffPrefix("drama-one:episode:foo")}e2`);
        expect(parseDramaLabEpisodeCanvasHandoffId(first)).toEqual({ projectId: "drama-one", episodeId: "foo:episode:e2" });
        expect(parseDramaLabEpisodeCanvasHandoffId(second)).toEqual({ projectId: "drama-one:episode:foo", episodeId: "e2" });
    });

    it("round-trips percent signs and unicode ids", () => {
        const handoff = dramaLabEpisodeCanvasHandoffId("短剧%一", "第 1 集");
        expect(parseDramaLabEpisodeCanvasHandoffId(handoff)).toEqual({ projectId: "短剧%一", episodeId: "第 1 集" });
    });

    it.each(["", "handoff-one", "drama-lab-canvas::episode:episode-one", "drama-lab-canvas:drama-one:episode:", "drama-lab-canvas:drama%ZZ:episode:episode-one"])("rejects an invalid handoff: %s", (value) => {
        expect(parseDramaLabEpisodeCanvasHandoffId(value)).toBeNull();
    });
});
