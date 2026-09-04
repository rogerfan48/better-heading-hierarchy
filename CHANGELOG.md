# Changelog

This project follows [Semantic Versioning](https://semver.org/).

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
