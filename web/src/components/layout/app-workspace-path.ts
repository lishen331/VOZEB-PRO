export function isFullscreenWorkspacePath(pathname: string) {
    return /^\/(?:canvas|drama|drama-lab)\/[^/]+(?:\/|$)/.test(pathname);
}
