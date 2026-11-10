import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UploadedImage } from "@/services/image-storage";
import type { UploadedFile } from "@/services/file-storage";
import type { PracticePanelProps } from "./practice-panel-types";

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as Array<() => void> }));
const services = vi.hoisted(() => ({ upload: vi.fn(), imageUpload: vi.fn(), create: vi.fn(), history: vi.fn(), error: vi.fn() }));

// Match the existing hook-level tests without requiring a DOM or changing component logic.
vi.mock("react", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react")>()),
    useState: (initial: unknown) => {
        const index = hooks.cursor++;
        if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? initial() : initial;
        return [
            hooks.slots[index],
            (value: unknown) => {
                hooks.slots[index] = typeof value === "function" ? value(hooks.slots[index]) : value;
            },
        ];
    },
    useRef: (initial: unknown) => {
        const index = hooks.cursor++;
        if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
        return hooks.slots[index];
    },
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void) => {
        hooks.effects.push(effect);
    },
}));
vi.mock("@/components/gamma-ui/gamma-ant-app", () => ({ App: { useApp: () => ({ message: { error: services.error } }) } }));
vi.mock("@/services/image-storage", () => ({ uploadImage: services.imageUpload }));
vi.mock("@/services/file-storage", () => ({ uploadMediaFile: services.upload }));
vi.mock("@/services/api/practice", () => ({ practiceApi: { listSessions: services.history, createSession: services.create } }));

import PracticeStoryboardVideoPanel, { PRACTICE_VIDEO_VOICE_PRESETS } from "./practice-storyboard-video-panel";

type ControlProps = { children?: ReactNode; "aria-label"?: string; label?: string; loading?: boolean; disabled?: boolean; src?: string; url?: string; onChoose?: (file: File) => void; onClick?: () => void; onChange?: (value: string | boolean) => void };

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((yes, no) => {
        resolve = yes;
        reject = no;
    });
    return { promise, resolve, reject };
}

function elements(node: ReactNode): ReactElement<ControlProps>[] {
    return Children.toArray(node).flatMap((child) => (isValidElement<ControlProps>(child) ? [child, ...elements(child.props.children)] : []));
}

const props: PracticePanelProps = {
    capability: { module: "storyboard-video", mode: "workflow", available: true, models: [{ id: "video", label: "Video" }], inputSchema: [], outputType: "video" },
    ipReferences: [],
    onIpReferencesChange: () => {},
    onCreated: () => {},
};
const oldAudio: UploadedFile = { url: "/old.wav", storageKey: "old", bytes: 1, mimeType: "audio/wav" };

function renderPanel(panelProps = props) {
    hooks.cursor = 0;
    hooks.effects.length = 0;
    const nodes = elements(PracticeStoryboardVideoPanel(panelProps));
    return {
        control: (label: string) => {
            const node = nodes.find((element) => element.props["aria-label"] === label || element.props.label === label);
            if (!node) throw new Error(`Missing control: ${label}`);
            return node.props;
        },
        submit: nodes.find((element) => element.props.children === "生成分镜视频")!.props,
        audio: nodes.filter((element) => element.type === "audio").map((element) => element.props.src),
    };
}

function startPreset() {
    const upload = deferred<UploadedFile>();
    services.upload.mockReturnValueOnce(upload.promise);
    renderPanel();
    hooks.effects[0]();
    expect(renderPanel().submit.loading).toBe(true);
    return upload;
}

