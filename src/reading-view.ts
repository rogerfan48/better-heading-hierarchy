import {
  CachedMetadata,
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  TFile,
} from "obsidian";

import BetterHeadingHierarchyPlugin from "../main";
import { computeSectionDepths, depthClass, findSectionIndex } from "./hierarchy";

function removeExistingGuideLines(el: HTMLElement) {
  el.querySelectorAll(":scope > .rgh-line").forEach((line) => line.detach());
}

export function createReadingViewProcessor(
  plugin: BetterHeadingHierarchyPlugin,
): MarkdownPostProcessor {
  // Obsidian replaces the metadata object on every change, so keying on it
  // invalidates stale entries for free.
  const depthsByMetadata = new WeakMap<CachedMetadata, Int8Array>();

  return (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
    if (!plugin.settings.showInReadingView || !el.children.length) return;

    const sourceRange = ctx.getSectionInfo(el);
    if (!sourceRange) return;

    const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(file instanceof TFile)) return;

    const cache = plugin.app.metadataCache.getFileCache(file);
    if (!cache?.sections) return;

    let depths = depthsByMetadata.get(cache);
    if (!depths) {
      depths = computeSectionDepths(cache);
      depthsByMetadata.set(cache, depths);
    }

    const index = findSectionIndex(cache.sections, sourceRange.lineStart);
    if (index < 0) return;

    const sectionType = cache.sections[index].type;
    const isHeading = sectionType === "heading";

    // Tagged on every block, guide lines or not, so a snippet can address any of
    // them structurally.
    el.addClass(`rgh-section-${sectionType}`);
    removeExistingGuideLines(el);

    const depth = depths[index];
    if (depth < 1 && !isHeading) return;

    const previousDepth = index > 0 ? depths[index - 1] : 0;
    el.addClass("rgh-block", depthClass(depth));
    el.toggleClass("rgh-heading", isHeading);

    for (let level = 1; level <= depth; level++) {
      const line = el.createDiv({ cls: ["rgh-line", `rgh-line-l${level}`] });
      const hasNoSegmentAbove = level > previousDepth;
      if (hasNoSegmentAbove) line.addClass("rgh-line-start");
      ctx.addChild(new MarkdownRenderChild(line));
    }
  };
}
