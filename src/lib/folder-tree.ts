export type FolderNode = {
  id: string;
  name: string;
  parentId: string | null;
};

export type FolderTreeNode = FolderNode & {
  children: FolderTreeNode[];
};

/** Build a forest of folders sorted by name at each level. Orphans attach to root. */
export function buildFolderTree(folders: FolderNode[]): FolderTreeNode[] {
  const byId = new Map<string, FolderTreeNode>();
  for (const f of folders) {
    byId.set(f.id, { ...f, children: [] });
  }

  const roots: FolderTreeNode[] = [];
  for (const node of byId.values()) {
    const parent =
      node.parentId && byId.has(node.parentId)
        ? byId.get(node.parentId)!
        : null;
    if (parent && parent.id !== node.id) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (nodes: FolderTreeNode[]) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortRecursive(n.children);
  };
  sortRecursive(roots);
  return roots;
}

/** Depth-first flatten for indented selects / lists. */
export function flattenFolderTree(
  tree: FolderTreeNode[],
  depth = 0,
): Array<FolderNode & { depth: number }> {
  const out: Array<FolderNode & { depth: number }> = [];
  for (const node of tree) {
    out.push({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      depth,
    });
    out.push(...flattenFolderTree(node.children, depth + 1));
  }
  return out;
}

export function folderPathLabel(
  folders: FolderNode[],
  id: string,
  sep = " / ",
): string {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const parts: string[] = [];
  let cur: FolderNode | undefined = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(sep);
}

/** Ancestor chain from root → folder (inclusive). */
export function folderAncestors(
  folders: FolderNode[],
  id: string,
): FolderNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: FolderNode[] = [];
  let cur: FolderNode | undefined = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    chain.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

/** True if `candidateParentId` is the folder itself or a descendant (cycle). */
export function wouldCreateFolderCycle(
  folders: FolderNode[],
  folderId: string,
  candidateParentId: string | null,
): boolean {
  if (!candidateParentId) return false;
  if (candidateParentId === folderId) return true;
  const byId = new Map(folders.map((f) => [f.id, f]));
  let cur: FolderNode | undefined = byId.get(candidateParentId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    if (cur.id === folderId) return true;
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}
