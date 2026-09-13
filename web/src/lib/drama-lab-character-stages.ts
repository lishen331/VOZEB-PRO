import type { DramaAssetVisualDetails, DramaEpisode } from "./drama-project-contract";

type CharacterWithStages = { name: string; stages?: DramaAssetVisualDetails["stages"] };

export function characterStageAppearanceForEpisode(character: CharacterWithStages, episodeNumber: number) {
    if (!Number.isFinite(episodeNumber) || episodeNumber < 1) return "";
    const stage = character.stages?.find(({ episodeRange }) => episodeNumber >= episodeRange[0] && episodeNumber <= episodeRange[1]);
    return stage?.appearance?.trim() || "";
}

export function characterStageContextForEpisode(character: CharacterWithStages, episodeNumber: number) {
    const appearance = characterStageAppearanceForEpisode(character, episodeNumber);
    return appearance ? `${character.name}：${appearance}` : "";
}

export function boundCharacterStageContext(characters: CharacterWithStages[], episode: Pick<DramaEpisode, "episodeNumber">) {
    const episodeNumber = Math.max(1, Math.floor(Number(episode.episodeNumber) || 1));
    const rows = characters.map((character) => characterStageContextForEpisode(character, episodeNumber)).filter(Boolean);
    return rows.length ? `【本集角色阶段造型】\n${rows.join("\n")}` : "";
}
