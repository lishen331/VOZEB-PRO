"use client";

import { useState } from "react";
import { Box, Clapperboard, Image as ImageIcon, Megaphone, Shirt, Sofa, Sparkles, Video, Zap } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GAMMA_FIELD_BOX, GammaField, gammaFieldRing, useGammaField, useGammaForm } from "@/components/gamma-ui/gamma-form";
import { GammaSelect, type GammaSelectOption } from "@/components/gamma-ui/gamma-select";
import { GammaUpload } from "@/components/gamma-ui/gamma-upload";
import { cn } from "@/lib/utils";

const MAJORS: GammaSelectOption[] = [
    { value: "interior", label: "室内设计", icon: <Sofa />, group: "空间与造型" },
    { value: "fashion", label: "服装设计", icon: <Shirt />, group: "空间与造型" },
    { value: "product", label: "产品设计", icon: <Box />, group: "空间与造型" },
    { value: "advertising", label: "广告设计", icon: <Megaphone />, group: "平面与商业" },
    { value: "film", label: "影视制作", icon: <Clapperboard />, group: "影像与叙事" },
    { value: "game", label: "游戏艺术", icon: <Sparkles />, group: "影像与叙事", disabled: true, description: "本学期未开课" },
];

const cost = (points: number) => (
    <span className="inline-flex items-center gap-0.5">
        <Zap className="size-3" />
        {points}
    </span>
);

const MODELS: GammaSelectOption[] = [
    { value: "gpt-image-2", label: "GPT Image-2", description: "中文排字准，指令跟随强", icon: <ImageIcon />, meta: cost(12), group: "图片" },
    { value: "seedream", label: "Seedream 4", description: "写实质感好", icon: <ImageIcon />, meta: cost(8), group: "图片" },
    { value: "kling", label: "可灵 3.0", description: "镜头运动自然", icon: <Video />, meta: cost(40), group: "视频" },
];

const CLASSES: GammaSelectOption[] = ["室内 2301", "室内 2302", "室内 2303", "环艺 2301", "环艺 2302", "数媒 2301"].map((value, index) => ({ value, label: value, description: `${28 + index * 3} 人` }));
const TAGS: GammaSelectOption[] = ["毕设", "LOFT", "竞赛", "住宅", "商业空间"].map((value) => ({ value, label: value }));

type CourseForm = { title: string; major: string | null; model: string | null; classes: readonly string[]; tags: readonly string[]; minutes: number; intro: string };

/** 模拟上传：每 120ms 涨一截；文件名带 fail 的会失败（用来演示重传） */
function fakeUpload(file: File, onProgress: (percent: number) => void) {
    return new Promise<void>((resolve, reject) => {
        let percent = 0;
        const timer = window.setInterval(() => {
            percent += 12 + Math.random() * 18;
            onProgress(percent);
            if (percent >= 60 && file.name.toLowerCase().includes("fail")) {
                window.clearInterval(timer);
                reject(new Error("网络中断，请重试"));
            } else if (percent >= 100) {
                window.clearInterval(timer);
                resolve();
            }
        }, 120);
    });
}

const RULES = {
    title: { required: true, minLength: 4, maxLength: 30 },
    major: { required: "请选择所属专业" },
    model: { required: "请选择默认生图模型" },
    classes: { required: "至少选择一个班级" },
    tags: { maxLength: 3 },
    minutes: { min: 45, max: 180 },
    intro: { maxLength: 120 },
} as const;
const LABELS = { title: "课程名称", minutes: "单节时长", intro: "课程简介", tags: "标签" };

