type Listener = (revision: number) => void;
const listeners = new Set<Listener>();
export function subscribeSettingsEvents(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}
export function publishSettingsUpdated(revision: number) {
    for (const listener of listeners) listener(revision);
}
