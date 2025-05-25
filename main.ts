import { MarkdownView, Plugin, MarkdownPostProcessor, MarkdownPostProcessorContext, MarkdownRenderChild, TFile } from "obsidian";
import { App, PluginSettingTab, Setting } from "obsidian";

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
    private rogerStyleEl: HTMLStyleElement | null = null;

    async onload() {
        await this.loadSettings();
        this.addSettingTab(new BetterHeadingHierarchySettingTab(this.app, this));
        this.updateCss();

        this.prevHeading = null;
        this.isPrevHeading = false;

        this.registerEvent(
            this.app.workspace.on("layout-change", () => {
                // console.log("Layout changed");
                const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (activeView && activeView.getMode() === "preview") {
                    // console.log("In reading mode, attempting to reprocess");
                    this.prevHeading = null;
                    this.isPrevHeading = false;
                    activeView.previewMode.rerender(true);
                }
            }),
        );

        this.registerMarkdownPostProcessor(this.styleChanger);

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {
        this.prevHeading = null;
        this.isPrevHeading = false;
        this.rogerStyleEl?.remove();
    }

    styleChanger: MarkdownPostProcessor = async (el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        // console.log(el, ctx, ctx.getSectionInfo(el));
        let top5 = false;
        const forceTop16 = false;
        const createIndentDiv = (type: string, top2 = false) => {
            const newDiv1 = el.createDiv();
            type.length < 4 ? newDiv1.addClass("rgh-line") : newDiv1.addClass("rgh-line-head"); // general class
            newDiv1.addClass("rgh-line-" + type); // specific c
            if (this.prevHeading != null)
                newDiv1.addClass("rgh-left" + (parseInt(this.prevHeading[5]) - parseInt(type[1])).toString() + "0"); // * 讓createIndentDiv為箭頭函式，使其可讀取this * //
            if (top2) newDiv1.addClass("rgh-top2");
            if (top5) newDiv1.addClass("rgh-top5");
            if (el.children[0].tagName == "BLOCKQUOTE" || el.children[0].tagName == "PRE" || forceTop16)
                newDiv1.addClass("rgh-top16");
            if (el.children[0].tagName == "HR") newDiv1.addClass("rgh-top32");
            ctx.addChild(new MarkdownRenderChild(newDiv1));
        };
        const SameLevelHeadingMargin = () => {
            // if (this.prevHeading != null) {
            //	if ((parseInt(this.prevHeading[5])-parseInt(el.children[0].tagName[1])) >= 0) {
            //		el.classList.add("rgh-m-top-16");
            //		forceTop16 = true;
            //	}
            // }
        };

        // if (el.children[0] == undefined) return;
        switch (el.children[0].tagName) {
            case "H1":
                SameLevelHeadingMargin();
                this.prevHeading = "rgh-h1";
                el.classList.add("rgh-div-head");
                el.classList.add(this.prevHeading + "-head");
                this.isPrevHeading = true;
                break;
            case "H2":
                SameLevelHeadingMargin();
                if (this.isPrevHeading && this.prevHeading == "rgh-h1") top5 = true;
                this.prevHeading = "rgh-h2";
                el.classList.add("rgh-div-head");
                el.classList.add(this.prevHeading + "-head");
                createIndentDiv("h1");
                this.isPrevHeading = true;
                break;
            case "H3":
                SameLevelHeadingMargin();
                if (this.isPrevHeading && (this.prevHeading == "rgh-h1" || this.prevHeading == "rgh-h2")) top5 = true;
                this.prevHeading = "rgh-h3";
                el.classList.add("rgh-div-head");
                el.classList.add(this.prevHeading + "-head");
                createIndentDiv("h1");
                createIndentDiv("h2");
                this.isPrevHeading = true;
                break;
            case "H4":
                SameLevelHeadingMargin();
                if (
                    this.isPrevHeading &&
                    (this.prevHeading == "rgh-h1" || this.prevHeading == "rgh-h2" || this.prevHeading == "rgh-h3")
                )
                    top5 = true;
                this.prevHeading = "rgh-h4";
                el.classList.add("rgh-div-head");
                el.classList.add(this.prevHeading + "-head");
                createIndentDiv("h1");
                createIndentDiv("h2");
                createIndentDiv("h3");
                this.isPrevHeading = true;
                break;
            case "H5":
                SameLevelHeadingMargin();
                if (
                    this.isPrevHeading &&
                    (this.prevHeading == "rgh-h1" ||
                        this.prevHeading == "rgh-h2" ||
                        this.prevHeading == "rgh-h3" ||
                        this.prevHeading == "rgh-h4")
                )
                    top5 = true;
                this.prevHeading = "rgh-h5";
                el.classList.add("rgh-div-head");
                el.classList.add(this.prevHeading + "-head");
                createIndentDiv("h1");
                createIndentDiv("h2");
                createIndentDiv("h3");
                createIndentDiv("h4");
                this.isPrevHeading = true;
                break;
            case "H6":
                SameLevelHeadingMargin();
                if (
                    this.isPrevHeading &&
                    (this.prevHeading == "rgh-h1" ||
                        this.prevHeading == "rgh-h2" ||
                        this.prevHeading == "rgh-h3" ||
                        this.prevHeading == "rgh-h4" ||
                        this.prevHeading == "rgh-h5")
                )
                    top5 = true;
                this.prevHeading = "rgh-h6";
                el.classList.add("rgh-div-head");
                el.classList.add(this.prevHeading + "-head");
                createIndentDiv("h1");
                createIndentDiv("h2");
                createIndentDiv("h3");
                createIndentDiv("h4");
                createIndentDiv("h5");
                this.isPrevHeading = true;
                break;
            default:
                if (this.prevHeading == null) {
                    // console.log(el, ": this.previousHeading is null");
                    break;
                }
                el.classList.add("rgh-div");
                el.classList.add(this.prevHeading);
                if (this.prevHeading[5] < "1" || this.prevHeading[5] > "6")
                    console.warn(
                        "ERROR: createIndentDiv switch not properly worked at ",
                        el,
                        "\nthis.prevHeading: ",
                        this.prevHeading,
                    );
                switch (this.prevHeading[5]) {
                    case "6":
                        createIndentDiv("h6", this.isPrevHeading); // falls through
                    case "5":
                        createIndentDiv("h5", this.isPrevHeading); // falls through
                    case "4":
                        createIndentDiv("h4", this.isPrevHeading); // falls through
                    case "3":
                        createIndentDiv("h3", this.isPrevHeading); // falls through
                    case "2":
                        createIndentDiv("h2", this.isPrevHeading); // falls through
                    case "1":
                        createIndentDiv("h1", this.isPrevHeading);
                }
                this.isPrevHeading = false;
        }

        // ? 檢查是否處理完一個 file 了，若是，重設全域變數 ? //
        const sectionInfo = ctx.getSectionInfo(el);
        if (sectionInfo) {
            const file = ctx.sourcePath;
            const tfile = this.app.vault.getAbstractFileByPath(file);
            if (tfile instanceof TFile) {
                const fileContents = await this.app.vault.cachedRead(tfile);
                const totalLines = fileContents.split("\n").length;

                if (sectionInfo.lineEnd >= totalLines - 1) {
                    // console.log("THIS IS THE END OF THE FILE");
                    this.isPrevHeading = false;
                    this.prevHeading = null;
                }
            }
        }
    };

    private async updateCss() {
        if (this.rogerStyleEl) {
            this.rogerStyleEl.remove();
            this.rogerStyleEl = null;
        }
        if (this.settings.enableAdditionalCss) {
            try {
                const pluginCssPath = `${this.app.vault.configDir}/plugins/${this.manifest.id}/roger.css`;
                const cssText = await this.app.vault.adapter.read(pluginCssPath);
                const el = document.createElement("style");
                el.textContent = cssText;
                document.head.appendChild(el);
                this.rogerStyleEl = el;
            } catch (e) {
                console.error("Better-Heading-Hierarchy loading roger.css error：", e);
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateCss();
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
        containerEl.createEl("h1", { text: "Better Heading Hierarchy - Setting" });

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
