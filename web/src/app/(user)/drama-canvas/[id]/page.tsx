import DramaCanvasClientPage from "@/features/drama-canvas-runtime/[id]/canvas-client-page";
import { DramaCanvasContextBar } from "./drama-canvas-context-bar";

export default function DramaCanvasPage() {
    return (
        <main className="fixed inset-0 z-[100] overflow-hidden bg-white dark:bg-neutral-950">
            <DramaCanvasClientPage />
            <DramaCanvasContextBar />
        </main>
    );
}
