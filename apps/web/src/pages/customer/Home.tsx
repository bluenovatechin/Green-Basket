import { useMemo, useRef, useState } from "react";
import { useCategories, useOpenSlots, useProducts, useSettings } from "../../lib/api";
import { rupees, slotLabel } from "../../lib/format";
import { categoryImage, heroImage } from "../../lib/images";
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
  const [category, setCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (category === null || p.category_id === category) &&
        (!q || p.name.toLowerCase().includes(q) || (p.name_local ?? "").includes(q)),
    );
  }, [products.data, category, search]);

  const nextSlot = slots.data?.find((s) => s.booked < s.capacity);
  const activeCategory = categories.data?.find((c) => c.id === category);
  const pick = (id: number | null) => {
    setCategory(id);
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3 empty:hidden">
        <ClaimStoreBanner />
        <ActiveOrderBanner />
        <InstallBanner />
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden rounded-4xl bg-white shadow-soft ring-1 ring-line/60">
        <div className="grid md:grid-cols-[1.1fr_1fr]">
          <div className="relative z-10 p-6 sm:p-10">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand">
              <Icon name="leaf" size={14} /> Picked fresh every morning
            </span>
            <h1 className="mt-4 text-[2rem] font-extrabold leading-[1.1] sm:text-5xl">
              Farm-fresh produce,<br />
              <span className="text-brand">delivered to your door.</span>
            </h1>
            <p className="mt-3 max-w-md text-[15px] text-ink-soft">
              Vegetables, greens and fruits bought from the mandi each morning and brought home in your chosen slot.
            </p>

            <label className="mt-6 flex items-center gap-3 rounded-full bg-surface px-5 py-3.5 ring-1 ring-inset ring-line focus-within:bg-white focus-within:ring-2 focus-within:ring-brand">
              <Icon name="search" size={20} className="text-ink-muted" />
              <input
                type="search"
                placeholder="Search tomato, ટામેટા, banana…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && listRef.current?.scrollIntoView({ behavior: "smooth" })}
                className="w-full bg-transparent text-base outline-none placeholder:text-ink-muted/70"
                aria-label="Search products"
              />
            </label>

            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-soft">
              {nextSlot && <Perk icon="clock" text={`Next delivery ${slotLabel(nextSlot)}`} />}
              {settings.data && <Perk icon="truck" text={`Free delivery over ${rupees(settings.data.free_delivery_above)}`} />}
              <Perk icon="wallet" text="Cash, UPI or online" />
            </div>
          </div>
          <div className="relative h-48 md:h-auto">
            <img src={heroImage()} alt="Fresh vegetables at the market" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent md:bg-gradient-to-r md:from-white md:via-white/0" />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Shop by category</h2>
        <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          <CategoryTile label="Everything" active={category === null} onClick={() => pick(null)} />
          {categories.data?.map((c) => (
            <CategoryTile key={c.id} label={c.name} image={categoryImage(c.slug)} active={category === c.id} onClick={() => pick(c.id)} />
          ))}
        </div>
      </section>

      {/* Products */}
      <section ref={listRef} className="scroll-mt-24">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold">{search ? `Results for “${search}”` : activeCategory?.name ?? "Fresh today"}</h2>
            <p className="text-sm text-ink-muted">{visible.length} item{visible.length === 1 ? "" : "s"}</p>
          </div>
          {(category !== null || search) && (
            <button className="text-sm font-semibold text-brand" onClick={() => { setCategory(null); setSearch(""); }}>Clear</button>
          )}
        </div>

        {products.isLoading ? (
          <FullPageSpinner />
        ) : products.error ? (
          <Empty title="Couldn't load products" icon="alert">Check your internet connection and try again.</Empty>
        ) : visible.length === 0 ? (
          <Empty title="Nothing found" icon="search">Try another name or category.</Empty>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {visible.map((p) => (
              <ProductCard key={p.id} product={p} maxQty={settings.data?.max_qty_per_item ?? 20} />
            ))}
          </div>
        )}
      </section>

      {/* Promise */}
      <section className="grid gap-3 sm:grid-cols-3">
        <PromiseCard icon="leaf" title="Mandi-fresh" text="Bought every morning, never stored for days." />
        <PromiseCard icon="clock" title="Your time slot" text="Pick a morning or evening delivery that suits you." />
        <PromiseCard icon="shield" title="Quality promise" text="Not happy with an item? Tell us within 24 hours." />
      </section>
    </div>
  );
}

function Perk({ icon, text }: { icon: IconName; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><Icon name={icon} size={16} className="text-brand" />{text}</span>;
}

function CategoryTile({ label, image, active, onClick }: { label: string; image?: string | null; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex w-24 flex-none flex-col items-center gap-2 sm:w-28" aria-pressed={active}>
      <span className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-white shadow-soft ring-2 transition sm:h-24 sm:w-24 ${active ? "ring-brand" : "ring-transparent group-hover:ring-line"}`}>
        {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : <Icon name="grid" size={28} className="text-brand" />}
      </span>
      <span className={`text-center text-xs font-semibold leading-tight ${active ? "text-brand" : "text-ink-soft"}`}>{label}</span>
    </button>
  );
}

function PromiseCard({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="flex items-start gap-3 rounded-3xl bg-white p-5 ring-1 ring-line/60">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-brand-light text-brand"><Icon name={icon} size={20} /></span>
      <span>
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-sm text-ink-muted">{text}</span>
      </span>
    </div>
  );
}
