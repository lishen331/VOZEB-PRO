import type { OutpaintingRatio } from "@/lib/practice-outpainting";
import { assertCapabilityConstraints } from "./capability-constraints";
import type { ImageTaskConfig } from "./image-task-store";

export function supportsPracticeMaskEdit(config: Pick<ImageTaskConfig, "apiFormat" | "model"> & { advancedConfig?: Partial<NonNullable<ImageTaskConfig["advancedConfig"]>> }) {
    const advanced = config.advancedConfig;
    return (
        config.apiFormat === "openai" &&
        (advanced?.protocol === "openai" || advanced?.protocol === "newapi") &&
        !advanced.globalAiOpcPreset &&
        !advanced.globalAiOpcPresets?.length &&
        advanced.supportsReferenceImage === true &&
        /^\/?(?:v1\/)?images\/edits\/?$/i.test(advanced.editPath || "") &&
        !/json|public|\burl\b|公网|链接|base64/i.test(advanced.referenceRule || "")
    );
}

export function supportsOutpaintingOutput(config: Parameters<typeof supportsPracticeMaskEdit>[0] & Pick<ImageTaskConfig, "capabilityProfile">, size: string | undefined, resolution: string, ratio: OutpaintingRatio = "free") {
    if (!supportsPracticeMaskEdit(config)) return false;
    try {
        assertCapabilityConstraints(config.capabilityProfile, { capability: "image", referenceTypes: ["image"], referenceCount: 1, aspectRatio: ratio.includes(":") ? ratio : size, resolution });
        return true;
    } catch {
        return false;
    }
}
