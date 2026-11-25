import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useCategories, useProducts, useSettings } from "../../lib/api";
import { rupees } from "../../lib/format";
import { productImage } from "../../lib/images";
import { useSeo, type Crumb } from "../../lib/seo";
import { abs, BUSINESS, categoryPath, productPath, slugify } from "../../lib/site";
import { useCart } from "../../state/cart";
import ProductCard, { ProductImage, QtyStepper } from "../../components/ProductCard";
import Breadcrumbs from "../../components/Breadcrumbs";
import Icon from "../../components/Icon";
import { Button, FullPageSpinner } from "../../components/ui";
import NotFound from "../NotFound";

export default function ProductPage() {
  const { slug = "" } = useParams();
  const products = useProducts();
  const categories = useCategories();
  const settings = useSettings();
  const cart = useCart();
  const product = useMemo(() => products.data?.find((p) => slugify(p.name) === slug), [products.data, slug]);
  const [variantId, setVariantId] = useState<string | undefined>();
  const category = categories.data?.find((c) => c.id === product?.category_id);

  const crumbs: Crumb[] = [
    { name: "Home", path: "/" },
    ...(category ? [{ name: category.name, path: categoryPath(category) }] : []),
    ...(product ? [{ name: product.name, path: productPath(product) }] : []),
  ];
  const v = product?.product_variants.find((x) => x.id === variantId) ?? product?.product_variants[0];
  const from = product ? Math.min(...product.product_variants.map((x) => Number(x.price))) : 0;
  const image = product ? productImage(product) : null;

  useSeo({
    title: product ? (product.name.length <= 20 ? `Buy Fresh ${product.name} Online, Home Delivery` : `Buy ${product.name} Online`) : "Product",
    description: product
      ? clip(`Order fresh ${product.name.toLowerCase()}${product.name_local ? ` (${product.name_local})` : ""} online from ${BUSINESS.name}, from ${rupees(from)} for ${product.product_variants[0]?.label}. ${product.description ?? "Packed on the day of delivery and brought to your door in the time slot you choose."}`)
      : "Fresh vegetables and fruit delivered at home.",
    path: product ? productPath(product) : `/p/${slug}`,
    image: image ?? undefined,
    type: "product",
    crumbs: product ? crumbs : undefined,
    noindex: !product,
    jsonLd: product
      ? [{
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          ...(product.name_local ? { alternateName: product.name_local } : {}),
          ...(product.description ? { description: product.description } : {}),
          ...(image ? { image: new URL(image, window.location.origin).toString() } : {}),
          ...(category ? { category: category.name } : {}),
          brand: { "@type": "Brand", name: BUSINESS.name },
          offers: product.product_variants.map((x) => ({
            "@type": "Offer",
            name: x.label,
            price: Number(x.price).toFixed(2),
            priceCurrency: "INR",
            availability: Number(product.stock_qty) >= Number(x.pack_qty) ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: abs(productPath(product)),
            itemCondition: "https://schema.org/NewCondition",
          })),
        }]
      : undefined,
  });

  if (products.isLoading) return <FullPageSpinner />;
  if (!product || !v) return <NotFound />;

  const inCart = cart.quantityOf(v.id);
  const packsAvailable = Number(v.pack_qty) > 0 ? Math.floor(Number(product.stock_qty) / Number(v.pack_qty)) : 0;
  const discount = v.mrp && v.mrp > v.price ? Math.round(((v.mrp - v.price) / v.mrp) * 100) : 0;
  const maxQty = settings.data?.max_qty_per_item ?? 20;
  const related = (products.data ?? []).filter((p) => p.id !== product.id && p.category_id === product.category_id).slice(0, 5);

  return (
    <div>
      <Breadcrumbs items={crumbs} />
      <article className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="aspect-square overflow-hidden rounded-3xl bg-paper shadow-soft ring-1 ring-line/70">
          <ProductImage name={product.name} image_url={product.image_url} priority sizes="(min-width: 768px) 45vw, 100vw" />
        </div>

        <div>
          {category && <Link to={categoryPath(category)} className="eyebrow hover:text-brand">{category.name}</Link>}
          <h1 className="display mt-2 text-3xl sm:text-4xl">{product.name}</h1>
          {product.name_local && <p className="mt-1 text-lg text-ink-muted" lang="gu">{product.name_local}</p>}

          <div className="mt-5 flex items-baseline gap-3">
            <span className="tabular text-3xl font-bold">{rupees(v.price)}</span>
            {discount > 0 && (
              <>
                <span className="tabular text-ink-muted line-through"><span className="sr-only">MRP </span>{rupees(v.mrp)}</span>
                <span className="rounded bg-brand-accent px-2 py-0.5 text-xs font-bold text-white">{discount}% off</span>
              </>
            )}
          </div>
          <p className="mt-1 text-sm text-ink-muted">for {v.label} · inclusive of all taxes</p>

          {product.product_variants.length > 1 && (
            <fieldset className="mt-6">
              <legend className="mb-2 text-sm font-medium text-ink-soft">Pack size</legend>
              <div className="flex flex-wrap gap-2" role="radiogroup">
                {product.product_variants.map((x) => (
                  <button
                    key={x.id}
                    role="radio"
                    aria-checked={x.id === v.id}
                    onClick={() => setVariantId(x.id)}
                    className={`rounded-md px-4 py-2.5 text-sm font-semibold ring-1 ring-inset transition-colors ${x.id === v.id ? "bg-ink text-white ring-ink" : "bg-paper text-ink ring-line hover:ring-ink/40"}`}
                  >
                    {x.label} <span className={x.id === v.id ? "text-white/80" : "text-ink-muted"}>· {rupees(x.price)}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div className="mt-6 max-w-sm">
            {packsAvailable <= 0 ? (
              <p className="rounded-md bg-surface px-4 py-3 text-sm font-semibold text-ink-soft ring-1 ring-line">Sold out for today. Check back tomorrow.</p>
            ) : inCart > 0 ? (
              <div className="flex items-center gap-3">
                <QtyStepper value={inCart} label={product.name} onChange={(n) => cart.setQuantity(v.id, n)} max={Math.min(maxQty, packsAvailable)} />
                <Link to="/cart"><Button variant="secondary">Go to basket <Icon name="arrowRight" size={16} /></Button></Link>
              </div>
            ) : (
              <Button size="lg" className="w-full" onClick={() => cart.add({ ...product, image_url: image }, v)}>
                <Icon name="plus" size={18} /> Add to basket
              </Button>
            )}
            {packsAvailable > 0 && packsAvailable <= 5 && <p className="mt-2 text-sm font-medium text-amber-700">Only {packsAvailable} left today</p>}
          </div>

          {product.description && <p className="mt-6 max-w-prose text-[15px] leading-7 text-ink-soft">{product.description}</p>}

          <ul className="mt-6 space-y-2 border-t border-line pt-5 text-sm text-ink-soft">
            <li className="flex gap-2"><Icon name="clock" size={18} className="flex-none text-brand" /> Delivered in the slot you choose at checkout</li>
            {settings.data && <li className="flex gap-2"><Icon name="truck" size={18} className="flex-none text-brand" /> Free delivery on orders over {rupees(settings.data.free_delivery_above)}</li>}
            <li className="flex gap-2"><Icon name="shield" size={18} className="flex-none text-brand" /> Not right? Tell us within 24 hours for a replacement or refund</li>
          </ul>
        </div>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-title" className="mt-14">
          <div className="mb-5 flex items-end justify-between">
            <h2 id="related-title" className="display text-2xl">More {category?.name.toLowerCase() ?? "produce"}</h2>
            {category && <Link to={categoryPath(category)} className="text-sm font-semibold text-brand underline underline-offset-2">See all {category.name.toLowerCase()}</Link>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {related.map((p) => <ProductCard key={p.id} product={p} maxQty={maxQty} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/** Keep meta descriptions under 160 characters, cut at a word. */
function clip(text: string, max = 158): string {
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(" ", max - 1)).replace(/[,.;:]$/, "") + "…";
}
