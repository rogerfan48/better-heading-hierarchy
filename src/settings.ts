export interface BetterHeadingHierarchySettings {
  showInReadingView: boolean;
  showInEditingView: boolean;
  autoInstallSnippet: boolean;
  excludedFolders: string;
}

export const DEFAULT_SETTINGS: BetterHeadingHierarchySettings = {
  showInReadingView: true,
  showInEditingView: true,
  autoInstallSnippet: false,
  excludedFolders: "",
};

export const NOTE_PROPERTY = "heading-guides";
