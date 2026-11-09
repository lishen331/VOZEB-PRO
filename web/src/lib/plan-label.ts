export function planDisplayName(value: string | null | undefined) {
    return !value || value === "免费版" ? "体验版" : value;
}
