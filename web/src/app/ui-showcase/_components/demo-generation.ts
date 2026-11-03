import type { VzRunStatus } from "@/components/vozeb-ds/generate-button";

export type DemoGenerationState = { status: VzRunStatus; progress: number };

/** Local animation only: no network, queue, billing or business task. */
export function createDemoGeneration(update: (state: DemoGenerationState) => void) {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
        clearInterval(timer);
        timer = undefined;
    };
    return {
        start(fail = false) {
            if (timer !== undefined) return false;
            let progress = 0;
            update({ status: "running", progress });
            // Ten visual frames make a short, deterministic demonstration, not a service timeout.
            timer = setInterval(() => {
                progress += 10;
                const status = fail && progress >= 60 ? "error" : progress >= 100 ? "success" : "running";
                if (status !== "running") stop();
                update({ status, progress });
            }, 180);
            return true;
        },
        cancel() {
            stop();
            update({ status: "idle", progress: 0 });
        },
        dispose: stop,
    };
}
