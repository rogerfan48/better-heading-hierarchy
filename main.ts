import { Extension } from "@codemirror/state";
import {
  App,
  MarkdownView,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  SettingDefinitionItem,
} from "obsidian";

import { hierarchyGuideExtension } from "./src/live-preview";
import { createReadingViewProcessor } from "./src/reading-view";
import { BetterHeadingHierarchySettings, DEFAULT_SETTINGS } from "./src/settings";
import { SNIPPET_NAME, describeSnippet, getSnippetStatus, installSnippet } from "./src/snippet";

export default class BetterHeadingHierarchyPlugin extends Plugin {
  settings: BetterHeadingHierarchySettings;

  // Mutated in place; updateOptions() re-reads it, which is how the editing
  // view toggle applies without a restart.
  private readonly editorExtensions: Extension[] = [];

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new BetterHeadingHierarchySettingTab(this.app, this));

    this.registerMarkdownPostProcessor(createReadingViewProcessor(this));

    this.registerEditorExtension(this.editorExtensions);
    this.applyEditorExtensions();

    if (this.settings.autoInstallSnippet) {
      this.app.workspace.onLayoutReady(() => {
        installSnippet(this.app, { overwrite: false }).catch(() => {
          new Notice("Could not install the companion snippet.");
        });
      });
    }
  }

  async loadSettings() {
    const stored = (await this.loadData()) as Partial<BetterHeadingHierarchySettings> | null;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  applyEditorExtensions() {
    this.editorExtensions.length = 0;
    if (this.settings.showInEditingView) {
      this.editorExtensions.push(hierarchyGuideExtension);
    }
    this.app.workspace.updateOptions();
  }

  rerenderOpenPreviews() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.getMode() === "preview") {
        view.previewMode.rerender(true);
      }
    }
  }
}

type SettingKey = keyof BetterHeadingHierarchySettings;

interface ToggleRow {
  name: string;
  desc: string;
  control: { type: "toggle"; key: SettingKey };
}

interface CustomRow {
  name: string;
  desc?: string;
  render: (setting: Setting) => void | (() => void);
}

interface Section {
  heading: string;
  items: (ToggleRow | CustomRow)[];
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
    this.plugin.settings[setting] = value as boolean;
    await this.plugin.saveSettings();

    switch (setting) {
      case "showInReadingView":
        this.plugin.rerenderOpenPreviews();
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
