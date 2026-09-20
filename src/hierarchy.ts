export const MAX_HEADING_LEVEL = 6;

export const depthClass = (depth: number) => `rgh-depth-${depth}`;

const ancestorCount = (headingLevel: number) => headingLevel - 1;

export interface LineHierarchy {
  /** Guide lines each row draws. A heading draws one per ancestor, its content one more. */
  depths: Uint8Array;
  headings: Uint8Array;
  /** What the nearest non-blank line above draws, i.e. the block above. */
  above: Uint8Array;
}

// Block structure as Obsidian's reading view and metadata cache parse it, which
// is remark in CommonMark mode with Obsidian's math and comment blocks added.
// Only what decides whether a line is a top-level heading is modeled: the
// constructs that swallow lines (fences, math, comments, HTML blocks, list
// items and their continuations, tables) and the ones that end a paragraph.

const HEADING_PATTERN = /^ {0,3}(#{1,6})(?:[ \t]|$)/;
const SETEXT_PATTERN = /^ {0,3}(=+|-+)$/;
const THEMATIC_BREAK_PATTERN = /^ {0,3}(?:[-*_][ \t]*){3,}$/;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;
const MATH_FENCE_PATTERN = /^ *(\${2,}) *[^$]*$/;
const COMMENT_FENCE_PATTERN = /^ *%%[^%]*$/;
const QUOTE_PATTERN = /^ {0,3}>/;
const LIST_ITEM_PATTERN = /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/;
const TABLE_DELIMITER_PATTERN = /^ {0,3}(?=[\s|:-]*\|)[\s|:-]*-[\s|:-]*$/;

const HTML_BLOCK_TAGS =
  "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|" +
  "details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|" +
  "h1|h2|h3|h4|h5|h6|head|header|hgroup|hr|html|iframe|legend|li|link|main|menu|menuitem|" +
  "meta|nav|noframes|ol|optgroup|option|p|param|pre|section|source|title|summary|table|" +
  "tbody|td|tfoot|th|thead|tr|track|ul";
const UNTIL_BLANK_LINE = null;
const HTML_BLOCK_OPENERS: [RegExp, RegExp | null][] = [
  [/^ {0,3}<(?:script|pre|style|textarea)(?:\s|>|$)/i, /<\/(?:script|pre|style|textarea)>/i],
  [/^ {0,3}<!--/, /-->/],
  [/^ {0,3}<\?/, /\?>/],
  [/^ {0,3}<![A-Za-z]/, />/],
  [/^ {0,3}<!\[CDATA\[/, /\]\]>/],
  [new RegExp(`^ {0,3}</?(?:${HTML_BLOCK_TAGS})(?:\\s|/?>|$)`, "i"), UNTIL_BLANK_LINE],
];
const ATTRIBUTE = String.raw`\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:[^\s"'=<>\`]+|'[^']*'|"[^"]*"))?`;
const HTML_TAG_LINE_PATTERN = new RegExp(
  String.raw`^ {0,3}(?:<[A-Za-z][\w-]*(?:${ATTRIBUTE})*\s*/?>|</[A-Za-z][\w-]*\s*>)\s*$`,
);

const NO_PARAGRAPH = -1;
const NO_LIST = -1;

// The closing run has to be the line's first dollar sign, and at least as long.
function mathCloserFor(openingRun: string): RegExp {
  return new RegExp("^[^$]*\\${" + openingRun.length + ",}$");
}

function indentation(text: string): number {
  let columns = 0;
  for (const char of text) {
    if (char === " ") columns++;
    else if (char === "\t") columns += 4 - (columns % 4);
    else break;
  }
  return columns;
}

function listContentIndent(match: RegExpExecArray): number {
  const [, leading, marker, spacing] = match;
  const spaces = spacing.length === 0 ? 1 : Math.min(indentation(spacing), 4);
  return leading.length + marker.length + spaces;
}

// A lone tag line (`<b>`) is an HTML block too, but one that cannot interrupt.
function opensHtmlBlock(text: string): boolean {
  return HTML_BLOCK_OPENERS.some(([opener]) => opener.test(text));
}

// A line that is not blank and does not start one of these continues the item
// above it, whatever it looks like. Math and HTML do not make the cut.
function interruptsListItem(text: string): boolean {
  return (
    HEADING_PATTERN.test(text) ||
    FENCE_PATTERN.test(text) ||
    COMMENT_FENCE_PATTERN.test(text) ||
    THEMATIC_BREAK_PATTERN.test(text) ||
    LIST_ITEM_PATTERN.test(text)
  );
}

function interruptsQuote(text: string): boolean {
  return (
    indentation(text) >= 4 ||
    interruptsListItem(text) ||
    MATH_FENCE_PATTERN.test(text) ||
    opensHtmlBlock(text)
  );
}

function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0]?.trimEnd() !== "---") return -1;
  for (let line = 1; line < lines.length; line++) {
    if (lines[line].trimEnd() === "---") return line;
  }
  return -1;
}

