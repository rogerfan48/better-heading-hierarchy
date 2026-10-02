import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
  TFile,
  normalizePath,
} from "obsidian";

import { hierarchyGuideExtension, recheckGuides } from "./src/live-preview";
import { createReadingViewProcessor } from "./src/reading-view";
import { BetterHeadingHierarchySettings, DEFAULT_SETTINGS, NOTE_PROPERTY } from "./src/settings";
import { SNIPPET_NAME, describeSnippet, getSnippetStatus, installSnippet } from "./src/snippet";

export default class BetterHeadingHierarchyPlugin extends Plugin {
  settings: BetterHeadingHierarchySettings;

  // Mutated in place; updateOptions() re-reads it, which is how the editing
  // view toggle applies without a restart.
  private readonly editorExtensions: Extension[] = [];

  private readonly noteOverrides = new Map<string, unknown>();

  async onload() {
    const isFirstRun = !(await this.loadSettings());

    this.addSettingTab(new BetterHeadingHierarchySettingTab(this.app, this));

    this.registerMarkdownPostProcessor(createReadingViewProcessor(this));

    this.registerEditorExtension(this.editorExtensions);
    this.applyEditorExtensions();

    this.registerEvent(
      this.app.metadataCache.on("changed", (file, _data, cache) => {
        const override: unknown = cache.frontmatter?.[NOTE_PROPERTY];
        if (override === this.noteOverrides.get(file.path)) return;
        this.noteOverrides.set(file.path, override);
        this.refreshOpenNotes(file);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file) => {
        if (file instanceof TFile) this.refreshOpenNotes(file);
      }),
    );

    if (this.settings.autoInstallSnippet || isFirstRun) {
      this.app.workspace.onLayoutReady(() => {
        installSnippet(this.app, { overwrite: false }).catch(() => {
          new Notice("Could not install the companion snippet.");
        });
      });
    }
    if (isFirstRun) await this.saveSettings();
  }

  async loadSettings(): Promise<boolean> {
    const stored = (await this.loadData()) as Partial<BetterHeadingHierarchySettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    return stored !== null;
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  showsGuidesIn(path: string): boolean {
    const override: unknown = this.app.metadataCache.getCache(path)?.frontmatter?.[NOTE_PROPERTY];
    if (typeof override === "boolean") return override;
    return !this.settings.excludedFolders.split("\n").some((line) => {
      const folder = line.trim();
      return folder !== "" && path.startsWith(`${normalizePath(folder)}/`);
    });
  }

  applyEditorExtensions() {
    this.editorExtensions.length = 0;
    if (this.settings.showInEditingView) {
      this.editorExtensions.push(hierarchyGuideExtension((path) => this.showsGuidesIn(path)));
    }
    this.app.workspace.updateOptions();
  }

  refreshOpenNotes(file?: TFile) {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || (file && view.file !== file)) continue;
      if (view.getMode() === "preview") view.previewMode.rerender(true);
      (view.editor as { cm?: EditorView }).cm?.dispatch({ effects: recheckGuides.of(null) });
    }
  }
}

type SettingKey = keyof BetterHeadingHierarchySettings;

interface ControlRow {
  name: string;
  desc: string;
  control: { type: "toggle" | "textarea"; key: SettingKey; placeholder?: string };
}

interface CustomRow {
  name: string;
  desc?: string;
  render: (setting: Setting) => void | (() => void);
}

interface Section {
  heading: string;
  items: (ControlRow | CustomRow)[];
}

const SNIPPET_PURPOSE =
  "The spacing and heading style the guide lines were designed around. Fonts are not included.";

class BetterHeadingHierarchySettingTab extends PluginSettingTab {
  plugin: BetterHeadingHierarchyPlugin;
  private snippetRow: Setting | null = null;

