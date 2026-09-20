import { Extension, RangeSetBuilder, StateField } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  LayerMarker,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  layer,
} from "@codemirror/view";

import { LineHierarchy, MAX_HEADING_LEVEL, computeLineHierarchy, depthClass } from "./hierarchy";

const hierarchyField = StateField.define<LineHierarchy>({
  create: (state) => computeLineHierarchy(Array.from(state.doc.iterLines())),
  update: (value, tr) =>
    tr.docChanged ? computeLineHierarchy(Array.from(tr.newDoc.iterLines())) : value,
});

function rowDepth(view: EditorView, pos: number): number {
  const { depths } = view.state.field(hierarchyField);
  return Math.min(depths[view.state.doc.lineAt(pos).number - 1] ?? 0, MAX_HEADING_LEVEL);
}

/* Insets. A .cm-line gets its depth as a line decoration. A block widget
   (table, callout, math, embed) replaces its source lines, so decorations never
   reach it; the view plugin tags its DOM instead, once CodeMirror has synced it. */

const CONTENT_DECORATIONS: Decoration[] = [];
const HEADING_DECORATIONS: Decoration[] = [];
for (let depth = 1; depth <= MAX_HEADING_LEVEL; depth++) {
  CONTENT_DECORATIONS[depth] = Decoration.line({ class: `rgh-cm ${depthClass(depth)}` });
  HEADING_DECORATIONS[depth] = Decoration.line({
    class: `rgh-cm rgh-cm-head ${depthClass(depth)}`,
  });
}

const WIDGET_CLASS = "rgh-cm-widget";
const DEPTH_ATTRIBUTE = "data-rgh-depth";

function tagWidget(el: Element, depth: number) {
  const previous = el.getAttribute(DEPTH_ATTRIBUTE);
  if (previous === String(depth)) return;
  if (previous !== null) el.classList.remove(depthClass(Number(previous)));
  if (depth >= 1) {
    el.classList.add("rgh-cm", WIDGET_CLASS, depthClass(depth));
    el.setAttribute(DEPTH_ATTRIBUTE, String(depth));
  } else {
    el.classList.remove("rgh-cm", WIDGET_CLASS);
    el.removeAttribute(DEPTH_ATTRIBUTE);
  }
}

function isBlockWidget(el: Element) {
  return !el.classList.contains("cm-line") && !el.classList.contains("cm-gap");
}

class InsetView implements PluginValue {
  decorations: DecorationSet;

  private readonly tagWidgets = {
    key: this,
    read: () => null,
    write: (_: null, view: EditorView) => this.tagBlockWidgets(view),
  };

  constructor(private readonly view: EditorView) {
    this.decorations = this.buildVisibleDecorations(view);
    view.requestMeasure(this.tagWidgets);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildVisibleDecorations(update.view);
    }
    update.view.requestMeasure(this.tagWidgets);
  }

  destroy() {
    for (const el of Array.from(this.view.contentDOM.children)) {
      if (isBlockWidget(el)) tagWidget(el, 0);
    }
  }

  private tagBlockWidgets(view: EditorView) {
    for (const el of Array.from(view.contentDOM.children)) {
      if (!isBlockWidget(el)) continue;
      let pos: number;
      try {
        pos = view.posAtDOM(el);
      } catch {
        continue;
      }
      tagWidget(el, rowDepth(view, pos));
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

/* Guides. Drawn on a layer beneath the text, one rectangle per unbroken run of
   rows, from CodeMirror's own block geometry. Nothing about a row's DOM — a
   table's overflow clipping, a wide one scrolling, a callout's hover styling —
   can touch them, and a run has no seams for rounding to open up. */

class GuideMarker implements LayerMarker {
  constructor(
    readonly level: number,
    readonly left: number,
    readonly top: number,
    readonly height: number,
  ) {}

  eq(other: GuideMarker) {
    return (
      this.level === other.level &&
      this.left === other.left &&
      this.top === other.top &&
      this.height === other.height
    );
  }

  draw() {
    const el = createDiv({ cls: ["rgh-guide", `rgh-guide-l${this.level}`] });
    this.place(el);
    return el;
  }

  update(el: HTMLElement, previous: GuideMarker) {
    if (previous.level !== this.level) return false;
    this.place(el);
    return true;
  }

  private place(el: HTMLElement) {
    el.style.left = `${this.left}px`;
    el.style.top = `${this.top}px`;
    el.style.height = `${this.height}px`;
  }
}

const NO_RUN = -1;

function guideMarkers(view: EditorView): GuideMarker[] {
  const scroller = view.scrollDOM.getBoundingClientRect();
  const baseLeft = scroller.left - view.scrollDOM.scrollLeft * view.scaleX;
  const baseTop = scroller.top - view.scrollDOM.scrollTop * view.scaleY;
  const left = view.contentDOM.getBoundingClientRect().left - baseLeft;
  const documentTop = view.documentTop - baseTop;

  const markers: GuideMarker[] = [];
  const runStart = new Array<number>(MAX_HEADING_LEVEL + 1).fill(NO_RUN);
  const close = (level: number, bottom: number) => {
    markers.push(new GuideMarker(level, left, runStart[level], bottom - runStart[level]));
    runStart[level] = NO_RUN;
  };

  let bottom = 0;
  for (const block of view.viewportLineBlocks) {
    const depth = rowDepth(view, block.from);
    const top = documentTop + block.top;
    bottom = top + block.height;
    for (let level = 1; level <= MAX_HEADING_LEVEL; level++) {
      const open = runStart[level] !== NO_RUN;
      if (level <= depth && !open) runStart[level] = top;
      else if (level > depth && open) close(level, top);
    }
  }
  for (let level = 1; level <= MAX_HEADING_LEVEL; level++) {
    if (runStart[level] !== NO_RUN) close(level, bottom);
  }

  return markers;
}

const guideLayer = layer({
  above: false,
  class: "rgh-guide-layer",
  update: (update) => update.docChanged || update.viewportChanged,
  markers: guideMarkers,
});

export const hierarchyGuideExtension: Extension = [
  hierarchyField,
  ViewPlugin.fromClass(InsetView, { decorations: (value) => value.decorations }),
  guideLayer,
];