/** 新建课程：把 Select / Form / Upload 放进真实场景里看 */
function CourseFormDemo({ onNotice }: { onNotice: (message: string) => void }) {
    const [rejects, setRejects] = useState<string[]>([]);
    const form = useGammaForm<CourseForm>({
        initial: { title: "", major: null, model: "gpt-image-2", classes: [], tags: [], minutes: 90, intro: "" },
        rules: RULES,
        labels: LABELS,
        onSubmit: () =>
            new Promise((resolve) =>
                window.setTimeout(() => {
                    onNotice("课程已创建（演示）");
                    resolve();
                }, 900),
            ),
    });
    const { values, set, touch, errorOf, shake } = form;

    return (
        <form ref={form.formRef} noValidate onSubmit={form.handleSubmit} className="grid gap-5 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-6 ring-1 ring-[var(--gm-border)] lg:grid-cols-2">
            <GammaField label="课程名称" required error={errorOf("title")} count={[[...values.title.trim()].length, 30]} shakeKey={shake} hint="4–30 个字，学生在课程中心看到的就是这个">
                <FieldInput value={values.title} onChange={(value) => set("title", value)} onBlur={() => touch("title")} placeholder="例如：AIGC + 室内设计全流程实训" invalid={Boolean(errorOf("title"))} />
            </GammaField>
            <GammaField label="所属专业" required error={errorOf("major")} shakeKey={shake}>
                <GammaSelect options={MAJORS} value={values.major} onChange={(value) => set("major", value)} searchable clearable placeholder="选择专业" invalid={Boolean(errorOf("major"))} ariaLabel="所属专业" />
            </GammaField>
            <GammaField label="默认生图模型" required error={errorOf("model")} hint="学生可以在画布里改；右侧是单次消耗积分" shakeKey={shake}>
                <GammaSelect options={MODELS} value={values.model} onChange={(value) => set("model", value)} invalid={Boolean(errorOf("model"))} ariaLabel="默认生图模型" />
            </GammaField>
            <GammaField label="授课班级" required error={errorOf("classes")} shakeKey={shake}>
                <GammaSelect mode="multiple" options={CLASSES} value={values.classes} onChange={(value) => set("classes", value)} searchable placeholder="可多选" invalid={Boolean(errorOf("classes"))} ariaLabel="授课班级" />
            </GammaField>
            <GammaField label="标签" error={errorOf("tags")} hint="最多 3 个，可输入新标签后回车" shakeKey={shake}>
                <GammaSelect mode="tags" options={TAGS} value={values.tags} onChange={(value) => set("tags", value)} maxTags={3} placeholder="添加标签" invalid={Boolean(errorOf("tags"))} ariaLabel="标签" />
            </GammaField>
            <GammaField label="单节时长（分钟）" error={errorOf("minutes")} hint="45–180 分钟" shakeKey={shake}>
                <FieldInput type="number" value={String(values.minutes)} onChange={(value) => set("minutes", Number(value))} onBlur={() => touch("minutes")} invalid={Boolean(errorOf("minutes"))} />
            </GammaField>
            <GammaField label="课程简介" error={errorOf("intro")} count={[[...values.intro.trim()].length, 120]} shakeKey={shake} className="lg:col-span-2">
                <FieldTextarea value={values.intro} onChange={(value) => set("intro", value)} onBlur={() => touch("intro")} placeholder="一两句话说明这门课学什么、产出什么" invalid={Boolean(errorOf("intro"))} />
            </GammaField>
            <GammaField label="课件与参考资料" hint="文件名包含 fail 的会模拟上传失败，用来看重传" className="lg:col-span-2">
                <GammaUpload upload={fakeUpload} accept={["image/*", ".pdf", ".pptx", ".docx"]} maxSize={20 * 1024 * 1024} maxFiles={6} pasteToUpload onReject={setRejects} />
                {rejects.length ? (
                    <ul className="flex flex-col gap-0.5 text-xs text-[var(--gm-danger)]" role="alert">
                        {rejects.map((reason) => (
                            <li key={reason}>· {reason}</li>
                        ))}
                    </ul>
                ) : null}
            </GammaField>
            <div className="flex items-center justify-end gap-2 border-t border-[var(--gm-border)] pt-4 lg:col-span-2">
                <span className="mr-auto text-xs text-[var(--gm-text-3)]">{form.submitted && !form.isValid ? `还有 ${Object.keys(form.errors).length} 项需要修改` : "带 * 的为必填"}</span>
                <GammaButton variant="ghost" onClick={form.reset}>
                    重置
                </GammaButton>
                <GammaButton type="submit" loading={form.submitting}>
                    {form.submitting ? "创建中" : "创建课程"}
                </GammaButton>
            </div>
        </form>
    );
}

