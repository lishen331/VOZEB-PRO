"use client";

import { Input, Segmented } from "antd";

import { LabeledControl } from "@/components/admin/admin-settings-controls";
import type { SystemChannelModelConfig, SystemModelChannel } from "@/lib/auth/store";
import { normalizeModelId } from "@/lib/model-capability";
import { channelModelCapability } from "@/lib/model-routing-config";

const RUNNINGHUB_DOCS_URL = "https://www.runninghub.cn/runninghub-api-doc-cn/";

export function ChannelPurposeControl({ channel, onChange }: { channel: SystemModelChannel; onChange: (patch: Partial<SystemModelChannel>) => void }) {
    return (
        <LabeledControl label="渠道用途">
            <Segmented
                block
                value={channel.purpose || "shared"}
                options={[
                    { label: "正式生产", value: "production" },
                    { label: "无限练习", value: "open-source-practice" },
                    { label: "共享", value: "shared" },
                ]}
                onChange={(value) => onChange({ purpose: value as SystemModelChannel["purpose"] })}
            />
        </LabeledControl>
    );
}

export function RunningHubChannelFields({ channel, onChange }: { channel: SystemModelChannel; onChange: (patch: Partial<SystemModelChannel>) => void }) {
    if (channel.advancedConfig?.protocol !== "runninghub") return null;
    const advanced = channel.advancedConfig;
    const updateModelConfig = (model: string, patch: Partial<SystemChannelModelConfig>) => {
        const key = normalizeModelId(model);
        const current = advanced.modelConfigs?.[key] || { capability: channelModelCapability(channel, model), protocol: "runninghub" as const };
        onChange({ advancedConfig: { ...advanced, modelConfigs: { ...(advanced.modelConfigs || {}), [key]: { ...current, ...patch, protocol: "runninghub" } } } });
    };
    return (
        <section className="space-y-4 rounded-lg border border-stone-200 bg-stone-50/70 p-3 dark:border-stone-800 dark:bg-stone-900/40">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">RunningHub 异步任务契约</div>
                    <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">每个模型都必须填写官方文档中的创建、查询和响应字段；系统不会猜测模型目录或任务路径。</div>
                </div>
                <a className="text-xs text-blue-600 underline underline-offset-2 dark:text-blue-400" href={RUNNINGHUB_DOCS_URL} target="_blank" rel="noreferrer">
                    RunningHub 官方文档
                </a>
            </div>
            {channel.models.map((model) => {
                const config = advanced.modelConfigs?.[normalizeModelId(model)] || { capability: channelModelCapability(channel, model), protocol: "runninghub" as const };
                return (
                    <div key={model} className="space-y-3 rounded-md border border-stone-200 bg-white p-3 dark:border-stone-800 dark:bg-stone-950">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                            <span className="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{model}</span>
                            <span className="text-xs text-stone-500 dark:text-stone-400">{config.capability}</span>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <LabeledControl label="创建路径">
                                <Input value={config.createPath || ""} placeholder="/openapi/v2/task/create" onChange={(event) => updateModelConfig(model, { createPath: event.target.value })} />
                            </LabeledControl>
                            <LabeledControl label="查询路径">
                                <Input value={config.queryPath || ""} placeholder="/openapi/v2/task/query" onChange={(event) => updateModelConfig(model, { queryPath: event.target.value })} />
                            </LabeledControl>
                            <LabeledControl label="任务 ID 字段">
                                <Input value={config.taskIdField || ""} placeholder="data.taskId" onChange={(event) => updateModelConfig(model, { taskIdField: event.target.value })} />
                            </LabeledControl>
                            <LabeledControl label="结果字段">
                                <Input value={config.resultField || ""} placeholder="data.result" onChange={(event) => updateModelConfig(model, { resultField: event.target.value })} />
                            </LabeledControl>
                            <LabeledControl label="状态字段">
                                <Input value={config.statusField || ""} placeholder="data.status" onChange={(event) => updateModelConfig(model, { statusField: event.target.value })} />
                            </LabeledControl>
                            <div className="text-xs leading-5 text-stone-500 dark:text-stone-400 sm:self-end">上传参考媒体使用官方媒体上传接口返回的短期链接，不会写入本地素材库。</div>
                            <div className="sm:col-span-2">
                                <LabeledControl label="请求模板">
                                    <Input.TextArea rows={3} value={config.requestTemplate || ""} placeholder='{"workflow":"{{model}}","prompt":"{{prompt}}"}' onChange={(event) => updateModelConfig(model, { requestTemplate: event.target.value })} />
                                </LabeledControl>
                            </div>
                        </div>
                    </div>
                );
            })}
            {!channel.models.length ? <div className="text-sm text-stone-500 dark:text-stone-400">请先添加模型 ID，再填写每个模型的任务契约。</div> : null}
        </section>
    );
}
