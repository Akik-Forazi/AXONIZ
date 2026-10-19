/**
 * Stub settings module — replaces gemini-cli's config/settings.js.
 * Provides default settings + scope enum.
 */

export enum SettingScope {
  User = "user",
  Workspace = "workspace",
  System = "system",
}

export interface SettingsState {
  [key: string]: unknown;
}

export interface MergedSettings {
  ui?: {
    hideFooter?: boolean;
    hideBanner?: boolean;
    hideTips?: boolean;
    showUserIdentity?: boolean;
    footer?: { items?: string[]; showLabels?: boolean };
    errorVerbosity?: string;
  };
  [key: string]: unknown;
}

export function loadSettings(): SettingsState { return {}; }
export function saveSettings(_s: SettingsState): void {}
export function getMergedSettings(): MergedSettings {
  return { ui: { hideFooter: false, hideBanner: false, hideTips: false, showUserIdentity: false } };
}
