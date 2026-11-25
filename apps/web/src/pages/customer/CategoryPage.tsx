import { Link, useParams } from "react-router-dom";
import { useCategories, useProducts, useSettings } from "../../lib/api";
import { useSeo, type Crumb } from "../../lib/seo";
import { abs, BUSINESS, categoryPath, productPath } from "../../lib/site";
import { categoryImage } from "../../lib/images";
import ProductCard from "../../components/ProductCard";
import Breadcrumbs from "../../components/Breadcrumbs";
import { Empty, FullPageSpinner } from "../../components/ui";
import NotFound from "../NotFound";

const INTRO: Record<string, string> = {
  vegetables: "Everyday vegetables for Gujarati and Indian cooking, sold by weight so you buy only what you need.",
  "leafy-herbs": "Spinach, coriander and other greens, sold by the bunch and packed on the day of delivery.",
  fruits: "Seasonal and everyday fruit, sold by weight or by the piece.",
};

export default function CategoryPage() {
  const { slug = "" } = useParams();
  const categories = useCategories();
  const products = useProducts();
  const settings = useSettings();
  const category = categories.data?.find((c) => c.slug === slug);
  const list = (products.data ?? []).filter((p) => p.category_id === category?.id);
  const crumbs: Crumb[] = [{ name: "Home", path: "/" }, ...(category ? [{ name: category.name, path: categoryPath(category) }] : [])];
  const intro = category ? INTRO[category.slug] ?? `Fresh ${category.name.toLowerCase()} delivered to your home.` : "";

  useSeo({
    title: category ? `Buy ${category.name.toLowerCase().startsWith("fresh ") ? category.name : `Fresh ${category.name}`} Online, Home Delivery` : "Category",
    description: category
      ? `${intro} Order ${category.name.toLowerCase()} online from ${BUSINESS.name} and get it delivered in your chosen time slot.`.slice(0, 160)
      : "Fresh produce delivered at home.",
    path: category ? categoryPath(category) : `/c/${slug}`,
    image: category ? categoryImage(category.slug) ?? undefined : undefined,
    crumbs: category ? crumbs : undefined,
    noindex: !category && !categories.isLoading,
    jsonLd: category
      ? [{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: category.name,
          url: abs(categoryPath(category)),
          mainEntity: {
            "@type": "ItemList",
            itemListElement: list.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: abs(productPath(p)), name: p.name })),
          },
        }]
      : undefined,
  });

  if (categories.isLoading || products.isLoading) return <FullPageSpinner />;
  if (!category) return <NotFound />;

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <header className="mb-8 max-w-2xl">
        <h1 className="display text-3xl sm:text-4xl">{category.name}</h1>
        <p className="mt-3 text-[15px] leading-7 text-ink-soft">{intro}</p>
      </header>

      {list.length === 0 ? (
        <Empty title="Nothing here today" icon="leaf">Check back tomorrow, or <Link to="/" className="font-semibold text-brand underline">see everything available</Link>.</Empty>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((p, i) => <ProductCard key={p.id} product={p} maxQty={settings.data?.max_qty_per_item ?? 20} priority={i < 2} />)}
        </div>
      )}

      {/* links to the other categories (internal linking without repeating the same keywords) */}
      {(categories.data?.length ?? 0) > 1 && (
        <nav aria-label="Other categories" className="mt-12 border-t border-line pt-6">
          <h2 className="eyebrow">Other categories</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {categories.data?.filter((c) => c.id !== category.id).map((c) => (
              <li key={c.id}>
                <Link to={categoryPath(c)} className="inline-flex h-10 items-center rounded-md bg-paper px-4 text-sm font-semibold ring-1 ring-inset ring-line hover:ring-ink/40">{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
