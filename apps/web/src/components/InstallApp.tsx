import { useState } from "react";
import { rememberDismissed, useInstall, wasDismissedRecently } from "../lib/install";
import { asset } from "../lib/base";
import Icon from "./Icon";
import { Button } from "./ui";

/** Slim "Install the app" banner for the shop (hidden once installed, or for 7 days after "Not now"). */
export function InstallBanner() {
  const install = useInstall();
  const [hidden, setHidden] = useState(wasDismissedRecently());
  const [iosOpen, setIosOpen] = useState(false);

  if (hidden || install.installed || (!install.canPrompt && !install.needsIOSSteps)) return null;

  const dismiss = () => { rememberDismissed(); setHidden(true); };

  return (
    <>
      <div className="flex items-center gap-3 rounded-3xl bg-white p-3 pr-2 shadow-soft ring-1 ring-line/60">
        <img src={asset("icons/icon-192.png")} alt="" className="h-11 w-11 flex-none rounded-2xl" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">Get the Green Basket app</div>
          <div className="truncate text-xs text-ink-muted">Faster ordering, opens from your home screen</div>
        </div>
        <Button
          className="h-9 flex-none px-4"
          onClick={async () => {
            if (install.canPrompt) {
              const ok = await install.promptInstall();
              if (!ok) dismiss();
            } else setIosOpen(true);
          }}
        >
          Install
        </Button>
        <button onClick={dismiss} className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-ink-muted hover:bg-surface" aria-label="Not now">
          <Icon name="x" size={18} />
        </button>
      </div>
      {iosOpen && <IOSSteps onClose={() => setIosOpen(false)} />}
    </>
  );
}

/** Card for the Account page: always available until installed. */
export function InstallCard() {
  const install = useInstall();
  const [iosOpen, setIosOpen] = useState(false);
  if (install.installed) return null;

  return (
    <div className="rounded-3xl bg-white p-5 shadow-soft ring-1 ring-line/60">
      <div className="flex items-center gap-3">
        <img src={asset("icons/icon-192.png")} alt="" className="h-12 w-12 rounded-2xl" />
        <div>
          <div className="font-bold">Install the app</div>
          <div className="text-sm text-ink-muted">Add Green Basket to your home screen. No Play Store needed.</div>
        </div>
      </div>
      {install.canPrompt ? (
        <Button className="mt-4 w-full" onClick={() => void install.promptInstall()}><Icon name="upload" size={18} className="rotate-180" /> Install app</Button>
      ) : install.needsIOSSteps ? (
        <Button className="mt-4 w-full" onClick={() => setIosOpen(true)}>How to install on iPhone</Button>
      ) : install.inAppBrowser ? (
        <p className="mt-3 text-sm text-ink-soft">Open this page in <b>Chrome</b> (tap ⋮ → “Open in Chrome”), then install from there.</p>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">In Chrome, tap the <b>⋮ menu</b> → <b>“Install app”</b> or <b>“Add to Home screen”</b>.</p>
      )}
      {iosOpen && <IOSSteps onClose={() => setIosOpen(false)} />}
    </div>
  );
}

function IOSSteps({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/40 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-sm rounded-4xl bg-white p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lift" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Install on iPhone</h2>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface" aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <ol className="space-y-3 text-sm text-ink-soft">
          <li className="flex gap-3"><Step n={1} /> Open this page in <b>Safari</b>.</li>
          <li className="flex gap-3"><Step n={2} /> Tap the <b>Share</b> button <ShareIcon /> at the bottom of the screen.</li>
          <li className="flex gap-3"><Step n={3} /> Scroll down and tap <b>“Add to Home Screen”</b>.</li>
          <li className="flex gap-3"><Step n={4} /> Tap <b>Add</b>. Green Basket appears on your home screen.</li>
        </ol>
        <Button className="mt-6 w-full" onClick={onClose}>Got it</Button>
      </div>
    </div>
  );
}

const Step = ({ n }: { n: number }) => (
  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">{n}</span>
);

const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline -mt-0.5 text-sky-600" aria-label="Share">
    <path d="M12 3v12M7 8l5-5 5 5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
  </svg>
);
