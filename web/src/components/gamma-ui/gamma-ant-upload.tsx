"use client";

/*
 * gamma-ui 的 antd 兼容层：Upload / Upload.Dragger。
 * 覆盖站内「手动上传」用法：beforeUpload 自己处理文件并返回 false / Upload.LIST_IGNORE 阻止 antd 的默认上传队列。
 * 不维护受控的 fileList/onChange 上传队列（现有调用都配 showUploadList={false} 自行管理状态）。
 * 画布及其共享组件不使用本文件。
 */

import type { DragEvent, ReactNode } from "react";
import { Children, cloneElement, isValidElement, useId, useRef } from "react";

import { cn } from "@/lib/utils";

export type UploadBeforeUploadResult = boolean | string | void;

export interface UploadProps {
    accept?: string;
    multiple?: boolean;
    maxCount?: number;
    disabled?: boolean;
    showUploadList?: boolean;
    beforeUpload?: (file: File) => UploadBeforeUploadResult | Promise<UploadBeforeUploadResult>;
    children?: ReactNode;
    className?: string;
}

/** antd 用这个哨兵值标记「已处理，不进入上传队列也不报错」；本兼容层里与 false 效果一致 */
const LIST_IGNORE = "__GAMMA_UPLOAD_LIST_IGNORE__";

async function runBeforeUpload(beforeUpload: UploadProps["beforeUpload"], file: File) {
    if (!beforeUpload) return true;
    const result = await beforeUpload(file);
    return result !== false && result !== LIST_IGNORE;
}

function pickFiles(fileList: FileList | null, multiple: boolean, maxCount?: number) {
    const files = [...(fileList ?? [])];
    if (!multiple) return files.slice(0, 1);
    return maxCount ? files.slice(0, maxCount) : files;
}

function renderTrigger(children: ReactNode, onClick: () => void, disabled: boolean) {
    const only = Children.only(children);
    if (isValidElement<{ onClick?: (event: unknown) => void; disabled?: boolean }>(only)) {
        return cloneElement(only, {
            onClick: (event: unknown) => {
                (only.props as { onClick?: (event: unknown) => void }).onClick?.(event);
                if (!disabled) onClick();
            },
            disabled: disabled || only.props.disabled,
        });
    }
    return only;
}

/** 与 antd Upload 同 API（手动上传场景）：accept / maxCount / disabled / beforeUpload，点击 children 触发选择 */
export function Upload({ accept, multiple = false, maxCount, disabled = false, beforeUpload, children, className }: UploadProps) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = async (fileList: FileList | null) => {
        for (const file of pickFiles(fileList, multiple, maxCount)) {
            await runBeforeUpload(beforeUpload, file);
        }
    };

    return (
        <span className={className}>
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                multiple={multiple}
                accept={accept}
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                    void handleFiles(event.target.files);
                    event.target.value = "";
                }}
            />
            {renderTrigger(children, () => inputRef.current?.click(), disabled)}
        </span>
    );
}

Upload.LIST_IGNORE = LIST_IGNORE;

export interface UploadDraggerProps extends UploadProps {}

/** 与 antd Upload.Dragger 同 API：点击或拖拽文件到区域内触发 beforeUpload；showUploadList 未使用（调用处不维护队列） */
function UploadDragger({ accept, multiple = false, maxCount, disabled = false, beforeUpload, children, className }: UploadDraggerProps) {
    const inputId = useId();
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFiles = async (fileList: FileList | null) => {
        for (const file of pickFiles(fileList, multiple, maxCount)) {
            await runBeforeUpload(beforeUpload, file);
        }
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (disabled) return;
        void handleFiles(event.dataTransfer.files);
    };

    return (
        <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-disabled={disabled || undefined}
            onClick={() => !disabled && inputRef.current?.click()}
            onKeyDown={(event) => {
                if (!disabled && (event.key === "Enter" || event.key === " ")) inputRef.current?.click();
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={onDrop}
            className={cn(
                "gm-upload-dragger flex cursor-pointer flex-col items-center justify-center rounded-[var(--gm-radius-lg)] border border-dashed border-[var(--gm-border-strong)] bg-[var(--gm-wash)] px-6 py-8 text-center transition-colors hover:border-[var(--gm-accent)] hover:bg-[var(--gm-wash-strong)]",
                disabled && "cursor-not-allowed opacity-50 hover:border-[var(--gm-border-strong)] hover:bg-[var(--gm-wash)]",
                className,
            )}
        >
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                multiple={multiple}
                accept={accept}
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                    void handleFiles(event.target.files);
                    event.target.value = "";
                }}
            />
            {children}
        </div>
    );
}

Upload.Dragger = UploadDragger;
