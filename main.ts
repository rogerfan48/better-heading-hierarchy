import { Extension } from "@codemirror/state";
import { App, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";

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

class BetterHeadingHierarchySettingTab extends PluginSettingTab {
  plugin: BetterHeadingHierarchyPlugin;

  constructor(app: App, plugin: BetterHeadingHierarchyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName("Guide lines").setHeading();

    new Setting(containerEl)
      .setName("Reading view")
      .setDesc("Show guide lines in rendered notes.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInReadingView).onChange(async (value) => {
          this.plugin.settings.showInReadingView = value;
          await this.plugin.saveSettings();
          this.plugin.rerenderOpenPreviews();
        }),
      );

    new Setting(containerEl)
      .setName("Editing view")
      .setDesc("Show guide lines in live preview and source mode.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInEditingView).onChange(async (value) => {
          this.plugin.settings.showInEditingView = value;
          await this.plugin.saveSettings();
          this.plugin.applyEditorExtensions();
        }),
      );

    new Setting(containerEl)
      .setName("Recommended styling")
      .setDesc(
        "A CSS snippet with the spacing and heading style the guide lines were designed " +
          "around. Fonts are not included.",
      )
      .setHeading();

    void this.renderSnippet(containerEl.createDiv());
  }

  private async renderSnippet(containerEl: HTMLElement) {
    const status = await getSnippetStatus(this.app);
    const snippet = describeSnippet(status);
    containerEl.empty();

    new Setting(containerEl)
      .setName(snippet.state)
      .setDesc(snippet.action)
      .addButton((button) =>
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
            await this.renderSnippet(containerEl);
          }),
      );

    new Setting(containerEl)
      .setName("Install on startup")
      .setDesc("Put the file back if it goes missing. Never overwrites your edits.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoInstallSnippet).onChange(async (value) => {
          this.plugin.settings.autoInstallSnippet = value;
          await this.plugin.saveSettings();
          if (value) await installSnippet(this.app, { overwrite: false });
          await this.renderSnippet(containerEl);
        }),
      );

    new Setting(containerEl)
      .setName("Fonts and customization")
      .setDesc("Which fonts the snippet expects, and every CSS variable you can override.")
      .addButton((button) =>
        button.setButtonText("Open documentation").onClick(() => {
          window.open("https://github.com/rogerfan48/better-heading-hierarchy#readme");
        }),
      );
  }
}
