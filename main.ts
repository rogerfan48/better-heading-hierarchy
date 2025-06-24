import { App, MarkdownPostProcessor, MarkdownPostProcessorContext, MarkdownRenderChild, MarkdownView, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";

const AUTHOR_STYLE_CLASS = 'better-headings-author-style';

interface BetterHeadingHierarchySettings {
    enableAdditionalCss: boolean;
}

const DEFAULT_SETTINGS: BetterHeadingHierarchySettings = {
    enableAdditionalCss: true,
};

export default class BetterHeadingHierarchyPlugin extends Plugin {
    settings: BetterHeadingHierarchySettings;
    prevHeading: string | null;
    isPrevHeading: boolean;

    async onload() {
        await this.loadSettings();
        
        this.updateBodyClass();

        this.addSettingTab(new BetterHeadingHierarchySettingTab(this.app, this));

        this.prevHeading = null;
        this.isPrevHeading = false;

        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.getMode() === "preview") {
                    this.resetState();
                    activeView.previewMode.rerender(true);
                }
            }),
        );

        this.registerMarkdownPostProcessor(this.styleChanger);
    }

    onunload() {
        this.resetState();
        document.body.classList.remove(AUTHOR_STYLE_CLASS);
    }
    
    resetState() {
        this.prevHeading = null;
        this.isPrevHeading = false;
    }

    styleChanger: MarkdownPostProcessor = async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        if (!el.children.length) return;

        const firstChild = el.children[0] as HTMLElement;
        const tagName = firstChild.tagName;

        if (tagName.startsWith("H") && tagName.length === 2) {
            const level = parseInt(tagName[1]);
            if (level >= 1 && level <= 6) {
                let top5 = false;
                if (this.isPrevHeading && this.prevHeading && level > parseInt(this.prevHeading[5])) {
                    top5 = true;
                }

                this.prevHeading = `rgh-h${level}`;
                el.classList.add("rgh-div-head", `${this.prevHeading}-head`);
                
                for(let i = 1; i < level; i++) {
                    this.createIndentDiv(el, ctx, `h${i}`, false, top5);
                }
                
                this.isPrevHeading = true;
            }
        } else {
             if (this.prevHeading === null) {
                return;
            }

            el.classList.add("rgh-div", this.prevHeading);

            const prevLevel = parseInt(this.prevHeading[5]);
            if (prevLevel < 1 || prevLevel > 6) {
                console.warn("ERROR: Invalid previous heading level at", el, "\nthis.prevHeading:", this.prevHeading);
                return;
            }

            switch (prevLevel.toString()) {
                case "6": this.createIndentDiv(el, ctx, "h6", this.isPrevHeading); // falls through
                case "5": this.createIndentDiv(el, ctx, "h5", this.isPrevHeading); // falls through
                case "4": this.createIndentDiv(el, ctx, "h4", this.isPrevHeading); // falls through
                case "3": this.createIndentDiv(el, ctx, "h3", this.isPrevHeading); // falls through
                case "2": this.createIndentDiv(el, ctx, "h2", this.isPrevHeading); // falls through
                case "1": this.createIndentDiv(el, ctx, "h1", this.isPrevHeading);
            }
            this.isPrevHeading = false;
        }

        const sectionInfo = ctx.getSectionInfo(el);
        if (sectionInfo) {
            const file = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
            if (file instanceof TFile) {
                const fileContents = await this.app.vault.cachedRead(file);
                const totalLines = fileContents.split("\n").length;
                if (sectionInfo.lineEnd >= totalLines - 1) {
                    this.resetState();
                }
            }
        }
    };
    
    createIndentDiv(parentEl: HTMLElement, ctx: MarkdownPostProcessorContext, type: string, isTopElement: boolean, top5 = false) {
        const newDiv = parentEl.createDiv({
            cls: ["rgh-line", `rgh-line-${type}`]
        });

        if (this.prevHeading != null && type !== `h${parseInt(this.prevHeading[5])}`) {
            const prevLevel = parseInt(this.prevHeading[5]);
            const currentLevel = parseInt(type[1]);
            if(prevLevel > currentLevel) {
                 newDiv.addClass(`rgh-left${(prevLevel - currentLevel)}0`);
            }
        }

        if (isTopElement) newDiv.addClass("rgh-top2");
        if (top5) newDiv.addClass("rgh-top5");
        
        const firstChild = parentEl.children[0];
        if (firstChild) {
            if (firstChild.tagName === "BLOCKQUOTE" || firstChild.tagName === "PRE") {
                newDiv.addClass("rgh-top16");
            }
            if (firstChild.tagName === "HR") {
                newDiv.addClass("rgh-top32");
            }
        }
        
        ctx.addChild(new MarkdownRenderChild(newDiv));
    }

    private updateBodyClass() {
        if (this.settings.enableAdditionalCss) {
            document.body.classList.add(AUTHOR_STYLE_CLASS);
        } else {
            document.body.classList.remove(AUTHOR_STYLE_CLASS);
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateBodyClass();
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

        new Setting(containerEl)
            .setName("Enable additional author-styled CSS")
            .setDesc(
                "It is recommended to use the default theme and enable this setting to get the best experience—just like I do.",
            )
            .addToggle((toggle) =>
                toggle.setValue(this.plugin.settings.enableAdditionalCss).onChange(async (value) => {
                    this.plugin.settings.enableAdditionalCss = value;
                    await this.plugin.saveSettings();
                }),
            );
    }
}
