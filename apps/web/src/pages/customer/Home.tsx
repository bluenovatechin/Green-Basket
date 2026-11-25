import { useMemo, useState, type ReactNode } from "react";
import { useCategories, useOpenSlots, useProducts, useSettings } from "../../lib/api";
import { rupees, slotLabel } from "../../lib/format";
import ActiveOrderBanner from "../../components/ActiveOrderBanner";
import ClaimStoreBanner from "../../components/ClaimStoreBanner";
import ProductCard from "../../components/ProductCard";
import { Empty, FullPageSpinner, inputClass } from "../../components/ui";

export default function Home() {
  const products = useProducts();
  const categories = useCategories();
  const settings = useSettings();
  const slots = useOpenSlots();
  const [category, setCategory] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (category === null || p.category_id === category) &&
        (!q || p.name.toLowerCase().includes(q) || (p.name_local ?? "").includes(q)),
    );
  }, [products.data, category, search]);

  const nextSlot = slots.data?.find((s) => s.booked < s.capacity);

  return (
    <div>
      <ClaimStoreBanner />
      <ActiveOrderBanner />
      <section className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-white">
        <p className="text-sm font-semibold text-brand-accent">Eat Fresh. Live Better.</p>
        <h1 className="text-2xl font-bold leading-tight">Fresh from the mandi<br className="sm:hidden" /> to your door</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
          {nextSlot && <span className="rounded-full bg-white/15 px-3 py-1">🛵 Next delivery: {slotLabel(nextSlot)}</span>}
          {settings.data && <span className="rounded-full bg-white/15 px-3 py-1">Free delivery above {rupees(settings.data.free_delivery_above)}</span>}
          <span className="rounded-full bg-white/15 px-3 py-1">💵 Cash, UPI or online</span>
        </div>
      </section>

      <input
        type="search"
        placeholder="Search tomato, ટામેટા, mango…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${inputClass} mb-3`}
        aria-label="Search products"
      />

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip active={category === null} onClick={() => setCategory(null)}>All</Chip>
        {categories.data?.map((c) => (
          <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>{c.name}</Chip>
        ))}
      </div>

      {products.isLoading ? (
        <FullPageSpinner />
      ) : products.error ? (
        <Empty title="Couldn't load products">Check your internet connection and pull to refresh.</Empty>
      ) : visible.length === 0 ? (
        <Empty title="Nothing found">Try another name or category.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((p) => (
            <ProductCard key={p.id} product={p} maxQty={settings.data?.max_qty_per_item ?? 20} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${active ? "bg-brand text-white" : "border border-gray-300 bg-white text-gray-700"}`}
    >
      {children}
    </button>
  );
}
