import type { LogicalModel } from "@/lib/auth/store";
export function bindingUsesHttp1(models: LogicalModel[], logicalModelId: string, channelId: string, upstreamModel: string) {
    const model = models.find((item) => item.enabled && item.id.toLowerCase() === logicalModelId.toLowerCase());
    return model?.bindings.some((binding) => binding.enabled && binding.channelId === channelId && binding.upstreamModel.toLowerCase() === upstreamModel.toLowerCase() && binding.capabilityProfile?.http1Compatibility === true) === true;
}
