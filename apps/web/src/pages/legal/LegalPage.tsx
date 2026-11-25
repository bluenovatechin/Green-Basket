import type { ReactNode } from "react";
import { useSettings } from "../../lib/api";
import { useSeo, type Crumb } from "../../lib/seo";
import { abs, BUSINESS, LEGAL_UPDATED } from "../../lib/site";
import Breadcrumbs from "../../components/Breadcrumbs";

export interface Section { id: string; title: string; body: ReactNode }

/** Shared layout for Privacy Policy and Terms: summary, table of contents, long-form text, last-updated date. */
export default function LegalPage({ path, title, seoTitle, description, summary, sections }: {
  path: string; title: string; seoTitle: string; description: string; summary: ReactNode; sections: Section[];
}) {
  const crumbs: Crumb[] = [{ name: "Home", path: "/" }, { name: title, path }];
  useSeo({
    title: seoTitle,
    description,
    path,
    type: "article",
    crumbs,
    dateModified: LEGAL_UPDATED,
    jsonLd: [{
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: title,
      url: abs(path),
      inLanguage: "en-IN",
      dateModified: LEGAL_UPDATED,
      publisher: { "@type": "Organization", name: BUSINESS.legalName || BUSINESS.name, url: abs("/") },
    }],
  });

  const updated = new Date(LEGAL_UPDATED + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <header className="max-w-3xl">
        <h1 className="display text-3xl sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-muted">Last updated <time dateTime={LEGAL_UPDATED}>{updated}</time></p>
        <div className="mt-5 rounded-lg bg-paper p-5 text-[15px] leading-7 text-ink-soft ring-1 ring-line">{summary}</div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[220px_1fr]">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-24">
            <h2 className="eyebrow">On this page</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {sections.map((s) => (
                <li key={s.id}><a href={`#${s.id}`} className="text-ink-soft hover:text-ink hover:underline underline-offset-2">{s.title}</a></li>
              ))}
            </ol>
          </nav>
        </aside>
        <div className="prose-gb min-w-0">
          {sections.map((s, i) => (
            <section key={s.id} aria-labelledby={s.id}>
              <h2 id={s.id} className={i === 0 ? "!mt-0" : ""}>{i + 1}. {s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Contact lines for legal pages, from Admin → Settings and lib/site.ts. Nothing is shown that isn't filled in. */
export function useContact() {
  const s = useSettings().data;
  const email = BUSINESS.grievanceOfficer.email || s?.support_email || "";
  return {
    supportEmail: s?.support_email ?? "",
    supportPhone: s?.support_phone ?? "",
    grievanceName: BUSINESS.grievanceOfficer.name,
    grievanceEmail: email,
    entity: BUSINESS.legalName || BUSINESS.name,
    address: [BUSINESS.streetAddress, BUSINESS.city, BUSINESS.postalCode, BUSINESS.region, "India"].filter(Boolean).join(", "),
  };
}

export function ContactBlock() {
  const c = useContact();
  return (
    <ul>
      <li><strong>Business:</strong> {c.entity}{c.address ? `, ${c.address}` : ""}</li>
      {c.supportEmail && <li><strong>Email:</strong> <a href={`mailto:${c.supportEmail}`}>{c.supportEmail}</a></li>}
      {c.supportPhone && <li><strong>Phone:</strong> <a href={`tel:${c.supportPhone.replace(/\s+/g, "")}`}>{c.supportPhone}</a></li>}
      {(c.grievanceName || c.grievanceEmail) && (
        <li>
          <strong>Grievance Officer:</strong> {c.grievanceName || "Grievance Officer"}
          {c.grievanceEmail && <> (<a href={`mailto:${c.grievanceEmail}`}>{c.grievanceEmail}</a>)</>}
        </li>
      )}
    </ul>
  );
}
