# Changelog

This project follows [Semantic Versioning](https://semver.org/).

## 2.1.0

### Fixed

- Tables, callouts, math blocks and embeds in the editor had no guide lines and no indent (#4).
  Live Preview renders them as widgets that line decorations cannot reach; the editor's guide lines
  are now drawn on a CodeMirror layer and run through them.
- Tables in Reading view clipped the guide lines and grew a stray scrollbar, because Obsidian sets
  `overflow-x` inline on a table's block. The scrolling now lives on an inner wrapper, and the
  companion snippet's `!important` workaround is gone.
- A snippet's `body { --rgh-color-4: … }` did not apply in a light theme (#3). Both color ramps are
  now declared at zero specificity.
- Reading view went stale after editing a heading: Obsidian reuses blocks whose markup did not
  change, and the metadata cache lags behind the text. Depths now come from the rendered text, and
  reused blocks are refreshed.
- Turning *Reading view* off left the indent on reused blocks.

### Changed

- One scanner decides what is a heading in both views, following Obsidian's parser: `#` inside
  math, `%%` comments, HTML blocks, list items and quotes is not one, and setext underlines are.
- `rgh-section-*` classes come from the rendered block instead of the metadata cache.
- `--rgh-editor-bleed` is gone; the editor's guide lines are continuous runs.

## 2.0.1

### Changed

- Reading view tags every block with its section type (`rgh-section-table`, …) and tags top-level
  headings, so a snippet can target blocks without `:has()`.
- The companion snippet drops 36 of its 37 `!important` declarations and all 8 `:has()` selectors,
  outranking Obsidian by specificity instead. The one that remains overrides an overflow Obsidian
  sets on table blocks.
- Editor code blocks get their own font size; reading-view code blocks get tighter line spacing.
- `minAppVersion` is now 1.2.3, which `ButtonComponent.setDisabled` requires.
- Lint with `eslint-plugin-obsidianmd`.

### Fixed

- Selecting bold text showed no highlight: 2.0.0 merged the `::selection` rule into the base rule,
  giving it a `background-color: unset` it never had.
- Links inside a heading no longer take the ordinary link color.
- Two settings strings were not in sentence case.

## 2.0.0

### Added

- Guide lines in **Live Preview and Source mode**, drawn by a CodeMirror 6 view plugin. Headings
  inside fenced code blocks and YAML frontmatter are ignored.
- Separate toggles for Reading view and the editor.
- Colors, spacing and line thickness are now `--rgh-*` CSS variables, with a lighter ramp for light
  themes.
- A settings button that installs and enables the companion snippet, and an optional
  *install on startup* toggle. A snippet you have edited is never overwritten without an explicit
  click.

### Changed

- **The Reading view renderer is stateless.** Guide lines are derived per block from the metadata
  cache instead of from heading state carried between renders, which fixes wrong lines with two
  panes open and under lazy scroll-rendering. It also drops a full file read that ran once per
  rendered block.
- Guide lines bridge the gap between blocks generically, instead of with pixel offsets that assumed
  one theme's margins.
- `versions.json` now lists every released version; 1.0.1 through 1.0.5 were missing.
- Modernized the toolchain, clearing eight vulnerable transitive dependencies.

### Removed

- **The *additional author-styled CSS* setting.** It was personal styling rather than plugin
  behavior, and the source of 61 `!important` declarations and 7 `:has()` selectors in the shipped
  stylesheet. It now ships as `snippets/rogers-theme.css` — install it from the settings tab to get
  the same appearance back.
- `fundingUrl`, as the link no longer resolves.

## 1.0.5 and earlier

Guide lines in Reading view, with an optional bundled author stylesheet.
See the [release history](https://github.com/rogerfan48/better-heading-hierarchy/releases).
