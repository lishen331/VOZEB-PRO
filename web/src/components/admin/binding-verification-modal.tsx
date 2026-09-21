"use client";

import { Alert, Button, Checkbox, Empty, Image, Input, Modal, Space, Spin, Tabs, Tag } from "antd";
import { saveAs } from "file-saver";
import { useCopyText } from "@/hooks/use-copy-text";
import { useEffect, useRef, useState } from "react";
import { applyChannelProtocol } from "@/lib/channel-protocol-registry";
import { AdminChannelProtocolSetup } from "./admin-channel-protocol-setup";
import type { LogicalModelCapability, SystemModelChannel } from "@/lib/auth/store";
import { BATCH_MEDIA_POLL_INTERVAL_MS } from "@/lib/one-click/batch-media";

import { bindingVerificationFixturePreviewUrl, bindingVerificationDiagnosticsJson, bindingVerificationSessionKey, createBindingVerification, getBindingVerification, type BindingVerificationTest } from "@/services/api/binding-verifications";
export { readBindingVerification } from "@/services/api/binding-verifications";
type Props = {
    open: boolean;
    onCancel: () => void;
    onVerified: (testId: string) => void;
    logicalModelId: string;
    bindingId: string;
    capability: LogicalModelCapability;
    channelName: string;
    upstreamModel: string;
    channel?: SystemModelChannel;
    configRevision?: string;
    beforeStart?: () => Promise<void>;
    beforeConfirm?: () => Promise<void>;
    onProtocolChange?: (patch: Partial<SystemModelChannel>) => boolean | void;
};
export function verificationFixtureCount(capability: LogicalModelCapability) {
    return capability === "video" ? 3 : 1;
}
export function canConfirmBindingVerification(test: BindingVerificationTest | null, confirmed: boolean) {
    return confirmed && test?.status === "passed" && Boolean(test.result?.url || test.result?.text?.trim());
}
const labels = { running: "验证中", passed: "验证通过", failed: "验证失败", needs_review: "结果待核对" };

