/**
 * Generate a UUID on the client side.
 * Uses crypto.randomUUID() in HTTPS/localhost, falls back to a custom implementation in HTTP.
 */
export function generateClientUUID(): string {
    // Try native crypto.randomUUID() first (requires HTTPS or localhost)
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        try {
            return crypto.randomUUID();
        } catch {
            // Fall through to fallback
        }
    }

    // Fallback implementation for HTTP environments
    // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const random = (Math.random() * 16) | 0;
        const value = char === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}
