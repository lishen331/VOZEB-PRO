import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    image: { complete: true, naturalWidth: 512 },
    effects: [] as Array<() => void>,
    setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("react", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react")>()),
    useState: (initial: unknown) => {
        const setter = vi.fn();
        state.setters.push(setter);
        return [initial, setter];
    },
    useEffect: (effect: () => void) => {
        state.effects.push(effect);
    },
    useRef: () => ({ current: state.image }),
}));
vi.mock("@/stores/use-public-session-store", () => ({ usePublicSessionStore: () => "/logo.svg" }));

import { LazyMediaImage } from "./lazy-media-image";

describe("LazyMediaImage hydration state", () => {
    beforeEach(() => {
        state.effects.length = 0;
        state.setters.length = 0;
        state.image = { complete: true, naturalWidth: 512 };
    });

    it("keeps an already decoded cached image visible after hydration", () => {
        LazyMediaImage({ src: "/cached.png", alt: "Cached image" });
        state.effects[0]();
        expect(state.setters[0]).toHaveBeenLastCalledWith("ready");
    });

    it("waits for the load event while the current image is still downloading", () => {
        state.image = { complete: false, naturalWidth: 0 };
        LazyMediaImage({ src: "/pending.png", alt: "Pending image" });
        state.effects[0]();
        expect(state.setters[0]).toHaveBeenLastCalledWith("loading");
    });

    it("does not leave an already failed image in an endless loading state", () => {
        state.image = { complete: true, naturalWidth: 0 };
        LazyMediaImage({ src: "/missing.png", alt: "Missing image" });
        state.effects[0]();
        expect(state.setters[0]).toHaveBeenLastCalledWith("error");
    });
});
