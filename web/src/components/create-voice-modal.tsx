"use client";

import { useState } from "react";
import { Modal, Tabs, Input, Checkbox, Button, Upload, message } from "antd";
import { Upload as UploadIcon } from "lucide-react";
import type { UploadFile } from "antd";
import useSWR from "swr";

import type { VoiceCustomizationConfig } from "@/lib/custom-voice-config";
import { customVoiceCreatePoints, priceInCny, normalizeVoiceCustomization } from "@/lib/custom-voice-config";

type CreateVoiceModalProps = {
    open: boolean;
    model: string;
    onClose: () => void;
    onSuccess: () => void;
};

export function CreateVoiceModal({ open, model, onClose, onSuccess }: CreateVoiceModalProps) {
    const [activeTab, setActiveTab] = useState<"clone" | "design">("clone");
    const [loading, setLoading] = useState(false);

    const { data: settingsData } = useSWR<{
        systemChannels: Array<{ id: string; models: string[]; advancedConfig?: { voiceCustomization?: any } }>;
        voicePricing?: { usdToCny: number; pointsPerYuan: number };
    }>(open ? "/api/auth/settings" : null);

    const channel = settingsData?.systemChannels.find((ch) => ch.models.includes(model) && ch.advancedConfig?.voiceCustomization);
    const rawConfig = channel?.advancedConfig?.voiceCustomization;
    const config = rawConfig ? normalizeVoiceCustomization(rawConfig) : null;
    const voicePricing = settingsData?.voicePricing || { usdToCny: 7.1, pointsPerYuan: 0 };

    const handleCreate = async (data: { kind: "clone" | "design"; name: string; audioData?: string; audioFormat?: string; prompt?: string; previewText?: string }) => {
        setLoading(true);
        try {
            const response = await fetch("/api/custom-voices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...data, ttsModel: model }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || "创建失败");
            }

            message.success("音色创建成功");
            onSuccess();
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建失败");
        } finally {
            setLoading(false);
        }
    };

    if (!config) {
        return (
            <Modal title="创建自定义音色" open={open} onCancel={onClose} footer={null} width={600}>
                <div className="py-8 text-center text-gray-500">{settingsData ? "当前模型不支持自定义音色" : "加载配置中..."}</div>
            </Modal>
        );
    }

    if (voicePricing.pointsPerYuan <= 0) {
        return (
            <Modal title="创建自定义音色" open={open} onCancel={onClose} footer={null} width={600}>
                <div className="py-8 text-center text-gray-500">音色定价未配置，请联系管理员</div>
            </Modal>
        );
    }

    const tabItems = [
        { key: "clone", label: "声音克隆", children: <CloneTab config={config} voicePricing={voicePricing} loading={loading} onSubmit={(data) => handleCreate({ kind: "clone", ...data })} /> },
        { key: "design", label: "声音设计", children: <DesignTab config={config} voicePricing={voicePricing} loading={loading} onSubmit={(data) => handleCreate({ kind: "design", ...data })} /> },
    ];

    return (
        <Modal title="创建自定义音色" open={open} onCancel={onClose} footer={null} width={600}>
            <Tabs activeKey={activeTab} items={tabItems} onChange={(key) => setActiveTab(key as typeof activeTab)} />
        </Modal>
    );
}

type CloneTabProps = {
    config: VoiceCustomizationConfig;
    voicePricing: { usdToCny: number; pointsPerYuan: number };
    loading: boolean;
    onSubmit: (data: { name: string; audioData: string; audioFormat: string }) => void;
};

