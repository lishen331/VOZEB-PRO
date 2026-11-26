export function displayWorkCount(count: number, offset = 0) {
    return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, count + offset));
}
