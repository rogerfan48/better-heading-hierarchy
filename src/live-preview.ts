import { Extension, RangeSetBuilder, StateField, Text } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
} from "@codemirror/view";

import { MAX_HEADING_LEVEL, depthClass } from "./hierarchy";

const HEADING_PATTERN = /^ {0,3}(#{1,6})(?: |$)/;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

const ancestorCount = (headingLevel: number) => headingLevel - 1;

const closesFence = (match: RegExpExecArray | null, openingFence: string) =>
  match !== null && match[1][0] === openingFence[0] && match[1].length >= openingFence.length;

interface LineHierarchy {
  depths: Uint8Array;
  headings: Uint8Array;
}

export function computeLineHierarchy(doc: Text): LineHierarchy {
  const depths = new Uint8Array(doc.lines);
  const headings = new Uint8Array(doc.lines);

  let enclosingLevel = 0;
  let openFence: string | null = null;
  let inFrontmatter = false;
  let index = 0;

  for (const text of doc.iterLines()) {
    const line = index++;
    const trimmed = text.trimEnd();

    if (line === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---" || trimmed === "...") inFrontmatter = false;
      continue;
    }

    const fenceMatch = FENCE_PATTERN.exec(text);
    if (openFence !== null) {
      if (closesFence(fenceMatch, openFence)) openFence = null;
      depths[line] = enclosingLevel;
      continue;
    }
    if (fenceMatch) {
      openFence = fenceMatch[1];
      depths[line] = enclosingLevel;
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(text);
    if (headingMatch) {
      enclosingLevel = headingMatch[1].length;
      depths[line] = ancestorCount(enclosingLevel);
      headings[line] = 1;
    } else {
      depths[line] = enclosingLevel;
    }
  }

  return { depths, headings };
}

const hierarchyField = StateField.define<LineHierarchy>({
  create: (state) => computeLineHierarchy(state.doc),
  update: (value, tr) => (tr.docChanged ? computeLineHierarchy(tr.newDoc) : value),
});

const CONTENT_DECORATIONS: Decoration[] = [];
const HEADING_DECORATIONS: Decoration[] = [];
for (let depth = 1; depth <= MAX_HEADING_LEVEL; depth++) {
  CONTENT_DECORATIONS[depth] = Decoration.line({ class: `rgh-cm ${depthClass(depth)}` });
  HEADING_DECORATIONS[depth] = Decoration.line({
    class: `rgh-cm rgh-cm-head ${depthClass(depth)}`,
  });
}

class HierarchyGuideView implements PluginValue {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildVisibleDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildVisibleDecorations(update.view);
    }
  }

  private buildVisibleDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const { depths, headings } = view.state.field(hierarchyField);
    const doc = view.state.doc;

    for (const { from, to } of view.visibleRanges) {
      let pos = from;
      while (pos <= to) {
        const line = doc.lineAt(pos);
        const depth = Math.min(depths[line.number - 1] ?? 0, MAX_HEADING_LEVEL);
        if (depth >= 1) {
          const table = headings[line.number - 1] ? HEADING_DECORATIONS : CONTENT_DECORATIONS;
          builder.add(line.from, line.from, table[depth]);
        }
        if (line.to >= doc.length) break;
        pos = line.to + 1;
      }
    }

    return builder.finish();
  }
}

export const hierarchyGuideExtension: Extension = [
  hierarchyField,
  ViewPlugin.fromClass(HierarchyGuideView, { decorations: (value) => value.decorations }),
];
