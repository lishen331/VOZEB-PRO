import { ANIMATION_FLOW, DIGITAL_MEDIA_FLOW, FILM_FLOW, GAME_FLOW } from "@/app/bluegamma/flow/flow-data-media";
import { CERAMICS_FLOW, FASHION_FLOW, INTERIOR_FLOW, JEWELRY_FLOW, PRODUCT_FLOW } from "@/app/bluegamma/flow/flow-data-space";
import { ADVERTISING_FLOW, ECOMMERCE_FLOW, VISUAL_FLOW } from "@/app/bluegamma/flow/flow-data-visual";
import type { MajorFlow } from "@/app/bluegamma/flow/flow-types";

/** 12 个专业的创作流程，按 slug 对应 GAMMA_SUBJECTS */
export const MAJOR_FLOWS: readonly MajorFlow[] = [
    FASHION_FLOW,
    INTERIOR_FLOW,
    ADVERTISING_FLOW,
    DIGITAL_MEDIA_FLOW,
    FILM_FLOW,
    ECOMMERCE_FLOW,
    VISUAL_FLOW,
    PRODUCT_FLOW,
    ANIMATION_FLOW,
    GAME_FLOW,
    CERAMICS_FLOW,
    JEWELRY_FLOW,
];

export function majorFlowBySlug(slug: string): MajorFlow {
    return MAJOR_FLOWS.find((flow) => flow.slug === slug) ?? INTERIOR_FLOW;
}

/** 校验：每个 refs 只能指向排在前面的步骤（流程是单向链，不能引用还没做的步骤） */
export function findFlowRefErrors(flow: MajorFlow): string[] {
    const seen = new Set<string>();
    const errors: string[] = [];
    for (const step of flow.steps) {
        for (const ref of step.refs ?? []) {
            if (!seen.has(ref)) errors.push(`${flow.slug}/${step.key} → ${ref}`);
        }
        seen.add(step.key);
    }
    return errors;
}
