"use client";

import { useCanvasGenerationActions } from "./use-canvas-generation-actions";
import { useCanvasInteractions } from "./use-canvas-interactions";
import { useCanvasMediaActions } from "./use-canvas-media-actions";
import { useCanvasPageState } from "./use-canvas-page-state";
import { useCanvasPersistenceEffects } from "./use-canvas-persistence-effects";
import { useCanvasTaskRuntime } from "./use-canvas-task-runtime";
import { usePracticeCanvasModels } from "../utils/practice-canvas-models";

export function useCanvasPageController(executionProfile?: "open-source-practice") {
    const state = useCanvasPageState();
    const tasks = useCanvasTaskRuntime({ state });
    const practiceModels = usePracticeCanvasModels(executionProfile);
    useCanvasPersistenceEffects({ state, tasks, practiceModels });
    const interactions = useCanvasInteractions({ state });
    const media = useCanvasMediaActions({ state, tasks, interactions, practiceModels });
    const generation = useCanvasGenerationActions({ state, tasks, interactions, practiceModels });
    return { ...state, ...tasks, ...interactions, ...media, ...generation, practiceModels };
}

export type CanvasPageController = ReturnType<typeof useCanvasPageController>;
