"use client";

import { forwardRef, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { mentionAtCursor, type MentionAtCursor } from "@/lib/mention-at-cursor";
import { useCanvasColorTheme } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { handleMentionNavigation } from "../utils/canvas-mention-navigation";

export function canvasResourceMentionAtCursor(value: string, cursor: number): MentionAtCursor | undefined {
    return mentionAtCursor(value, cursor);
}

export function canvasResourceMentionMenuZIndex(modalZIndex?: string) {
    const parsed = Number.parseInt(modalZIndex || "", 10);
    return Number.isFinite(parsed) ? parsed + 1 : 120;
}

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    containerClassName?: string;
    highlightLabels?: boolean;
};

export const CanvasResourceMentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function CanvasResourceMentionTextarea(
    { value, references, onChange, onSubmit, onKeyDown, className, containerClassName, style, highlightLabels = true, autoFocus, ...props },
    forwardedRef,
) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);

    // The overlay is a separate element with its own scroll offset, so the two
    // layers only stay aligned while we keep copying it across. Every path that
    // can scroll the textarea — typing, the caret moves below, user scrolling —
    // has to re-sync, including *after* paint, because moving the caret scrolls
    // the textarea to reveal it and that lands later than the render effect.
    const syncOverlayScroll = useCallback(() => {
        if (!overlayRef.current || !textareaRef.current) return;
        overlayRef.current.scrollTop = textareaRef.current.scrollTop;
        overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }, []);

    const [mention, setMention] = useState<MentionAtCursor | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [hasSelection, setHasSelection] = useState(false);

    useEffect(() => {
        if (!autoFocus) return;
        const frame = requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            textarea.focus();
            textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            syncOverlayScroll();
        });
        return () => cancelAnimationFrame(frame);
    }, [autoFocus, syncOverlayScroll]);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        const activeReferences = references.filter((item) => item.active);
        if (!query) return activeReferences;
        return activeReferences.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [mention, references]);
    const activeLabels = useMemo(() => (highlightLabels ? Array.from(new Set(references.filter((item) => item.active).map((item) => item.label))).sort((a, b) => b.length - a.length) : []), [highlightLabels, references]);

    const updateValue = (next: string, selectionStart?: number) => {
        onChange(next);
        if (typeof selectionStart !== "number") return;
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(selectionStart, selectionStart);
            // Setting the selection scrolls the textarea to reveal the caret;
            // the overlay would otherwise stay at the previous offset.
            syncOverlayScroll();
        });
    };

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const syncMention = (nextValue: string, cursor: number) => {
        const nextMention = canvasResourceMentionAtCursor(nextValue, cursor);
        if (!nextMention || !references.some((item) => item.active)) {
            closeMention();
            return;
        }
        setMention(nextMention);
        setActiveIndex(0);
    };

    const insertReference = (reference: CanvasResourceReference) => {
        if (!mention) return;
        const textarea = textareaRef.current;
        const end = textarea?.selectionStart ?? value.length;
        const insertText = `${reference.label} `;
        const next = `${value.slice(0, mention.start)}${insertText}${value.slice(end)}`;
        closeMention();
        updateValue(next, mention.start + insertText.length);
    };

    const updateSelectionState = () => {
        const textarea = textareaRef.current;
        setHasSelection(Boolean(textarea && textarea.selectionStart !== textarea.selectionEnd));
    };

    const hasActiveLabelInValue = activeLabels.some((label) => value.includes(label));
    const showOverlay = Boolean(value && hasActiveLabelInValue && !hasSelection);

    // The overlay is a separate element with its own scroll offset. It mounts
    // fresh (scrollTop 0) whenever showOverlay flips on, while the textarea may
    // already be scrolled — autoFocus parks the caret at the end of a long value,
    // and typing/pasting scrolls further. Without this sync the visible glyphs
    // come from the top of the overlay while the caret sits at the bottom of the
    // textarea, which renders as overlapping/misaligned text. Must run before
    // paint, so useLayoutEffect rather than useEffect.
    useLayoutEffect(() => {
        syncOverlayScroll();
    }, [syncOverlayScroll, showOverlay, value]);

    // antd's reset.css sets `textarea { font-size: inherit; line-height: inherit }`
    // outside any cascade layer, so it beats Tailwind's layered `text-*`/`leading-*`
    // on the textarea but not on the overlay div. Copy the overlay's resolved
    // metrics onto the textarea inline so both layers lay out identically.
    const [fontMetrics, setFontMetrics] = useState<CSSProperties>({});
    useLayoutEffect(() => {
        const overlay = overlayRef.current;
        if (!overlay) return;
        const computed = window.getComputedStyle(overlay);
        setFontMetrics((current) => {
            const next = { fontFamily: computed.fontFamily, fontSize: computed.fontSize, fontWeight: computed.fontWeight, lineHeight: computed.lineHeight, letterSpacing: computed.letterSpacing };
            return Object.entries(next).every(([key, val]) => current[key as keyof CSSProperties] === val) ? current : next;
        });
    }, [className, style]);

    // Both layers must break lines at exactly the same character, or every line
    // after the first divergent wrap point drifts and the text reads as doubled /
    // mis-spaced. The overlay carries Tailwind's `break-words`
    // (overflow-wrap: break-word); a <textarea> defaults to overflow-wrap:
    // normal and to white-space: pre-wrap. Pin all three properties identically
    // on both layers so mixed CJK/latin runs wrap the same way.
    const textMetricStyle = {
        whiteSpace: "pre-wrap",
        overflowWrap: "break-word",
        wordBreak: "normal",
    } as const;
    const mergedStyle = {
        ...fontMetrics,
        ...(style || {}),
        ...textMetricStyle,
        color: showOverlay ? "transparent" : style?.color,
        caretColor: theme.node.text,
        ...(showOverlay ? { background: "transparent", backgroundColor: "transparent" } : {}),
    } as CSSProperties;
    const menu = mention && candidates.length && textareaRef.current ? <MentionMenu textarea={textareaRef.current} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} /> : null;

    return (
        <div className={`relative h-full w-full ${containerClassName || ""}`}>
            {/* Always mounted (hidden when unused) so its resolved font metrics can be mirrored onto the textarea. */}
            {/* Keep the overlay's scrollbar (just invisible) so its content box is as narrow as the textarea's. */}
            <div
                ref={overlayRef}
                aria-hidden
                className={`${className || ""} pointer-events-none absolute inset-0`}
                style={{ ...style, ...textMetricStyle, color: theme.node.text, scrollbarColor: "transparent transparent", visibility: showOverlay ? "visible" : "hidden" }}
            >
                {showOverlay ? (
                    <>
                        <MentionHighlightText value={value || props.placeholder?.toString() || ""} labels={activeLabels} references={references} placeholder={!value} />
                        {/* A textarea renders an empty last line after a trailing newline; a div does not. */}
                        {value.endsWith("\n") ? String.fromCharCode(0x200b) : null}
                    </>
                ) : null}
            </div>
            <textarea
                {...props}
                autoFocus={autoFocus}
                ref={(node) => {
                    textareaRef.current = node;
                    if (typeof forwardedRef === "function") forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                value={value}
                className={className}
                style={mergedStyle}
                onChange={(event) => {
                    const next = event.target.value;
                    onChange(next);
                    syncMention(next, event.target.selectionStart);
                    requestAnimationFrame(() => {
                        syncOverlayScroll();
                        updateSelectionState();
                    });
                }}
                onSelect={(event) => {
                    updateSelectionState();
                    props.onSelect?.(event);
                }}
                onFocus={(event) => {
                    updateSelectionState();
                    props.onFocus?.(event);
                }}
                onKeyUp={(event) => {
                    updateSelectionState();
                    props.onKeyUp?.(event);
                }}
                onPointerUp={(event) => {
                    updateSelectionState();
                    props.onPointerUp?.(event);
                }}
                onKeyDown={(event) => {
                    if (mention && handleMentionNavigation(event, candidates, activeIndex, setActiveIndex, insertReference, closeMention)) return;
                    if (event.key === "Enter" && onSubmit && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                        event.preventDefault();
                        onSubmit();
                        return;
                    }
                    onKeyDown?.(event);
                }}
                onScroll={(event) => {
                    syncOverlayScroll();
                    props.onScroll?.(event);
                }}
                onBlur={(event) => {
                    setHasSelection(false);
                    window.setTimeout(closeMention, 120);
                    props.onBlur?.(event);
                }}
            />
            {menu}
        </div>
    );
});

