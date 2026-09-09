import { createPostgresRepositories, ensurePostgresSchema, withPostgresTransaction, type JsonValue } from "@/lib/server/database";
import type { AppSettingsRecord } from "@/lib/server/database/repository-types";

import { AuthInputError } from "./store-foundation";
import { encryptAuthSettingsSecrets, normalizeSettings } from "./store-normalizers";
import { readPostgresAuthSettings } from "./store-repository";
import type { AuthSettings } from "./store-types";
import { publishSettingsUpdated } from "@/lib/server/settings-events";

export async function updatePostgresAuthSettings(patch: Partial<AuthSettings>, expectedRevision?: number) {
    await ensurePostgresSchema();
    return withPostgresTransaction(async (client) => {
        const settingsRepository = createPostgresRepositories(client).settings;
        await settingsRepository.lock();
        const current = await readPostgresAuthSettings(client);
        const currentRevision = current.settingsRevision ?? 1;
        if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
            throw new AuthInputError("配置已被其他管理员更新，请刷新后再保存", 409);
        }
        const settings = normalizeSettings({
            ...current,
            ...patch,
            generationConcurrency: patch.generationConcurrency ? { ...current.generationConcurrency, ...patch.generationConcurrency } : current.generationConcurrency,
            generationDefaults: patch.generationDefaults ? { ...current.generationDefaults, ...patch.generationDefaults } : current.generationDefaults,
        });
        const encrypted = encryptAuthSettingsSecrets(settings);

        if (patch.entitlements !== undefined) {
            const retainedPlans = await settingsRepository.removeEntitlementPlansNotIn(settings.entitlements.plans.map((plan) => plan.id));
            if (retainedPlans.length) throw new AuthInputError(`套餐仍被用户或订单引用，无法删除：${retainedPlans.join("、")}`);
            for (const [sortOrder, plan] of settings.entitlements.plans.entries()) {
                await settingsRepository.upsertEntitlementPlan({
                    id: plan.id,
                    name: plan.name,
                    enabled: plan.enabled,
                    dailyPoints: plan.dailyPoints,
                    limits: asJson(plan.limits),
                    features: asJson(plan.features),
                    sortOrder,
                });
            }
        }

        const settingsPatch = postgresSettingsPatch(patch, encrypted);
        settingsPatch.settingsRevision = currentRevision + 1;
        if (Object.keys(settingsPatch).length) await settingsRepository.updateSettings(settingsPatch);

        if (patch.systemChannels !== undefined) {
            for (const [sortOrder, channel] of encrypted.systemChannels.entries()) {
                await settingsRepository.upsertSystemModelChannel({
                    id: channel.id,
                    name: channel.name,
                    baseUrl: channel.baseUrl,
                    apiKeyCiphertext: channel.apiKey,
                    webhookSecretCiphertext: channel.webhookSecret || "",
                    apiFormat: channel.apiFormat,
                    models: asJson(channel.models),
                    enabled: channel.enabled,
                    purpose: channel.purpose || "shared",
                    advancedConfig: channel.advancedConfig ? asJson(channel.advancedConfig) : undefined,
                    sortOrder,
                });
            }
            await settingsRepository.deleteSystemModelChannelsNotIn(encrypted.systemChannels.map((channel) => channel.id));
        }
        const result = { ...settings, settingsRevision: currentRevision + 1 };
        publishSettingsUpdated(currentRevision + 1);
        return result;
    });
}

function postgresSettingsPatch(patch: Partial<AuthSettings>, settings: AuthSettings) {
    const result: Partial<Omit<AppSettingsRecord, "id" | "createdAt" | "updatedAt">> = {};
    if (patch.site !== undefined) result.site = asJson(settings.site);
    if (patch.registrationEnabled !== undefined) result.registrationEnabled = settings.registrationEnabled;
    if (patch.emailRegistrationEnabled !== undefined) result.emailRegistrationEnabled = settings.emailRegistrationEnabled;
    if (patch.freeDailyPointsEnabled !== undefined) result.freeDailyPointsEnabled = settings.freeDailyPointsEnabled;
    if (patch.freeDailyPoints !== undefined) result.freeDailyPoints = settings.freeDailyPoints;
    if (patch.mail !== undefined) result.mail = asJson(settings.mail);
    if (patch.allowUserApiConfig !== undefined) result.allowUserApiConfig = settings.allowUserApiConfig;
    if (patch.modelPointCosts !== undefined) result.modelPointCosts = asJson(settings.modelPointCosts);
    if (patch.generationPointMultipliers !== undefined) result.generationPointMultipliers = asJson(settings.generationPointMultipliers);
    if (patch.generationCostControl !== undefined) result.generationCostControl = asJson(settings.generationCostControl);
    if (patch.dataLifecycle !== undefined) result.dataLifecycle = asJson(settings.dataLifecycle);
    if (patch.entitlements !== undefined) {
        result.entitlementsEnabled = settings.entitlements.enabled;
        result.defaultPlanId = settings.entitlements.defaultPlanId;
    }
    if (patch.generationConcurrency !== undefined) result.generationConcurrency = asJson(settings.generationConcurrency);
    if (patch.generationDefaults !== undefined) result.generationDefaults = asJson(settings.generationDefaults);
    if (patch.logicalModels !== undefined) result.logicalModels = asJson(settings.logicalModels);
    if (patch.defaultModels !== undefined) result.defaultModels = asJson(settings.defaultModels);
    if (patch.practiceDefaultModels !== undefined) result.practiceDefaultModels = asJson(settings.practiceDefaultModels);
    if (patch.practiceWorkflowModels !== undefined) result.practiceWorkflowModels = asJson(settings.practiceWorkflowModels);
    if (patch.practiceModuleVisibility !== undefined) result.practiceModuleVisibility = asJson(settings.practiceModuleVisibility);
    if (patch.agentSkills !== undefined) result.agentSkills = asJson(settings.agentSkills);
    if (patch.featureModules !== undefined) result.featureModules = asJson(settings.featureModules);
    return result;
}

function asJson(value: unknown) {
    return value as JsonValue;
}
