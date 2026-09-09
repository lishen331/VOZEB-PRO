/** Reveal the containing segment/card before scrolling; no task or data mutation. */
export const DRAMA_LAB_SHOT_FOCUS = "drama-lab-shot-focus";
export function focusDramaLabShot(shotId: string) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(DRAMA_LAB_SHOT_FOCUS, { detail: { shotId } }));
    window.requestAnimationFrame(() => document.getElementById("storyboard-shot-" + shotId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
}
