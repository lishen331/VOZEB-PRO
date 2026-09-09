export type StoryboardShot = {
    id: string;
    shotNumber: number;
    segmentIndex?: number;
    segmentTitle?: string;
};

export type StoryboardShotGroup<T extends StoryboardShot = StoryboardShot> = {
    id: string;
    shots: T[];
    segmentIndex?: number;
    segmentTitle?: string;
    label: string;
    rangeLabel: string;
    startShotNumber: number;
    endShotNumber: number;
};

function normalizedTitle(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const title = value.trim();
    return title || undefined;
}

function validSegmentIndex(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function groupStoryboardShots<T extends StoryboardShot>(shots: readonly T[]): StoryboardShotGroup<T>[] {
    const groups: StoryboardShotGroup<T>[] = [];
    for (const shot of shots) {
        const segmentIndex = validSegmentIndex(shot.segmentIndex) ? shot.segmentIndex : undefined;
        const segmentTitle = normalizedTitle(shot.segmentTitle);
        const previous = groups.at(-1);
        const sameIdentity = previous && ((segmentIndex !== undefined && previous.segmentIndex === segmentIndex) || (segmentIndex === undefined && previous.segmentIndex === undefined && normalizedTitle(previous.segmentTitle) === segmentTitle));
        if (sameIdentity) {
            previous.shots.push(shot);
            if (!previous.segmentTitle && segmentTitle) previous.segmentTitle = segmentTitle;
            previous.endShotNumber = shot.shotNumber;
            previous.rangeLabel = formatRange(previous.startShotNumber, previous.endShotNumber);
            previous.label = formatLabel(previous.segmentIndex, previous.segmentTitle);
            continue;
        }
        groups.push({
            id: shot.id,
            shots: [shot],
            ...(segmentIndex === undefined ? {} : { segmentIndex }),
            ...(segmentTitle === undefined ? {} : { segmentTitle }),
            label: formatLabel(segmentIndex, segmentTitle),
            rangeLabel: formatRange(shot.shotNumber, shot.shotNumber),
            startShotNumber: shot.shotNumber,
            endShotNumber: shot.shotNumber,
        });
    }
    return groups;
}

function formatLabel(segmentIndex?: number, segmentTitle?: string): string {
    if (segmentIndex === undefined && !segmentTitle) return "未分幕";
    if (segmentIndex === undefined) return segmentTitle!;
    return segmentTitle ? `第 ${segmentIndex + 1} 幕 · ${segmentTitle}` : `第 ${segmentIndex + 1} 幕`;
}

function formatRange(start: number, end: number): string {
    return start === end ? `镜头 ${start}` : `镜头 ${start}–${end}`;
}