export function BindingVerificationModal(props: Props) {
    // Isolate state by saved binding; closing the modal deliberately does not unmount it.
    return <BindingVerificationSession key={`${props.logicalModelId}:${props.bindingId}:${props.upstreamModel}`} {...props} />;
}
function BindingVerificationSession({ open, onCancel, onVerified, logicalModelId, bindingId, capability, channelName, upstreamModel, channel, onProtocolChange, beforeStart, beforeConfirm, configRevision = "" }: Props) {
    const copyText = useCopyText();
    const [test, setTest] = useState<BindingVerificationTest | null>(null);
    const [restoring, setRestoring] = useState(true);
    const storageKey = useRef("");
    const [confirmed, setConfirmed] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [uncertain, setUncertain] = useState(false);
    const [error, setError] = useState("");
    const [refresh, setRefresh] = useState(0);
    const [tab, setTab] = useState("test");
    const submittingRef = useRef(false);
    const verifiedRef = useRef(false);
    const busy = restoring || submitting || test?.status === "running";
    const supported = capability !== "audio";
    const count = verificationFixtureCount(capability);
    const fixtures = Array.from({ length: count }, (_, index) => bindingVerificationFixturePreviewUrl(index));
    const prompt =
        capability === "video"
            ? "结合三张参考图，让橙色小球缓慢经过蓝色方块和绿色圆环，保持物体外观一致，镜头连续稳定。"
            : capability === "image"
              ? "参考图片中的橙色小球，生成同一小球在白色桌面上的画面，保持颜色与形状一致。"
              : "观察参考图，描述主要物体的颜色、形状和相对位置。";

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        void (async () => {
            try {
                const key = await bindingVerificationSessionKey(logicalModelId, bindingId, configRevision);
                if (cancelled) return;
                storageKey.current = key;
                let id: string | null = null;
                try {
                    id = sessionStorage.getItem(key);
                } catch {
                    /* Storage may be disabled. */
                }
                if (id) {
                    setTest({ id, status: "running", phase: "恢复查询" });
                    const restored = await getBindingVerification(id, controller.signal);
                    if (!cancelled) setTest(restored);
                }
            } catch (cause) {
                if (!cancelled) {
                    setError(cause instanceof Error ? cause.message : "恢复查询失败");
                    setUncertain(true);
                }
            } finally {
                if (!cancelled) setRestoring(false);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [logicalModelId, bindingId, configRevision]);

    useEffect(() => {
        if (!open || restoring || !test?.id || test.status !== "running") return;
        const controller = new AbortController();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const poll = async () => {
            try {
                const next = await getBindingVerification(test.id, controller.signal);
                if (controller.signal.aborted) return;
                setTest(next);
                setError("");
                setUncertain(false);
                if (next.status === "running") timer = setTimeout(() => void poll(), BATCH_MEDIA_POLL_INTERVAL_MS);
            } catch (cause) {
                if (!controller.signal.aborted) {
                    setError(cause instanceof Error ? cause.message : "查询失败，结果未知");
                    setUncertain(true);
                }
            }
        };
        void poll();
        return () => {
            controller.abort();
            clearTimeout(timer);
        };
    }, [open, restoring, test?.id, test?.status, refresh]);

    const start = async () => {
        if (submittingRef.current || busy || uncertain || test?.status === "needs_review" || !supported) return;
        submittingRef.current = true;
        verifiedRef.current = false;
        setSubmitting(true);
        setConfirmed(false);
        setError("");
        let submitted = false;
        try {
            await beforeStart?.();
            submitted = true;
            // Do not abort POST on close: losing its response could lose the server's test ID.
            const next = await createBindingVerification(logicalModelId, bindingId);
            setTest(next);
            try {
                if (storageKey.current) sessionStorage.setItem(storageKey.current, next.id);
            } catch {
                /* Keep the live session when storage is unavailable. */
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "提交结果未知，请勿重复提交");
            setUncertain(submitted);
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };
    const result = test?.result;
    const confirm = async () => {
        if (!canConfirmBindingVerification(test, confirmed) || uncertain || busy || verifiedRef.current) return;
        verifiedRef.current = true;
        setSubmitting(true);
        try {
            await (beforeConfirm || beforeStart)?.();
            setConfirmed(false);
            onVerified(test!.id);
        } catch (cause) {
            verifiedRef.current = false;
            setError(cause instanceof Error ? cause.message : "确认配置失败，请重试");
        } finally {
            setSubmitting(false);
        }
    };
    const muted = "text-xs leading-5 text-stone-500 dark:text-stone-400";
    return (
        <Modal
            open={open}
            centered
            width={1080}
            onCancel={onCancel}
            maskClosable={false}
            styles={{ body: { maxHeight: "calc(100dvh - 230px)", overflowY: "auto" } }}
            title={
                <div>
                    启用前验证 <Tag color={test?.status === "passed" ? "success" : test?.status === "failed" ? "error" : "default"}>{test ? labels[test.status] : "待测试"}</Tag>
                    <div className={`${muted} mt-1 font-normal`}>
                        {channelName} / {upstreamModel}
                    </div>
                </div>
            }
            footer={
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className={muted}>关闭只停止查询，不取消上游任务；重新打开可继续查看。</span>
                    <Space>
                        <Button onClick={onCancel}>暂不启用</Button>
                        <Button type="primary" disabled={!canConfirmBindingVerification(test, confirmed) || uncertain || submitting} onClick={confirm}>
                            启用此绑定
                        </Button>
                    </Space>
                </div>
            }
        >
            <Alert className="mb-3" type="warning" showIcon title="测试会产生实际上游调用费用" description="点击测试将先保存当前模型协议和绑定能力，无需退出弹窗。不会自动切换渠道、降低规格或重复提交未知结果；失败的绑定不能启用。" />
            {error ? (
                <Alert
                    className="mb-3"
                    type="error"
                    showIcon
                    title={error}
                    action={
                        test?.status === "running" ? (
                            <Button size="small" onClick={() => setRefresh((value) => value + 1)}>
                                恢复查询
                            </Button>
                        ) : undefined
                    }
                />
            ) : null}
            <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                    { key: "protocol", label: "AI 协议助手" },
                    { key: "test", label: "测试与生成结果" },
                    { key: "diagnostics", label: "诊断记录" },
                ]}
            />
            <div className="min-h-0">
                {tab === "test" ? (
                    <div className="grid gap-5 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                        <section className="min-w-0 space-y-3">
                            <div className="flex items-center justify-between">
                                <b>测试输入</b>
                                <Tag>{count} 张固定参考图</Tag>
                            </div>
                            <Image.PreviewGroup>
                                <div className="grid grid-cols-3 gap-2">
                                    {fixtures.map((url, index) => (
                                        <div key={index}>
                                            <Image src={url} alt={`参考图 ${index + 1}`} />
                                            <div className={muted}>参考图 {index + 1}</div>
                                        </div>
                                    ))}
                                </div>
                            </Image.PreviewGroup>
                            <label className="block text-sm">
                                默认提示词
                                <Input.TextArea readOnly rows={4} value={prompt} className="mt-2" />
                            </label>
                            <div>
                                {capability === "video" ? (
                                    <>
                                        <Tag>480P</Tag>
                                        <Tag>5 秒</Tag>
                                        <Tag>16:9</Tag>
                                    </>
                                ) : (
                                    <Tag>{capability === "image" ? "输出 1 张图片" : "图片理解 → 文本"}</Tag>
                                )}
                            </div>
                            <p className={muted}>
                                {capability === "video" ? "三张参考图全部传入，结果保存、可播放且规格一致后才通过。" : capability === "image" ? "参考图传入，生成图片可解码并保存后才通过。" : "必须支持图片理解并返回非空正文，纯文本模型不满足此验收要求。"}
                            </p>
                            {!supported ? <Alert type="info" title="当前验证流程暂不支持音频绑定" /> : null}
                            <Button type="primary" block loading={submitting || (test?.status === "running" && !uncertain)} disabled={busy || uncertain || test?.status === "needs_review" || !supported} onClick={() => void start()}>
                                {test ? "保存并重新测试（产生费用）" : "保存并测试（产生费用）"}
                            </Button>
                        </section>
                        <section className="min-w-0 space-y-3">
                            <b>生成结果</b>
                            <div className="flex min-h-64 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-stone-900">
                                {result?.text ? (
                                    <article className="w-full whitespace-pre-wrap break-words text-sm">{result.text}</article>
                                ) : result?.url && capability === "video" ? (
                                    <video className="max-h-80 w-full" src={result.url} controls playsInline preload="metadata" />
                                ) : result?.url && capability === "image" ? (
                                    <Image src={result.url} alt="真实生成结果" style={{ maxHeight: 320, objectFit: "contain" }} />
                                ) : busy && !uncertain ? (
                                    <Spin description="生成中，请等待真实结果" />
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={test?.error || (uncertain ? "结果未知，请核对诊断，不要重复提交" : "生成结果将在这里展示")} />
                                )}
                            </div>
                            <div className={muted}>
                                当前阶段：{test?.phase || "尚未提交"}
                                {test ? ` · 测试编号：${test.id}` : ""}
                            </div>
                            {test?.error ? <Alert type="error" title={test.error} /> : null}
                            {test?.status === "needs_review" ? <Alert type="warning" title="结果需核对，不能启用或自动重交" /> : null}
                            <Checkbox checked={confirmed} disabled={!canConfirmBindingVerification(test, true) || uncertain || submitting} onChange={(event) => setConfirmed(event.target.checked)}>
                                我已查看真实生成结果，确认内容与规格符合要求
                            </Checkbox>
                        </section>
                    </div>
                ) : tab === "diagnostics" ? (
                    <div className="space-y-3">
                        <Space wrap>
                            <Button disabled={!test} onClick={() => test && copyText(bindingVerificationDiagnosticsJson(test), "诊断 JSON 已复制")}>
                                复制诊断 JSON
                            </Button>
                            <Button disabled={!test} onClick={() => test && saveAs(new Blob([bindingVerificationDiagnosticsJson(test)], { type: "application/json;charset=utf-8" }), `binding-verification-${test.id}.json`)}>
                                下载诊断 JSON
                            </Button>
                        </Space>
                        <pre className="whitespace-pre-wrap break-all rounded-lg bg-stone-50 p-4 text-xs dark:bg-stone-900">{test ? bindingVerificationDiagnosticsJson(test) : "尚未提交测试，无诊断记录。"}</pre>
                    </div>
                ) : busy ? (
                    <Alert type="info" title="测试进行中，请等待结果后编辑协议" description="修改配置前需要保留并核对当前测试结果，关闭弹窗不会取消上游任务。" />
                ) : channel && onProtocolChange ? (
                    <div className="space-y-3">
                        <Alert type="info" showIcon title={`仅编辑当前上游模型：${upstreamModel}`} description="助手生成协议建议后，只提取当前模型的接口配置到草稿，不覆盖其他模型或渠道鉴权。应用后点击保存并测试，无需退出弹窗。" />
                        <AdminChannelProtocolSetup
                            channel={{ ...channel, advancedConfig: { ...applyChannelProtocol(channel, "custom").advancedConfig!, protocol: "custom" } }}
                            protocolLocked
                            onChange={(patch) => {
                                if (onProtocolChange(patch) === false) return false;
                                setConfirmed(false);
                                setTest(null);
                                setUncertain(true);
                            }}
                        />
                    </div>
                ) : (
                    <Alert type="info" showIcon title="请在渠道设置中使用现有自定义协议助手" description="此绑定尚未接入渠道草稿编辑回调。请返回渠道设置，分析并保存协议草稿后重新验证；此处不会模拟分析或修改线上配置。" />
                )}
            </div>
        </Modal>
    );
}