export function computeLineHierarchy(lines: readonly string[]): LineHierarchy {
  const count = lines.length;
  const depths = new Uint8Array(count);
  const headings = new Uint8Array(count);
  const above = new Uint8Array(count);

  let enclosingLevel = 0;
  let aboveDepth = 0;
  let openFence: string | null = null;
  let mathCloser: RegExp | null = null;
  let inComment = false;
  let inHtml = false;
  let htmlCloser: RegExp | null = null;
  let inTable = false;
  let listIndent = NO_LIST;
  let listContinues = false;
  let quoteContinues = false;
  let lazyQuoteLine = -1;
  let paragraphStart = NO_PARAGRAPH;
  // Whether the line above began a block that an underline turns into a heading.
  // remark tries that before HTML blocks, tables and paragraphs, so the line above
  // may already have opened one of those; the underline cancels it.
  let underlinable = false;
  let previousText = "";

  const setHeading = (line: number, level: number) => {
    enclosingLevel = level;
    depths[line] = ancestorCount(level);
    headings[line] = 1;
    aboveDepth = depths[line];
    inTable = false;
    paragraphStart = NO_PARAGRAPH;
  };

  const scan = (line: number, unpadded: string, startsBlockAbove: boolean) => {
    const text = unpadded.trimEnd();
    const before = previousText;
    previousText = text;

    // Obsidian only underlines a single line: a longer paragraph swallows `===`
    // and is cut short by `---` as a thematic break.
    const underlinableAbove = line > 0 && (startsBlockAbove || lazyQuoteLine === line - 1);
    const underline = underlinableAbove ? SETEXT_PATTERN.exec(unpadded) : null;
    if (underline) {
      setHeading(line - 1, underline[1][0] === "=" ? 1 : 2);
      setHeading(line, enclosingLevel);
      inHtml = false;
      quoteContinues = false;
      return;
    }

    if (openFence !== null) {
      const fence = FENCE_PATTERN.exec(text);
      if (fence && fence[1][0] === openFence[0] && fence[1].length >= openFence.length) {
        openFence = null;
      }
      aboveDepth = enclosingLevel;
      return;
    }
    if (mathCloser !== null) {
      if (mathCloser.test(text)) mathCloser = null;
      aboveDepth = enclosingLevel;
      return;
    }
    if (inComment) {
      const closer = text.indexOf("%%");
      if (closer < 0) {
        aboveDepth = enclosingLevel;
        return;
      }
      inComment = false;
      const rest = unpadded.slice(closer + 2);
      if (rest.trim() === "") {
        aboveDepth = enclosingLevel;
        return;
      }
      scan(line, rest, false);
      return;
    }
    if (inHtml && htmlCloser !== UNTIL_BLANK_LINE) {
      if (htmlCloser.test(text)) inHtml = false;
      aboveDepth = enclosingLevel;
      return;
    }

    if (text === "") {
      // Only a truly empty line ends an HTML block; whitespace keeps it open.
      if (inHtml && unpadded !== "") {
        aboveDepth = enclosingLevel;
        return;
      }
      inHtml = false;
      inTable = false;
      listContinues = false;
      quoteContinues = false;
      paragraphStart = NO_PARAGRAPH;
      return;
    }
    if (inHtml) {
      aboveDepth = enclosingLevel;
      return;
    }

    if (listIndent !== NO_LIST) {
      const nested = indentation(text) >= listIndent;
      if (nested || (listContinues && !interruptsListItem(text))) {
        listContinues = true;
        aboveDepth = enclosingLevel;
        return;
      }
      listIndent = NO_LIST;
      listContinues = false;
    }
    if (quoteContinues) {
      if (QUOTE_PATTERN.test(text) || !interruptsQuote(text)) {
        if (!QUOTE_PATTERN.test(text)) lazyQuoteLine = line;
        aboveDepth = enclosingLevel;
        return;
      }
      quoteContinues = false;
    }

    const fence = FENCE_PATTERN.exec(text);
    const math = fence ? null : MATH_FENCE_PATTERN.exec(text);
    if (fence) openFence = fence[1];
    else if (math) mathCloser = mathCloserFor(math[1]);
    else if (COMMENT_FENCE_PATTERN.test(text)) inComment = true;
    if (openFence !== null || mathCloser !== null || inComment) {
      aboveDepth = enclosingLevel;
      inTable = false;
      paragraphStart = NO_PARAGRAPH;
      return;
    }

    const heading = HEADING_PATTERN.exec(text);
    if (heading) {
      setHeading(line, heading[1].length);
      return;
    }

    aboveDepth = enclosingLevel;

    const headerAbove = startsBlockAbove && paragraphStart === line - 1;
    if (headerAbove && before.includes("|") && TABLE_DELIMITER_PATTERN.test(text)) {
      inTable = true;
      paragraphStart = NO_PARAGRAPH;
      return;
    }
    if (inTable) {
      if (text.includes("|")) return;
      inTable = false;
    }

    if (THEMATIC_BREAK_PATTERN.test(text)) {
      paragraphStart = NO_PARAGRAPH;
      return;
    }

    const opener = HTML_BLOCK_OPENERS.find(([pattern]) => pattern.test(text));
    if (opener || (paragraphStart === NO_PARAGRAPH && HTML_TAG_LINE_PATTERN.test(text))) {
      htmlCloser = opener ? opener[1] : UNTIL_BLANK_LINE;
      inHtml = htmlCloser === UNTIL_BLANK_LINE || !htmlCloser.test(text);
      underlinable = true;
      paragraphStart = NO_PARAGRAPH;
      return;
    }

    const item = LIST_ITEM_PATTERN.exec(text);
    if (item) {
      listIndent = listContentIndent(item);
      listContinues = true;
      paragraphStart = NO_PARAGRAPH;
      return;
    }
    if (QUOTE_PATTERN.test(text)) {
      quoteContinues = true;
      paragraphStart = NO_PARAGRAPH;
      return;
    }

    if (paragraphStart === NO_PARAGRAPH && indentation(text) < 4) {
      paragraphStart = line;
      underlinable = true;
    }
  };

  const skipUntil = frontmatterEnd(lines);
  for (let line = 0; line < count; line++) {
    depths[line] = enclosingLevel;
    above[line] = aboveDepth;
    if (line <= skipUntil) continue;

    const raw = lines[line];
    const startsBlockAbove = underlinable;
    underlinable = false;
    scan(line, raw.endsWith("\r") ? raw.slice(0, -1) : raw, startsBlockAbove);
  }

  return { depths, headings, above };
}
