// "Install the app" support.
// Android Chrome/Edge/Samsung Internet fire `beforeinstallprompt` when the site is installable; we keep that event
// and show our own Install button. iPhone Safari has no such event, so we show "Share → Add to Home Screen" steps.
import { useSyncExternalStore } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
let installedNow = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // stop Chrome's mini-infobar; we show our own banner
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installedNow = true;
    notify();
  });
}

const isStandalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

const ua = () => navigator.userAgent || "";
const isIOS = () => /iPhone|iPad|iPod/i.test(ua()) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
// in-app browsers (WhatsApp, Instagram, Facebook…) can't install apps; the user must open the link in Chrome/Safari
const isInAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|WhatsApp|wv\)/i.test(ua());

function snapshot() {
  return `${deferred ? 1 : 0}${installedNow ? 1 : 0}`;
}

export function useInstall() {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    snapshot,
    () => "00",
  );
  const standalone = typeof window !== "undefined" && (isStandalone() || installedNow);
  return {
    /** already running as an installed app */
    installed: standalone,
    /** Android/desktop Chrome: we can show the real install dialog */
    canPrompt: Boolean(deferred) && !standalone,
    /** iPhone/iPad Safari: show manual "Add to Home Screen" steps */
    needsIOSSteps: !standalone && isIOS() && !isInAppBrowser(),
    inAppBrowser: isInAppBrowser(),
    async promptInstall(): Promise<boolean> {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      notify();
      await e.prompt();
      const { outcome } = await e.userChoice;
      return outcome === "accepted";
    },
  };
}

const DISMISS_KEY = "gb_install_dismissed_at";
export function wasDismissedRecently(days = 7): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Date.now() - t < days * 86400_000;
  } catch {
    return false;
  }
}
export function rememberDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode */
  }
}
