import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ saveAs: vi.fn() }));
vi.mock("file-saver", () => ({ saveAs: mocks.saveAs }));
import { agentMediaDownloadName, downloadAgentMedia } from "./agent-media-download";
describe("audio download", () => {
    it("keeps MP3 format and uses the existing media download route", () => {
        expect(agentMediaDownloadName("audio", "配音", "/voice.mp3", "audio/mpeg")).toMatch(/\.mp3$/);
        downloadAgentMedia([{ type: "audio", title: "配音", url: "/api/reference-assets/voice.mp3", mimeType: "audio/mpeg" }]);
        expect(mocks.saveAs).toHaveBeenCalledWith(expect.stringContaining("/api/reference-assets/voice.mp3"), expect.stringMatching(/\.mp3$/));
    });
});
