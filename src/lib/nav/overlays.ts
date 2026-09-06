/** Coordinate studio overlays so at most one blocks the canvas. */

export const HELP_DISMISSED_KEY = "forma-help-dismissed";
export const HELP_SESSION_KEY = "forma-help";
export const INSTALL_KEY = "forma-install-dismissed";
export const NAV_COACH_KEY = "forma-nav-coached-v4";

export function helpDismissed(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(HELP_DISMISSED_KEY) === "1";
  } catch {
    return true;
  }
}

export function markHelpDismissed() {
  try {
    window.localStorage.setItem(HELP_DISMISSED_KEY, "1");
    window.sessionStorage.setItem(HELP_SESSION_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** True when we should auto-open Guide. Never if massing CTA (empty walls). */
export function shouldAutoOpenHelp(wallsCount: number): boolean {
  if (typeof window === "undefined") return false;
  if (wallsCount === 0) return false;
  try {
    if (window.localStorage.getItem(HELP_DISMISSED_KEY) === "1") return false;
    if (window.sessionStorage.getItem(HELP_SESSION_KEY) === "1") return false;
    window.sessionStorage.setItem(HELP_SESSION_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function canShowInstallBanner(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage.getItem(INSTALL_KEY) === "1") return false;
    return window.localStorage.getItem(HELP_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** When massing CTA is visible, settle help so Install can appear after CTA without stacking Guide. */
export function deferHelpForMassingCta() {
  try {
    if (window.localStorage.getItem(HELP_DISMISSED_KEY)) return;
    window.sessionStorage.setItem(HELP_SESSION_KEY, "1");
    window.localStorage.setItem(HELP_DISMISSED_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function canShowNavCoach(opts: {
  helpOpen: boolean;
  installVisible: boolean;
  massingCta: boolean;
}): boolean {
  if (typeof window === "undefined") return false;
  if (opts.helpOpen || opts.installVisible || opts.massingCta) return false;
  try {
    if (window.localStorage.getItem(NAV_COACH_KEY)) return false;
    return window.localStorage.getItem(HELP_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markNavCoached() {
  try {
    window.localStorage.setItem(NAV_COACH_KEY, "1");
  } catch {
    /* ignore */
  }
}
