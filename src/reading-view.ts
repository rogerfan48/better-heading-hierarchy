import {
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  MarkdownSectionInformation,
} from "obsidian";

import BetterHeadingHierarchyPlugin from "../main";
import { LineHierarchy, MAX_HEADING_LEVEL, computeLineHierarchy, depthClass } from "./hierarchy";

const HIERARCHY_CACHE_LIMIT = 8;

// getSectionInfo() hands every block the full text it was rendered from, and
// Obsidian reuses that string across a render, so scanning it once per document
// costs nothing and can never disagree with what is on screen — unlike the
// metadata cache, which lags behind edits.
const hierarchyByText = new Map<string, LineHierarchy>();

function hierarchyFor(text: string): LineHierarchy {
  let hierarchy = hierarchyByText.get(text);
  if (!hierarchy) {
    if (hierarchyByText.size >= HIERARCHY_CACHE_LIMIT) hierarchyByText.clear();
    hierarchy = computeLineHierarchy(text.split("\n"));
    hierarchyByText.set(text, hierarchy);
  }
  return hierarchy;
}

function sectionType(el: HTMLElement): string {
  const block = el.firstElementChild;
  if (!block) return "empty";
  switch (block.tagName) {
    case "P":
      return "paragraph";
    case "UL":
    case "OL":
      return "list";
    case "PRE":
      return block.hasClass("frontmatter") ? "yaml" : "code";
    case "HR":
      return "thematicBreak";
    case "DIV":
      if (block.hasClass("callout")) return "callout";
      if (block.hasClass("math")) return "math";
      return "html";
    default:
      return /^H[1-6]$/.test(block.tagName) ? "heading" : block.tagName.toLowerCase();
  }
}

// Obsidian makes a block whose only child is a table scroll horizontally, by
// setting overflow-x inline on the block itself. That would clip guide lines
// bleeding above the block and scroll them with a wide table, so the scrolling
// moves to a wrapper and the block stays a plain box like every other one.
function isolateTableScroll(el: HTMLElement) {
  const table = el.firstElementChild;
  if (!table?.instanceOf(HTMLTableElement) || table !== el.lastElementChild) return;
  const scroller = el.createDiv({ cls: "rgh-table-scroll" });
  scroller.appendChild(table);
  el.style.removeProperty("overflow-x");
}

const STATE_ATTRIBUTE = "data-rgh";

// Obsidian reuses block elements across renders, so turning the guides off has
// to undo what an earlier render left on them.
function clearBlock(el: HTMLElement) {
  el.querySelectorAll(":scope > .rgh-line").forEach((guide) => guide.detach());
  for (let level = 0; level <= MAX_HEADING_LEVEL; level++) el.removeClass(depthClass(level));
  el.removeClass("rgh-block", "rgh-heading");
  el.removeAttribute(STATE_ATTRIBUTE);
}

function decorateBlock(el: HTMLElement, section: MarkdownSectionInformation) {
  const { depths, headings, above } = hierarchyFor(section.text);
  const line = section.lineStart;
  if (line < 0 || line >= depths.length) return;

  // Tagged on every block, guide lines or not, so a snippet can address any of
  // them structurally.
  if (!el.className.includes("rgh-section-")) el.addClass(`rgh-section-${sectionType(el)}`);
  isolateTableScroll(el);

  const depth = Math.min(depths[line], MAX_HEADING_LEVEL);
  const isHeading = headings[line] === 1;
  const previousDepth = above[line];
  const state = `${depth}${isHeading ? "h" : ""}/${previousDepth}`;
  // Obsidian empties a block it re-renders but leaves its attributes, so the
  // recorded state only counts while the guide lines it describes are present.
  const drawn = depth < 1 || (el.lastElementChild?.hasClass("rgh-line") ?? false);
  if (drawn && el.getAttribute(STATE_ATTRIBUTE) === state) return;

  clearBlock(el);
  el.setAttribute(STATE_ATTRIBUTE, state);
  if (depth < 1 && !isHeading) return;

  el.addClass("rgh-block", depthClass(depth));
  el.toggleClass("rgh-heading", isHeading);
  for (let level = 1; level <= depth; level++) {
    const guide = el.createDiv({ cls: ["rgh-line", `rgh-line-l${level}`] });
    const hasNoSegmentAbove = level > previousDepth;
    if (hasNoSegmentAbove) guide.addClass("rgh-line-start");
  }
}

type SectionLookup = (el: HTMLElement) => MarkdownSectionInformation | null;

export function createReadingViewProcessor(
  plugin: BetterHeadingHierarchyPlugin,
): MarkdownPostProcessor {
  // Obsidian re-renders a block only when its own markup changes, and reuses the
  // rest as they are. A block's depth depends on the headings above it, so an
  // edit to a heading — or deleting one — leaves every reused block below it
  // stale. Every such edit does add or remove a block element though, so
  // watching the section container catches them all.
  const lookups = new WeakMap<HTMLElement, SectionLookup>();
  const pending = new Set<HTMLElement>();

  function refresh(container: HTMLElement) {
    const getSectionInfo = lookups.get(container);
    if (!getSectionInfo || !plugin.settings.showInReadingView) return;
    for (const child of Array.from(container.children)) {
      if (!child.instanceOf(HTMLElement) || !child.children.length || child.hasClass("mod-ui")) {
        continue;
      }
      const section = getSectionInfo(child);
      if (section) decorateBlock(child, section);
    }
  }

  const observer = new MutationObserver((mutations) => {
    const idle = pending.size === 0;
    for (const { target } of mutations) {
      if (target.instanceOf(HTMLElement)) pending.add(target);
    }
    if (idle && pending.size) {
      mutations[0].target.win.requestAnimationFrame(() => {
        for (const container of pending) refresh(container);
        pending.clear();
      });
    }
  });
  plugin.register(() => observer.disconnect());

  return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    if (!el.children.length) return;
    if (!plugin.settings.showInReadingView) {
      clearBlock(el);
      return;
    }

    const section = ctx.getSectionInfo(el);
    if (!section) return;

    decorateBlock(el, section);

    // Undocumented but what every reading view passes; a block being processed
    // is often not attached yet, so its parent is only a fallback.
    const container = (ctx as { containerEl?: HTMLElement }).containerEl ?? el.parentElement;
    if (container && !lookups.has(container)) {
      lookups.set(container, (target) => ctx.getSectionInfo(target));
      observer.observe(container, { childList: true });
    }
  };
}
