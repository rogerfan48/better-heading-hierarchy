import { App, normalizePath } from "obsidian";

import SNIPPET_CSS from "../snippets/rogers-theme.css";

export const SNIPPET_NAME = "rogers-theme";

export interface SnippetStatus {
  exists: boolean;
  matchesBundled: boolean;
  enabled: boolean;
  canToggle: boolean;
}

interface CustomCss {
  enabledSnippets?: Set<string>;
  readSnippets?: () => void;
  setCssEnabledStatus?: (name: string, enabled: boolean) => void;
}

// Enabling a snippet has no public API, so every call site treats this as
// optional and degrades to "written, enable it yourself".
function customCss(app: App): CustomCss | null {
  const api = (app as App & { customCss?: CustomCss }).customCss;
  return api && typeof api.setCssEnabledStatus === "function" ? api : null;
}

function sameContent(a: string, b: string): boolean {
  return a.replace(/\r\n/g, "\n") === b.replace(/\r\n/g, "\n");
}

function snippetsDir(app: App): string {
  return normalizePath(`${app.vault.configDir}/snippets`);
}

function snippetPath(app: App): string {
  return normalizePath(`${snippetsDir(app)}/${SNIPPET_NAME}.css`);
}

export async function getSnippetStatus(app: App): Promise<SnippetStatus> {
  const adapter = app.vault.adapter;
  const path = snippetPath(app);
  const exists = await adapter.exists(path);

  return {
    exists,
    matchesBundled: exists ? sameContent(await adapter.read(path), SNIPPET_CSS) : false,
    enabled: customCss(app)?.enabledSnippets?.has(SNIPPET_NAME) ?? false,
    canToggle: customCss(app) !== null,
  };
}

export interface SnippetPresentation {
  state: string;
  action: string;
  button: string;
  overwrite: boolean;
}

export function describeSnippet(status: SnippetStatus): SnippetPresentation {
  if (!status.exists) {
    return {
      state: "Status: not installed",
      action: `Writes ${SNIPPET_NAME}.css into your snippets folder and turns it on.`,
      button: "Install and enable",
      overwrite: false,
    };
  }

  if (!status.matchesBundled) {
    return {
      state: "Status: installed, edited by you",
      action: "Restoring overwrites the file — your edits are lost.",
      button: "Restore bundled version",
      overwrite: true,
    };
  }

  if (!status.canToggle) {
    return {
      state: "Status: installed",
      action: "Turn it on yourself under Appearance → CSS snippets.",
      button: "Rewrite file",
      overwrite: true,
    };
  }

  if (!status.enabled) {
    return {
      state: "Status: installed, turned off",
      action: "Turns it back on. The file is left as it is.",
      button: "Turn on",
      overwrite: false,
    };
  }

  return {
    state: "Status: installed and active",
    action: "Rewrites the file with the bundled version, in case something looks wrong.",
    button: "Reinstall",
    overwrite: true,
  };
}

export async function installSnippet(
  app: App,
  { overwrite }: { overwrite: boolean },
): Promise<SnippetStatus> {
  const adapter = app.vault.adapter;

  if (!(await adapter.exists(snippetsDir(app)))) {
    await adapter.mkdir(snippetsDir(app));
  }

  const path = snippetPath(app);
  if (overwrite || !(await adapter.exists(path))) {
    await adapter.write(path, SNIPPET_CSS);
  }

  const api = customCss(app);
  api?.readSnippets?.();
  api?.setCssEnabledStatus?.(SNIPPET_NAME, true);

  return getSnippetStatus(app);
}