function CloneTab({ config, voicePricing, loading, onSubmit }: CloneTabProps) {
    const [name, setName] = useState("");
    const [audioFile, setAudioFile] = useState<UploadFile | null>(null);
    const [audioData, setAudioData] = useState<string>("");
    const [consent, setConsent] = useState(false);

    const handleFileChange = (file: UploadFile) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1];
            setAudioData(base64);
        };
        reader.readAsDataURL(file as unknown as Blob);
        setAudioFile(file);
        return false;
    };

    const validateAudio = () => {
        if (!audioFile) return "请上传音频文件";
        const fileSizeMB = (audioFile.size || 0) / (1024 * 1024);
        if (fileSizeMB > config.audioLimits.maxMB) return `音频文件不能超过 ${config.audioLimits.maxMB}MB`;
        const ext = audioFile.name.split(".").pop()?.toLowerCase();
        if (ext && !config.audioLimits.formats.includes(ext)) return `只支持 ${config.audioLimits.formats.join(", ")} 格式`;
        return null;
    };

    const handleSubmit = () => {
        const error = validateAudio();
        if (error) {
            message.error(error);
            return;
        }
        if (!name.trim()) {
            message.error("请输入音色名称");
            return;
        }
        if (!consent) {
            message.error("请确认已获得声音本人授权");
            return;
        }
        const audioFormat = audioFile!.name.split(".").pop()?.toLowerCase() || "mp3";
        onSubmit({ name: name.trim(), audioData, audioFormat });
    };

    const points = customVoiceCreatePoints(config, "clone", voicePricing.usdToCny, voicePricing.pointsPerYuan);
    const priceCny = priceInCny(config, "clone", voicePricing.usdToCny);

    return (
        <div className="space-y-4 py-4">
            <div>
                <label className="mb-1 block text-sm font-medium">音色名称</label>
                <Input placeholder="给音色起个名字" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium">上传音频</label>
                <Upload.Dragger maxCount={1} accept={config.audioLimits.formats.map((f) => `.${f}`).join(",")} beforeUpload={handleFileChange} onRemove={() => setAudioFile(null)}>
                    <p className="ant-upload-drag-icon">
                        <UploadIcon className="mx-auto size-12" />
                    </p>
                    <p className="ant-upload-text">点击或拖拽上传音频文件</p>
                    <p className="ant-upload-hint">
                        支持 {config.audioLimits.formats.join(", ")} 格式，时长 {config.audioLimits.minSec}-{config.audioLimits.maxSec} 秒，不超过 {config.audioLimits.maxMB}MB
                    </p>
                </Upload.Dragger>
            </div>

            <div>
                <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)}>
                    我已获得声音本人授权
                </Checkbox>
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <div className="font-medium">预计扣费</div>
                <div className="mt-1">
                    {points} 积分（约 ¥{priceCny.toFixed(2)}）
                </div>
            </div>

            <Button type="primary" block loading={loading} onClick={handleSubmit}>
                创建音色
            </Button>
        </div>
    );
}

type DesignTabProps = {
    config: VoiceCustomizationConfig;
    voicePricing: { usdToCny: number; pointsPerYuan: number };
    loading: boolean;
    onSubmit: (data: { name: string; prompt: string; previewText: string }) => void;
};

function DesignTab({ config, voicePricing, loading, onSubmit }: DesignTabProps) {
    const [name, setName] = useState("");
    const [prompt, setPrompt] = useState("");
    const [previewText, setPreviewText] = useState("");

    const handleSubmit = () => {
        if (!name.trim()) {
            message.error("请输入音色名称");
            return;
        }
        if (!prompt.trim()) {
            message.error("请输入声音描述");
            return;
        }
        if (previewText.length < config.designLimits.previewTextMin || previewText.length > config.designLimits.previewTextMax) {
            message.error(`试听文本需要 ${config.designLimits.previewTextMin}-${config.designLimits.previewTextMax} 个字符`);
            return;
        }
        onSubmit({ name: name.trim(), prompt: prompt.trim(), previewText: previewText.trim() });
    };

    const points = customVoiceCreatePoints(config, "design", voicePricing.usdToCny, voicePricing.pointsPerYuan);
    const priceCny = priceInCny(config, "design", voicePricing.usdToCny);

    return (
        <div className="space-y-4 py-4">
            <div>
                <label className="mb-1 block text-sm font-medium">音色名称</label>
                <Input placeholder="给音色起个名字" maxLength={50} value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium">
                    声音描述（{prompt.length}/{config.designLimits.promptMax}）
                </label>
                <Input.TextArea placeholder="描述你想要的声音特征，例如：温柔的女性声音，语速适中，适合讲故事" maxLength={config.designLimits.promptMax} rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>

            <div>
                <label className="mb-1 block text-sm font-medium">
                    试听文本（{previewText.length}/{config.designLimits.previewTextMin}-{config.designLimits.previewTextMax}）
                </label>
                <Input.TextArea placeholder="输入一段试听文本，将用此文本生成音色预览" maxLength={config.designLimits.previewTextMax} rows={3} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
            </div>

            <div className="rounded-lg bg-blue-50 p-3 text-sm">
                <div className="font-medium">预计扣费</div>
                <div className="mt-1">
                    {points} 积分（约 ¥{priceCny.toFixed(2)}）
                </div>
            </div>

            <Button type="primary" block loading={loading} onClick={handleSubmit}>
                创建音色
            </Button>
        </div>
    );
}
