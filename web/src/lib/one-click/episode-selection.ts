export function selectEpisode<T extends { id: string }>(episodes: T[], selectedId?: string, activeId?: string): T | undefined {
    return episodes.find((episode) => episode.id === selectedId) || episodes.find((episode) => episode.id === activeId) || episodes[0];
}
export function replaceEpisode<T extends { id: string }>(episodes: T[], updated: T): T[] {
    return episodes.some((episode) => episode.id === updated.id) ? episodes.map((episode) => (episode.id === updated.id ? updated : episode)) : [...episodes, updated];
}