export function CanvasResourceMentionText({ value, references }: { value: string; references: CanvasResourceReference[] }) {
    const labels = Array.from(new Set(references.filter((reference) => reference.active).map((reference) => reference.label))).sort((a, b) => b.length - a.length);
    return <MentionHighlightText value={value} labels={labels} references={references} placeholder={!value} />;
}

function MentionHighlightText({ value, labels, references, placeholder }: { value: string; labels: string[]; references: CanvasResourceReference[]; placeholder: boolean }) {
    if (placeholder) return <span className="opacity-45">{value}</span>;
    if (!labels.length) return <>{value}</>;
    const pattern = new RegExp(`(${labels.map(escapeRegExp).join("|")})`, "g");
    const referencesByLabel = new Map(references.filter((reference) => reference.active).map((reference) => [reference.label, reference]));
    return <>{value.split(pattern).map((part, index) => (referencesByLabel.has(part) ? <ReferenceToken key={`${part}-${index}`} reference={referencesByLabel.get(part)!} /> : <span key={`${part}-${index}`}>{part}</span>))}</>;
}

function ReferenceToken({ reference }: { reference: CanvasResourceReference }) {
    // Drawn with an INSET box-shadow instead of Tailwind's `ring-1`. A ring is
    // painted outside the inline box, and the CJK inline box is taller than the
    // leading-5 line height, so the ring bled onto the lines above and below and
    // read as doubled text with wrong spacing. Inset keeps the outline strictly
    // inside the glyph box, so the highlight lines up with the surrounding text.
    return (
        <span data-canvas-resource-reference={reference.nodeId} title={reference.title} className="rounded-sm bg-[#2f80ff]/12 text-[#2f80ff]" style={{ boxShadow: "inset 0 0 0 1px rgb(47 128 255 / 0.24)" }}>
            {reference.label}
        </span>
    );
}

