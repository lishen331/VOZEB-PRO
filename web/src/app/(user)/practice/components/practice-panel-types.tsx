import { Input, InputNumber, Select, Switch } from "antd";
import type { PracticeModuleCapability, PracticeModuleInputField, PracticeModuleKind } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import type { PracticeSession } from "@/services/api/practice";
import type { UploadedImage } from "@/services/image-storage";

export type PracticeDefaultInput = {
    prompt?: string;
    text?: string;
    workflowInput?: Record<string, unknown>;
    images?: Record<string, UploadedImage>;
};

export type PracticePanelProps = {
    capability: PracticeModuleCapability;
    ipReferences: IpReference[];
    onIpReferencesChange: (value: IpReference[]) => void;
    onCreated: (session: PracticeSession) => void;
    defaultInput?: PracticeDefaultInput | null;
};

export type PracticePanelModule = PracticeModuleKind;

/** 与 Demo 一致：有尺寸预设时用“尺寸比例”下拉，默认选中与工作流默认宽高一致的预设，否则选第一项。 */
export function workflowFieldDefaults(capability: PracticeModuleCapability) {
    const defaults = Object.fromEntries(capability.inputSchema.filter((field) => field.defaultValue !== undefined && !["prompt", "text"].includes(field.key) && !isDialogueSlotField(field.key)).map((field) => [field.key, field.defaultValue]));
    const size = defaultSizeOption(capability, defaults);
    if (size) Object.assign(defaults, { width: size.width, height: size.height });
    const durations = capability.durationOptions || [];
    if (durations.length) defaults.duration = typeof defaults.duration === "number" && durations.includes(defaults.duration) ? defaults.duration : durations[0];
    return defaults;
}

export function defaultSizeOption(capability: Pick<PracticeModuleCapability, "sizeOptions">, current: Record<string, unknown>) {
    const options = capability.sizeOptions || [];
    if (!options.length) return undefined;
    return options.find((option) => option.width === current.width && option.height === current.height) || options[0];
}

/** 由尺寸/时长下拉接管的字段，不再渲染成裸数字框。 */
function isPresetManagedField(capability: PracticeModuleCapability, key: string) {
    if ((key === "width" || key === "height") && capability.sizeOptions?.length) return true;
    if (key === "duration" && capability.durationOptions?.length) return true;
    return false;
}

export function workflowFormFields(capability: PracticeModuleCapability) {
    return capability.inputSchema.filter((field, index, fields) => {
        if (fields.findIndex((item) => item.key === field.key) !== index) return false;
        if (["prompt", "text", "referenceImage", "sceneImage", "characterPropImage1", "characterPropImage2", "characterPropImage3", "image", "audio"].includes(field.key)) return false;
        if (/^s\d+_/.test(field.key)) return false;
        if (isPresetManagedField(capability, field.key)) return false;
        return field.required || field.type === "text" || field.type === "textarea";
    });
}

export function PracticeSizeField({ capability, value, onChange, label = "尺寸比例" }: { capability: PracticeModuleCapability; value: Record<string, unknown>; onChange: (patch: { width: number; height: number }) => void; label?: string }) {
    const options = capability.sizeOptions || [];
    if (!options.length) return null;
    const selected = defaultSizeOption(capability, value);
    return (
        <label className="block text-sm font-medium">
            {label}
            <Select
                aria-label={label}
                value={selected?.key}
                onChange={(key) => {
                    const option = options.find((item) => item.key === key);
                    if (option) onChange({ width: option.width, height: option.height });
                }}
                options={options.map((option) => ({ value: option.key, label: option.label }))}
                className="!mt-2 !w-full"
            />
        </label>
    );
}

export function PracticeDurationField({ capability, value, onChange, label = "视频时长" }: { capability: PracticeModuleCapability; value: Record<string, unknown>; onChange: (duration: number) => void; label?: string }) {
    const options = capability.durationOptions || [];
    if (!options.length) return null;
    const current = typeof value.duration === "number" && options.includes(value.duration) ? value.duration : options[0];
    return (
        <label className="block text-sm font-medium">
            {label}
            <Select aria-label={label} value={current} onChange={(next) => onChange(Number(next))} options={options.map((seconds) => ({ value: seconds, label: `${seconds} 秒` }))} className="!mt-2 !w-full" />
        </label>
    );
}

export function WorkflowFormFields({ capability, value, onChange }: { capability: PracticeModuleCapability; value: Record<string, unknown>; onChange: (key: string, next: unknown) => void }) {
    const fields = workflowFormFields(capability);
    if (!fields.length) return null;
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
                <WorkflowField key={field.key} field={field} value={value[field.key]} onChange={(next) => onChange(field.key, next)} />
            ))}
        </div>
    );
}

export function WorkflowOptionalFields({ capability, value, onChange }: { capability: PracticeModuleCapability; value: Record<string, unknown>; onChange: (key: string, next: unknown) => void }) {
    const fields = capability.inputSchema.filter(
        (field, index, fields) => fields.findIndex((item) => item.key === field.key) === index && !field.required && !isDialogueSlotField(field.key) && !isPresetManagedField(capability, field.key) && ["number", "enum", "boolean"].includes(field.type),
    );
    if (!fields.length) return null;
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((field) => (
                <WorkflowField key={field.key} field={field} value={value[field.key]} onChange={(next) => onChange(field.key, next)} />
            ))}
        </div>
    );
}

function WorkflowField({ field, value, onChange }: { field: PracticeModuleInputField; value: unknown; onChange: (value: unknown) => void }) {
    if (field.type === "text" || field.type === "textarea")
        return (
            <label className="block text-sm font-medium">
                {field.label}
                {field.required ? " *" : ""}
                <Input.TextArea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} autoSize={{ minRows: field.type === "textarea" ? 2 : 1, maxRows: 6 }} className="!mt-2" />
            </label>
        );
    if (field.type === "number")
        return (
            <label className="block text-sm font-medium">
                {field.label}
                {field.required ? " *" : ""}
                <InputNumber value={typeof value === "number" ? value : undefined} onChange={(next) => onChange(next ?? undefined)} className="!mt-2 !w-full" />{" "}
            </label>
        );
    if (field.type === "enum")
        return (
            <label className="block text-sm font-medium">
                {field.label}
                <Select value={typeof value === "string" ? value : undefined} onChange={onChange} options={(field.options || []).map((option) => ({ value: option, label: option }))} className="!mt-2 !w-full" />{" "}
            </label>
        );
    return (
        <label className="flex items-center justify-between gap-3 border border-border p-3 text-sm font-medium">
            {field.label}
            <Switch checked={value === true} onChange={onChange} />
        </label>
    );
}

function isDialogueSlotField(key: string) {
    return /^s\d+_/.test(key);
}

export function capabilityForWorkflow(capability: PracticeModuleCapability, code: string, modelId?: string): PracticeModuleCapability {
    const options = capability.models.find((model) => model.id === modelId)?.workflowOptions || capability.workflowOptions;
    const workflow = options?.find((option) => option.code === code);
    return {
        ...capability,
        available: capability.available && (!options?.length || Boolean(workflow)),
        inputSchema: workflow?.inputSchema || capability.inputSchema,
        sizeOptions: workflow ? workflow.sizeOptions : capability.sizeOptions,
        durationOptions: workflow ? workflow.durationOptions : capability.durationOptions,
    };
}
