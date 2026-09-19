"use client";
import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { DramaProject } from "@/lib/drama-project-contract";
import { hasOneClickPendingGeneration } from "@/lib/one-click/generation-polling";
/** Poll results without resetting unsaved script/editor fields or selected episode. */
export function useOneClickGenerationSync(project: DramaProject | undefined, setProject: Dispatch<SetStateAction<DramaProject | undefined>>) {
    const projectId = project?.id;
    const pending = hasOneClickPendingGeneration(project);
    const setter = useRef(setProject);
    useEffect(() => {
        setter.current = setProject;
    }, [setProject]);
    useEffect(() => {
        if (!projectId || !pending) return;
        const abort = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        async function poll() {
            try {
                const response = await fetch(`/api/one-click-film/projects/${encodeURIComponent(projectId!)}`, { cache: "no-store", signal: abort.signal });
                const payload = (await response.json()) as { code?: number; data?: { project?: DramaProject } };
                const next = payload.data?.project;
                if (response.ok && payload.code === 0 && next && !abort.signal.aborted) {
                    setter.current((current) => {
                        if (!current || current.id !== next.id || current.updatedAt > next.updatedAt) return current;
                        return next;
                    });
                }
            } catch {
                // Network errors do not cancel paid upstream work; the next read resumes it.
            } finally {
                if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 3000);
            }
        }
        void poll();
        return () => {
            abort.abort();
            if (timer) clearTimeout(timer);
        };
    }, [projectId, pending]);
}