  constructor(app: App, plugin: BetterHeadingHierarchyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private sections(): Section[] {
    return [
      {
        heading: "Guide lines",
        items: [
          {
            name: "Reading view",
            desc: "Show guide lines in rendered notes.",
            control: { type: "toggle", key: "showInReadingView" },
          },
          {
            name: "Editing view",
            desc: "Show guide lines in live preview and source mode.",
            control: { type: "toggle", key: "showInEditingView" },
          },
          {
            name: "Excluded folders",
            desc: `One folder per line, subfolders included. A note's ${NOTE_PROPERTY} property overrides this.`,
            control: { type: "textarea", key: "excludedFolders", placeholder: "Templates\nJournal" },
          },
        ],
      },
      {
        heading: "Recommended styling",
        items: [
          {
            name: "Companion snippet",
            desc: SNIPPET_PURPOSE,
            render: (setting) => {
              this.snippetRow = setting;
              void this.refreshSnippetRow();
              return () => {
                this.snippetRow = null;
              };
            },
          },
          {
            name: "Install on startup",
            desc: "Put the file back if it goes missing. Never overwrites your edits.",
            control: { type: "toggle", key: "autoInstallSnippet" },
          },
          {
            name: "Fonts and customization",
            desc: "Which fonts the snippet expects, and every CSS variable you can override.",
            render: (setting) => {
              setting.addButton((button) =>
                button.setButtonText("Open documentation").onClick(() => {
                  window.open("https://github.com/rogerfan48/better-heading-hierarchy#readme");
                }),
              );
            },
          },
        ],
      },
    ];
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return this.sections().map(({ heading, items }) => ({ type: "group", heading, items }));
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as SettingKey];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const setting = key as SettingKey;
    this.plugin.settings[setting] = value as never;
    await this.plugin.saveSettings();

    switch (setting) {
      case "showInReadingView":
      case "excludedFolders":
        this.plugin.refreshOpenNotes();
        break;
      case "showInEditingView":
        this.plugin.applyEditorExtensions();
        break;
      case "autoInstallSnippet":
        if (value) await installSnippet(this.app, { overwrite: false });
        await this.refreshSnippetRow();
        break;
    }
  }

  // Obsidian before 1.13 has no declarative settings; this draws the same rows.
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    for (const section of this.sections()) {
      new Setting(containerEl).setName(section.heading).setHeading();
      for (const row of section.items) {
        const setting = new Setting(containerEl).setName(row.name);
        if (row.desc) setting.setDesc(row.desc);
        if ("render" in row) {
          row.render(setting);
        } else if (row.control.type === "textarea") {
          const { key, placeholder = "" } = row.control;
          setting.addTextArea((text) =>
            text
              .setPlaceholder(placeholder)
              .setValue(this.getControlValue(key) as string)
              .onChange((value) => this.setControlValue(key, value)),
          );
        } else {
          const { key } = row.control;
          setting.addToggle((toggle) =>
            toggle
              .setValue(this.getControlValue(key) as boolean)
              .onChange((value) => this.setControlValue(key, value)),
          );
        }
      }
    }
  }

  private async refreshSnippetRow() {
    const row = this.snippetRow;
    if (!row) return;
    const snippet = describeSnippet(await getSnippetStatus(this.app));
    if (row !== this.snippetRow) return;

    row.clear();
    row.setDesc(
      createFragment((fragment) => {
        fragment.appendText(SNIPPET_PURPOSE);
        fragment.createEl("br");
        fragment.appendText(`${snippet.state} — ${snippet.action}`);
      }),
    );
    row.addButton((button) =>
      button
        .setButtonText(snippet.button)
        .setCta()
        .onClick(async () => {
          button.setDisabled(true);
          try {
            const next = await installSnippet(this.app, { overwrite: snippet.overwrite });
            new Notice(
              next.enabled
                ? "Snippet installed and turned on."
                : `Written to snippets/${SNIPPET_NAME}.css — turn it on under Appearance.`,
            );
          } catch {
            new Notice("Could not write the snippet.");
          }
          await this.refreshSnippetRow();
        }),
    );
  }
}
