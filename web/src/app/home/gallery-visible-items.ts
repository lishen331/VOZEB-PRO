export function filterVisibleGalleryItems<T extends { slug: string }>(items: readonly T[], failedSlugs: ReadonlySet<string>) {
    return items.filter((item) => !failedSlugs.has(item.slug));
}

export function publicGalleryEmptyState(category: string, keyword: string) {
    if (category && category !== "all") return { title: `${category}分类暂无可展示作品`, description: "目前没有该分类的已公开作品，切换到其他分类继续浏览。" };
    if (keyword.trim()) return { title: "没有找到相关作品", description: "换一个关键词试试。" };
    return { title: "还没有公开作品", description: "审核通过并公开发布的作品会出现在这里。" };
}