function FieldInput({ value, onChange, onBlur, placeholder, invalid, type = "text" }: { value: string; onChange: (value: string) => void; onBlur: () => void; placeholder?: string; invalid: boolean; type?: string }) {
    const field = useGammaFieldProps(invalid);
    return <input {...field} type={type} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} className={cn(GAMMA_FIELD_BOX, "h-10", gammaFieldRing(invalid))} />;
}

function FieldTextarea({ value, onChange, onBlur, placeholder, invalid }: { value: string; onChange: (value: string) => void; onBlur: () => void; placeholder?: string; invalid: boolean }) {
    const field = useGammaFieldProps(invalid);
    return <textarea {...field} rows={3} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} placeholder={placeholder} className={cn(GAMMA_FIELD_BOX, "resize-none py-2.5 leading-relaxed", gammaFieldRing(invalid))} />;
}

/** 把 GammaField 提供的 id / 描述 / 无效状态接到原生输入上 */
function useGammaFieldProps(invalid: boolean) {
    const { id, describedBy } = useGammaField();
    return { id, "aria-describedby": describedBy, "aria-invalid": invalid || undefined };
}

/** 选择器各种状态单独摆一排，方便对照 */
function SelectStates() {
    const [single, setSingle] = useState<string | null>("interior");
    const [multi, setMulti] = useState<string[]>(["室内 2301", "环艺 2302"]);
    return (
        <div className="grid gap-4 rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-6 ring-1 ring-[var(--gm-border)] sm:grid-cols-2 xl:grid-cols-4">
            {[
                { label: "默认", node: <GammaSelect options={MAJORS} value={single} onChange={setSingle} ariaLabel="默认" /> },
                { label: "小尺寸 · 可搜索", node: <GammaSelect size="sm" searchable options={MAJORS} value={single} onChange={setSingle} ariaLabel="小尺寸" /> },
                { label: "多选", node: <GammaSelect mode="multiple" options={CLASSES} value={multi} onChange={setMulti} ariaLabel="多选" /> },
                { label: "加载中", node: <GammaSelect loading options={[]} value={null} onChange={() => undefined} placeholder="正在加载班级" ariaLabel="加载中" /> },
                { label: "禁用", node: <GammaSelect disabled options={MAJORS} value="interior" onChange={() => undefined} ariaLabel="禁用" /> },
                { label: "报错", node: <GammaSelect invalid options={MAJORS} value={null} onChange={() => undefined} placeholder="请选择所属专业" ariaLabel="报错" /> },
                { label: "空结果", node: <GammaSelect searchable options={[]} value={null} onChange={() => undefined} emptyText="还没有创建班级" ariaLabel="空结果" /> },
                { label: "紧凑上传", node: <GammaUpload variant="compact" upload={fakeUpload} accept={["image/*"]} maxFiles={1} title="上传封面" /> },
            ].map((item) => (
                <div key={item.label} className="flex flex-col gap-1.5">
                    <span className="text-xs text-[var(--gm-text-3)]">{item.label}</span>
                    {item.node}
                </div>
            ))}
        </div>
    );
}

export function DesignForms({ onNotice }: { onNotice: (message: string) => void }) {
    return (
        <div className="flex flex-col gap-4">
            <CourseFormDemo onNotice={onNotice} />
            <SelectStates />
        </div>
    );
}
