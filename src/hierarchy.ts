import type { CachedMetadata, SectionCache } from "obsidian";

export const MAX_HEADING_LEVEL = 6;

export const depthClass = (depth: number) => `rgh-depth-${depth}`;

const ancestorCount = (headingLevel: number) => headingLevel - 1;

/** One entry per `cache.sections`, holding how many guide lines that block gets. */
export function computeSectionDepths(cache: CachedMetadata): Int8Array {
  const sections = cache.sections ?? [];
  const levelByLine = new Map<number, number>();
  for (const heading of cache.headings ?? []) {
    levelByLine.set(heading.position.start.line, heading.level);
  }

  const depths = new Int8Array(sections.length);
  let enclosingLevel = 0;

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const headingLevel =
      section.type === "heading" ? levelByLine.get(section.position.start.line) : undefined;

    if (headingLevel === undefined) {
      depths[i] = enclosingLevel;
    } else {
      depths[i] = ancestorCount(headingLevel);
      enclosingLevel = headingLevel;
    }
  }

  return depths;
}

export function findSectionIndex(sections: SectionCache[], line: number): number {
  let low = 0;
  let high = sections.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const { start, end } = sections[middle].position;
    if (line < start.line) high = middle - 1;
    else if (line > end.line) low = middle + 1;
    else return middle;
  }

  return -1;
}
