// Service worker (offline support + "install app").
// After every deploy the new version must replace the copy saved on the phone straight away; otherwise an
// old copy keeps asking for files that no longer exist (for example renamed photos). So:
//  - check for a new version on start, every 30 minutes, and whenever the app comes back to the screen
//  - when a new version takes over, reload once so the page uses it
import { registerSW } from "virtual:pwa-register";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller); // false on the very first visit
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    window.location.reload();
  });

  registerSW({
    immediate: true,
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => void reg.update().catch(() => undefined);
      setInterval(check, 30 * 60_000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}
