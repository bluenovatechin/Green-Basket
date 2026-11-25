import { useMemo, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useCategories, useOpenSlots, useProducts, useSettings } from "../../lib/api";
import { rupees, slotLabel } from "../../lib/format";
import { categoryImageSet, heroImageSet } from "../../lib/images";
import { useSeo } from "../../lib/seo";
import { abs, BUSINESS, categoryPath } from "../../lib/site";
import { asset } from "../../lib/base";
import type { Settings } from "../../lib/types";
import ActiveOrderBanner from "../../components/ActiveOrderBanner";
import ClaimStoreBanner from "../../components/ClaimStoreBanner";
import { InstallBanner } from "../../components/InstallApp";
import ProductCard from "../../components/ProductCard";
import Icon, { type IconName } from "../../components/Icon";
import { Empty, FullPageSpinner } from "../../components/ui";

export default function Home() {
  const products = useProducts();
  const categories = useCategories();
  const settings = useSettings();
  const slots = useOpenSlots();
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  const listRef = useRef<HTMLElement>(null);
  const s = settings.data;

  const setSearch = (q: string) => {
    const next = new URLSearchParams(params);
    if (q) next.set("q", q);
    else next.delete("q");
    setParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q) || (p.name_local ?? "").includes(q));
  }, [products.data, search]);

  const nextSlot = slots.data?.find((x) => x.booked < x.capacity);
  const faqs = useMemo(() => buildFaqs(s), [s]);

  useSeo({
    title: "Fresh Vegetables & Fruits Delivered at Home",
    description: `Order fresh vegetables, leafy greens and fruit online from ${BUSINESS.name}. Pick a delivery slot, pay by UPI, card or cash on delivery, and track your order live.`,
    path: "/",
    jsonLd: [websiteLd(), storeLd(s), ...(faqs.length ? [faqLd(faqs)] : [])],
  });

  const goToProducts = () => listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const hero = heroImageSet();

  return (
    <div className="flex flex-col gap-10 sm:gap-14">
      <div className="space-y-3 empty:hidden">
        <ClaimStoreBanner />
        <ActiveOrderBanner />
        <InstallBanner />
      </div>

      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden rounded-3xl bg-paper shadow-soft ring-1 ring-line/70">
        <div className="grid md:grid-cols-[1.1fr_1fr]">
          <div className="relative z-10 p-6 sm:p-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand">
              <Icon name="leaf" size={14} /> Picked fresh every morning
            </span>
            <h1 id="hero-title" className="display mt-4 text-[2rem] leading-[1.1] sm:text-5xl">
              Farm-fresh produce,<br />
              <span className="text-brand">delivered to your door.</span>
            </h1>
            <p className="mt-3 max-w-md text-[15px] leading-6 text-ink-soft">
              Vegetables, greens and fruits bought from the mandi each morning and brought home in your chosen slot.
            </p>

            <form
              role="search"
              className="mt-6 flex h-14 items-center gap-2 rounded-full bg-surface pl-5 pr-1.5 ring-1 ring-inset ring-line focus-within:bg-paper focus-within:ring-2 focus-within:ring-brand"
              onSubmit={(e) => { e.preventDefault(); goToProducts(); }}
            >
              <Icon name="search" size={20} className="flex-none text-ink-muted" />
              <label htmlFor="home-search" className="sr-only">Search products</label>
              <input
                id="home-search"
                type="search"
                placeholder="Search tomato, ટામેટા, banana…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-ink-muted"
              />
              <button type="submit" className="inline-flex h-11 flex-none items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-brand-dark sm:px-5">
                Shop now <Icon name="arrowRight" size={16} className="hidden sm:block" />
              </button>
            </form>

            <ul className="mt-5 flex min-h-[2.75rem] flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
              <Perk icon="clock" text={nextSlot ? `Next delivery ${slotLabel(nextSlot)}` : slots.isLoading ? "Checking delivery slots…" : "Pick a delivery slot at checkout"} />
              <Perk icon="truck" text={s ? `Free delivery over ${rupees(s.free_delivery_above)}` : "Free delivery on bigger orders"} />
              {s && <Perk icon="wallet" text={payMethods(s)} />}
            </ul>
          </div>

          <div className="relative h-48 md:h-auto">
            <img
              src={hero.src}
              srcSet={hero.srcSet}
              sizes="(min-width: 768px) 45vw, 100vw"
              width={960}
              height={1200}
              alt="Tomatoes, greens and other vegetables on a market stall"
              className="absolute inset-0 h-full w-full object-cover"
              {...{ fetchpriority: "high" }}
              decoding="async"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-white via-white/0 to-transparent md:bg-gradient-to-r md:from-white md:via-white/0" aria-hidden="true" />
          </div>
        </div>
      </section>

      {/* Categories */}
      {(categories.data?.length ?? 0) > 0 && (
        <section aria-labelledby="cat-title">
          <h2 id="cat-title" className="display text-2xl sm:text-[1.75rem]">Shop by category</h2>
          <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-5">
            {categories.data?.map((c) => {
              const img = categoryImageSet(c.slug);
              return (
                <Link key={c.id} to={categoryPath(c)} className="group relative block overflow-hidden rounded-2xl bg-brand-light shadow-soft">
                  <div className="aspect-square sm:aspect-[16/9]">
                    {img ? (
                      <img src={img.src} srcSet={img.srcSet} sizes="(min-width: 640px) 33vw, 30vw" width={480} height={480} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-brand"><Icon name="grid" size={28} /></div>
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2.5 pt-8 sm:px-5 sm:pb-4">
                    <span className="flex items-center justify-between gap-1 text-[13px] font-bold leading-tight text-white sm:text-lg">
                      {c.name}
                      <Icon name="arrowRight" size={18} className="hidden flex-none transition group-hover:translate-x-1 sm:block" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Products */}
      <section ref={listRef} aria-labelledby="products-title" className="scroll-mt-24">
        <div className="mb-5 flex items-end justify-between gap-3">
          <div>
            <h2 id="products-title" className="display text-2xl sm:text-[1.75rem]">{search ? `Results for “${search}”` : "Available today"}</h2>
            <p className="mt-1 text-sm text-ink-muted">{visible.length} item{visible.length === 1 ? "" : "s"}</p>
          </div>
          {search && <button className="text-sm font-semibold text-brand underline underline-offset-2" onClick={() => setSearch("")}>Clear search</button>}
        </div>

        {products.isLoading ? (
          <FullPageSpinner />
        ) : products.error ? (
          <Empty title="Couldn't load products" icon="alert">Check your internet connection and try again.</Empty>
        ) : visible.length === 0 ? (
          <Empty title="Nothing found" icon="search">Try another name, or browse a category above.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map((p, i) => (
              <ProductCard key={p.id} product={p} maxQty={s?.max_qty_per_item ?? 20} priority={i < 2} />
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section aria-labelledby="how-title" className="rounded-3xl bg-brand-50 p-6 ring-1 ring-brand-100 sm:p-10">
        <h2 id="how-title" className="display text-2xl sm:text-[1.75rem]">How ordering works</h2>
        <ol className="mt-6 grid gap-6 sm:grid-cols-3">
          <Step n={1} title="Fill your basket" text="Choose pack sizes by weight, bunch or piece. Prices are shown before you pay." />
          <Step n={2} title="Pick a delivery slot" text="Choose a morning or evening slot. You'll see how many places are left in each." />
          <Step n={3} title="Track and receive" text="Follow your order from packing to your door. Pay online or in cash on delivery." />
        </ol>
      </section>

      {/* FAQ */}
      {faqs.length > 0 && (
        <section id="faq" aria-labelledby="faq-title" className="scroll-mt-24">
          <h2 id="faq-title" className="display text-2xl sm:text-[1.75rem]">Delivery questions</h2>
          <div className="mt-5 divide-y divide-line overflow-hidden rounded-2xl bg-paper shadow-soft ring-1 ring-line/70">
            {faqs.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-semibold">
                  <h3>{f.q}</h3>
                  <Icon name="chevronDown" size={18} className="flex-none text-ink-muted transition group-open:rotate-180" />
                </summary>
                <p className="mt-2 max-w-[68ch] text-[15px] leading-7 text-ink-soft">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Closing CTA */}
      <section className="flex flex-col items-start justify-between gap-5 rounded-3xl bg-brand p-6 text-white sm:flex-row sm:items-center sm:p-10">
        <div>
          <h2 className="display text-2xl text-white sm:text-[1.75rem]">Ready for this week's vegetables?</h2>
          <p className="mt-2 text-white/85">{nextSlot ? `Order now for delivery ${slotLabel(nextSlot)}.` : "Order now and pick a delivery slot at checkout."}</p>
        </div>
        <button onClick={goToProducts} className="inline-flex h-12 flex-none items-center gap-2 rounded-md bg-paper px-6 text-[15px] font-semibold text-brand transition-colors hover:bg-brand-light active:translate-y-px">
          Start shopping <Icon name="arrowRight" size={18} />
        </button>
      </section>
    </div>
  );
}

function Perk({ icon, text }: { icon: IconName; text: string }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <Icon name={icon} size={16} className="flex-none text-brand" />
      {text}
    </li>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li>
      <span className="tabular flex h-9 w-9 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{n}</span>
      <h3 className="mt-3 font-semibold">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{text}</p>
    </li>
  );
}

function payMethods(s: Settings): string {
  const m = [s.online_payment_enabled && "UPI, card", s.cod_enabled && "cash on delivery"].filter(Boolean);
  return m.length ? `Pay by ${m.join(" or ")}` : "Pay at checkout";
}

/** Answers are built from the live store settings, so they are always accurate. */
function buildFaqs(s: Settings | undefined): { q: string; a: string }[] {
  if (!s) return [];
  const list = [
    {
      q: "Is there a minimum order?",
      a: s.min_order_value > 0
        ? `Yes. The minimum order is ${rupees(s.min_order_value)}, counted on the items in your basket before delivery charges.`
        : "No. You can order any amount.",
    },
    {
      q: "How much is delivery?",
      a: `Delivery is ${s.delivery_fee > 0 ? rupees(s.delivery_fee) : "free"} per order, and free when your basket is over ${rupees(s.free_delivery_above)}. The exact charge is shown before you pay.`,
    },
    {
      q: "How can I pay?",
      a: [
        s.online_payment_enabled && "You can pay online with UPI, cards or net banking through PhonePe.",
        s.cod_enabled && `Cash on delivery is available for orders up to ${rupees(s.cod_max_amount)}.`,
        "You can switch between online payment and cash on delivery from your order page while it is still unpaid.",
      ].filter(Boolean).join(" "),
    },
    {
      q: "When will my order arrive?",
      a: "You choose a delivery slot at checkout. Each slot has a fixed time window and a limited number of orders, so the time you pick is the time we come.",
    },
    {
      q: "Can I cancel an order?",
      a: "Yes, you can cancel from your order page any time before it is packed. If you paid online, the refund goes back to the same payment method.",
    },
    {
      q: "What if an item is not fresh or is missing?",
      a: `Tell us within 24 hours of delivery${s.support_phone ? ` by calling ${s.support_phone}` : ""}${s.support_email ? `${s.support_phone ? " or" : " by"} emailing ${s.support_email}` : ""}. We will replace the item or refund it.`,
    },
  ];
  return list;
}

function faqLd(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

function websiteLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: BUSINESS.name,
    url: abs("/"),
    inLanguage: "en-IN",
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${abs("/")}?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

/** GroceryStore (a LocalBusiness). Only real, filled-in details are included. */
function storeLd(s: Settings | undefined) {
  const hasAddress = BUSINESS.streetAddress || BUSINESS.city;
  return {
    "@context": "https://schema.org",
    "@type": "GroceryStore",
    name: BUSINESS.name,
    ...(BUSINESS.legalName ? { legalName: BUSINESS.legalName } : {}),
    url: abs("/"),
    logo: new URL(asset("icons/icon-512.png"), window.location.origin).toString(),
    image: new URL(asset("og-image.jpg"), window.location.origin).toString(),
    slogan: BUSINESS.tagline,
    priceRange: "₹",
    currenciesAccepted: "INR",
    paymentAccepted: s ? [s.online_payment_enabled && "UPI, Credit Card, Debit Card", s.cod_enabled && "Cash"].filter(Boolean).join(", ") : undefined,
    ...(s?.support_phone ? { telephone: s.support_phone } : {}),
    ...(s?.support_email ? { email: s.support_email } : {}),
    ...(BUSINESS.openingHours ? { openingHours: BUSINESS.openingHours } : {}),
    ...(hasAddress
      ? {
          address: {
            "@type": "PostalAddress",
            ...(BUSINESS.streetAddress ? { streetAddress: BUSINESS.streetAddress } : {}),
            ...(BUSINESS.city ? { addressLocality: BUSINESS.city } : {}),
            ...(BUSINESS.postalCode ? { postalCode: BUSINESS.postalCode } : {}),
            addressRegion: BUSINESS.region,
            addressCountry: BUSINESS.country,
          },
        }
      : {}),
    areaServed: BUSINESS.city || BUSINESS.region,
  };
}
