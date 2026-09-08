import type { AgentSkill } from "@/lib/auth/store-types";
import type { AgentPlan } from "./agent-run-validation";

export type AgentMediaKind = "text" | "image" | "video" | "audio";

export type AgentSkillCapability = {
    inputs: AgentMediaKind[];
    outputs: AgentMediaKind[];
};

export function defaultSkillCapabilities(workspaces: readonly string[] = ["image"], requiresReference = false): AgentSkillCapability[] {
    const outputs = workspaces.filter((workspace): workspace is AgentMediaKind => ["image", "video", "audio"].includes(workspace));
    if (!outputs.length && !workspaces.includes("drama")) return [];
    outputs.unshift("text");
    return Array.from(new Set(outputs)).flatMap((output) => {
        const inputSets = requiresReference ? [["text", "image"]] : [["text"], ["text", "image"]];
        return inputSets.map((inputs) => ({ inputs: [...inputs] as AgentMediaKind[], outputs: [output] }));
    });
}

export function normalizeSkillCapabilities(skill: Pick<AgentSkill, "capabilities" | "workspaces" | "requiresReference">): AgentSkillCapability[] {
    const explicit = Array.isArray(skill.capabilities)
        ? skill.capabilities
              .map((capability) => ({
                  inputs: normalizeKinds(capability?.inputs),
                  outputs: normalizeKinds(capability?.outputs),
              }))
              .filter((capability) => capability.inputs.length > 0 && capability.outputs.length > 0)
        : [];
    return explicit.length ? explicit : defaultSkillCapabilities(skill.workspaces, skill.requiresReference);
}

export function assertAgentPlanSkillCompatibility(plan: Pick<AgentPlan, "deliverables">, skills: Array<Pick<AgentSkill, "capabilities" | "workspaces" | "requiresReference">>, inputKinds: AgentMediaKind[]) {
    if (!skills.length || !plan.deliverables.length) return;
    if (plan.deliverables.some((item) => item.type !== "text") && skills.some((skill) => skill.requiresReference) && !inputKinds.some((kind) => kind !== "text")) {
        throw new Error("当前 Skill 需要参考素材，请先上传或引用素材后再生成");
    }
    const requiredInputs = uniqueKinds(["text", ...inputKinds]);
    const capabilities = skills.flatMap((skill) => normalizeSkillCapabilities(skill));
    if (!capabilities.length) return;
    for (const deliverable of plan.deliverables) {
        if (!capabilities.some((capability) => supports(capability, requiredInputs, deliverable.type))) {
            throw new Error("Skill 不支持当前输入与输出组合");
        }
    }
}

function supports(capability: AgentSkillCapability, inputs: AgentMediaKind[], output: AgentMediaKind) {
    return capability.outputs.includes(output) && inputs.every((input) => capability.inputs.includes(input));
}

function normalizeKinds(value: unknown): AgentMediaKind[] {
    return uniqueKinds(Array.isArray(value) ? value : []);
}

function uniqueKinds(value: unknown[]): AgentMediaKind[] {
    return Array.from(new Set(value.filter((item): item is AgentMediaKind => typeof item === "string" && ["text", "image", "video", "audio"].includes(item))));
}
