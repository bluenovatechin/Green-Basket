import { useState } from "react";
import { Link } from "react-router-dom";
import { saveConsent, useConsent } from "../lib/consent";
import { Button } from "./ui";

/** Opt-in storage/cookie notice. Shown until the visitor chooses; reopened from the footer. */
export default function CookieBanner() {
  const { consent, showBanner, analyticsAvailable } = useConsent();
  const [custom, setCustom] = useState(false);
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);

  if (!showBanner) return null;

  return (
    <section
      aria-label="Cookie preferences"
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-line bg-paper px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 shadow-lift sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-md sm:rounded-lg sm:border sm:pb-4"
    >
      <h2 className="text-[15px] font-semibold">Your privacy choices</h2>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">
        We store a few things on your device to keep you logged in and remember your basket. These are always on.
        {analyticsAvailable
          ? " With your permission we also use Google Analytics to see which pages are used, so we can improve the shop."
          : " We don't use advertising or tracking cookies."}{" "}
        <Link to="/privacy#cookies" className="font-medium text-brand underline underline-offset-2">Read our privacy policy</Link>
      </p>

      {custom && (
        <div className="mt-3 space-y-2">
          <Row title="Necessary" text="Login, basket and this choice. Needed for the shop to work." checked disabled />
          {analyticsAvailable && (
            <Row title="Analytics" text="Anonymous page statistics (Google Analytics 4)." checked={analytics} onChange={setAnalytics} />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {custom ? (
          <Button className="flex-1" onClick={() => saveConsent(analytics)}>Save choices</Button>
        ) : (
          <>
            <Button className="flex-1" onClick={() => saveConsent(true)}>Accept all</Button>
            <Button variant="secondary" className="flex-1" onClick={() => saveConsent(false)}>Necessary only</Button>
            {analyticsAvailable && (
              <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setCustom(true)}>Customise</Button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Row({ title, text, checked, disabled, onChange }: { title: string; text: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className={`flex items-start justify-between gap-3 rounded-md bg-surface p-3 ${disabled ? "" : "cursor-pointer"}`}>
      <span className="text-sm">
        <span className="block font-semibold">{title}</span>
        <span className="text-ink-muted">{text}</span>
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 flex-none accent-brand"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        aria-label={title}
      />
    </label>
  );
}