function MentionMenu({
    textarea,
    references,
    activeIndex,
    theme,
    onSelect,
}: {
    textarea: HTMLTextAreaElement;
    references: CanvasResourceReference[];
    activeIndex: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelect: (reference: CanvasResourceReference) => void;
}) {
    const selectedRef = useRef(false);
    const rect = textarea.getBoundingClientRect();
    const modalContent = textarea.closest(".ant-modal-content");
    const modalWrap = textarea.closest<HTMLElement>(".ant-modal-wrap");
    const boundary = modalContent?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const zIndex = canvasResourceMentionMenuZIndex(modalWrap ? window.getComputedStyle(modalWrap).zIndex : undefined);
    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const left = clamp(rect.left, boundary.left + 8, boundary.right - menuWidth - 8);
    const showAbove = rect.bottom + gap + maxMenuHeight > boundary.bottom && rect.top - gap - maxMenuHeight >= boundary.top;
    const top = clamp(showAbove ? rect.top - gap - maxMenuHeight : rect.bottom + gap, boundary.top + 8, boundary.bottom - maxMenuHeight - 8);

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => {
        event.stopPropagation();
    };
    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div
            data-canvas-resource-mention-menu="true"
            className="fixed max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md"
            style={{ left, top, zIndex, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={imagePreviewUrl(reference.previewUrl, 96)} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
