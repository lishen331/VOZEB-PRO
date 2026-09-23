export type PermissionTreeNode = { key: string; children?: readonly PermissionTreeNode[] };

export function permissionTreeCheckState(tree: readonly PermissionTreeNode[], permissions: readonly string[]) {
    const leafKeys = new Set<string>();
    const collectLeafKeys = (nodes: readonly PermissionTreeNode[]) => nodes.forEach((node) => (node.children?.length ? collectLeafKeys(node.children) : leafKeys.add(node.key)));
    collectLeafKeys(tree);
    const selected = new Set(permissions.filter((key) => leafKeys.has(key)));
    const checked = [...selected];
    const halfChecked: string[] = [];
    const visit = (node: PermissionTreeNode): boolean => {
        if (!node.children?.length) return selected.has(node.key);
        const states = node.children.map(visit);
        if (states.every(Boolean)) {
            checked.push(node.key);
            return true;
        }
        if (states.some(Boolean)) halfChecked.push(node.key);
        return false;
    };
    tree.forEach(visit);
    return { checked, halfChecked };
}

export function updatePermissionTreeSelection(tree: readonly PermissionTreeNode[], permissions: readonly string[], targetKey: string, checked: boolean) {
    const leafKeys: string[] = [];
    let target: PermissionTreeNode | undefined;
    const visit = (node: PermissionTreeNode) => {
        if (node.key === targetKey) target = node;
        if (node.children?.length) node.children.forEach(visit);
        else leafKeys.push(node.key);
    };
    tree.forEach(visit);
    if (!target) return permissions.filter((key) => leafKeys.includes(key));
    const targetLeafKeys: string[] = [];
    const collectTargetLeafKeys = (node: PermissionTreeNode) => (node.children?.length ? node.children.forEach(collectTargetLeafKeys) : targetLeafKeys.push(node.key));
    collectTargetLeafKeys(target);
    const next = new Set(permissions.filter((key) => leafKeys.includes(key)));
    targetLeafKeys.forEach((key) => (checked ? next.add(key) : next.delete(key)));
    return leafKeys.filter((key) => next.has(key));
}