describe("storyboard video audio cancellation", () => {
    beforeEach(() => {
        hooks.cursor = 0;
        hooks.slots.length = 0;
        hooks.effects.length = 0;
        vi.clearAllMocks();
    });

    it("shows completed history while the cancelled preset is still pending and ignores its late result", async () => {
        const old = startPreset();
        const history = deferred<{ sessions: unknown[] }>();
        services.history.mockReturnValueOnce(history.promise);
        renderPanel().control("配音音色").onChange!("history");
        expect(renderPanel().control("历史配音").loading).toBe(true);
        history.resolve({ sessions: [{ id: "dubbing", title: "dubbing", status: "success", createdAt: new Date(0).toISOString(), result: { media: { kind: "audio", url: "/history.wav" } } }] });
        await history.promise;
        expect(services.history).toHaveBeenCalledWith({ module: "dubbing", pageSize: 24 });
        expect(renderPanel().control("历史配音").loading).toBe(false);
        old.resolve(oldAudio);
        await old.promise;
        expect(renderPanel().control("历史配音").loading).toBe(false);
        expect(renderPanel().audio).toEqual([]);
        expect(services.error).not.toHaveBeenCalled();
    });

    it.each(["custom", "none"])("releases pending preset loading when choosing %s", async (choice) => {
        const old = startPreset();
        renderPanel().control("配音音色").onChange!(choice);
        expect(renderPanel().submit.loading).toBe(false);
        old.resolve(oldAudio);
        await old.promise;
        expect(renderPanel().submit.loading).toBe(false);
        expect(renderPanel().audio).toEqual([]);
    });

    it("releases pending preset loading when disabling audio and ignores its late failure", async () => {
        const old = startPreset();
        renderPanel().control("启用台词音频").onChange!(false);
        expect(renderPanel().submit.loading).toBe(false);
        old.reject(new Error("Cancelled preset failed"));
        await expect(old.promise).rejects.toThrow("Cancelled preset failed");
        expect(renderPanel().submit.loading).toBe(false);
        expect(services.error).not.toHaveBeenCalled();
    });

    it("keeps a replacement preset loading until its own request completes", async () => {
        const old = startPreset();
        const latest = deferred<UploadedFile>();
        services.upload.mockReturnValueOnce(latest.promise);
        renderPanel().control("配音音色").onChange!(PRACTICE_VIDEO_VOICE_PRESETS[1].value);
        renderPanel();
        hooks.effects[0]();
        old.resolve(oldAudio);
        await old.promise;
        expect(renderPanel().submit.loading).toBe(true);
        expect(renderPanel().audio).toEqual([]);
        latest.resolve({ ...oldAudio, url: "/latest.wav", storageKey: "latest" });
        await latest.promise;
        expect(renderPanel().submit.loading).toBe(false);
        expect(renderPanel().audio).toEqual(["/latest.wav"]);
    });
    it.each(["switch", "none"])("keeps an image replacement locked after cancelling audio with %s and submits the new image", async (cancel) => {
        const firstImage: UploadedImage = { url: "/first.png", storageKey: "first", width: 1, height: 1, bytes: 1, mimeType: "image/png" };
        const nextImage = { ...firstImage, url: "/next.png", storageKey: "next" };
        const panelProps: PracticePanelProps = { ...props, defaultInput: { prompt: "A video", images: { image: firstImage } } };
        const panel = () => renderPanel(panelProps);
        const pending = deferred<UploadedImage>();
        services.imageUpload.mockReturnValueOnce(pending.promise);
        services.create.mockResolvedValueOnce({ session: { id: "video" } });
        panel().control("分镜图（必需）").onChoose!(new File(["image"], "next.png", { type: "image/png" }));
        if (cancel === "switch") panel().control("启用台词音频").onChange!(false);
        else panel().control("配音音色").onChange!("none");
        expect(panel().submit.loading).toBe(true);
        expect(panel().submit.disabled).toBe(true);
        panel().submit.onClick!();
        expect(services.create).not.toHaveBeenCalled();
        pending.resolve(nextImage);
        await pending.promise;
        expect(panel().submit.loading).toBe(false);
        expect(panel().submit.disabled).toBe(false);
        panel().submit.onClick!();
        expect(services.create).toHaveBeenCalledWith(expect.objectContaining({ references: [{ type: "asset", id: "next", inputKey: "image" }] }));
    });

    it.each(["switch", "none"])("ignores a custom audio upload that completes after cancelling with %s", async (cancel) => {
        renderPanel().control("配音音色").onChange!("custom");
        const old = deferred<UploadedFile>();
        services.upload.mockReturnValueOnce(old.promise);
        renderPanel().control("台词音频").onChoose!(new File(["audio"], "old.wav", { type: "audio/wav" }));
        expect(renderPanel().submit.loading).toBe(true);
        if (cancel === "switch") renderPanel().control("启用台词音频").onChange!(false);
        else renderPanel().control("配音音色").onChange!("none");
        renderPanel().control("启用台词音频").onChange!(true);
        old.resolve(oldAudio);
        await old.promise;
        expect(renderPanel().control("台词音频").url).toBeUndefined();
        expect(renderPanel().submit.loading).toBe(false);
    });

    it("does not let a cancelled custom audio request clear a replacement upload or report its stale failure", async () => {
        renderPanel().control("配音音色").onChange!("custom");
        const old = deferred<UploadedFile>();
        services.upload.mockReturnValueOnce(old.promise);
        const file = new File(["audio"], "audio.wav", { type: "audio/wav" });
        renderPanel().control("台词音频").onChoose!(file);
        renderPanel().control("启用台词音频").onChange!(false);
        renderPanel().control("启用台词音频").onChange!(true);
        const latest = deferred<UploadedFile>();
        services.upload.mockReturnValueOnce(latest.promise);
        renderPanel().control("台词音频").onChoose!(file);
        old.reject(new Error("Obsolete custom upload failed"));
        await expect(old.promise).rejects.toThrow("Obsolete custom upload failed");
        expect(renderPanel().submit.loading).toBe(true);
        expect(services.error).not.toHaveBeenCalled();
        latest.resolve({ ...oldAudio, url: "/latest.wav", storageKey: "latest" });
        await latest.promise;
        expect(renderPanel().control("台词音频").url).toBe("/latest.wav");
        expect(renderPanel().submit.loading).toBe(false);
    });
});
