import { useState } from "react";
import { Link } from "react-router-dom";
import type { Product } from "../lib/types";
import { rupees } from "../lib/format";
import { productImage, productImageSet } from "../lib/images";
import { productPath } from "../lib/site";
import { useCart } from "../state/cart";
import Icon from "./Icon";

export function QtyStepper({ value, onChange, max, size = "md", fluid = false, label = "item" }: { value: number; onChange: (n: number) => void; max?: number; size?: "sm" | "md"; fluid?: boolean; label?: string }) {
  const h = size === "sm" ? "h-9" : "h-10";
  // fluid (product cards): full width on phones, compact on wider screens
  const width = fluid ? "w-full justify-between sm:w-auto sm:justify-start" : "";
  return (
    <div className={`flex ${h} ${width} items-center rounded-md bg-brand text-white`} role="group" aria-label={`Quantity of ${label}`}>
      <button className={`flex ${h} w-9 items-center justify-center rounded-md hover:bg-black/15`} onClick={() => onChange(value - 1)} aria-label={`Remove one ${label}`}>
        <Icon name="minus" size={16} strokeWidth={2.25} />
      </button>
      <span className="tabular w-7 text-center text-sm font-bold" aria-live="polite">{value}</span>
      <button className={`flex ${h} w-9 items-center justify-center rounded-md hover:bg-black/15 disabled:opacity-40`} onClick={() => onChange(value + 1)} disabled={max !== undefined && value >= max} aria-label={`Add one ${label}`}>
        <Icon name="plus" size={16} strokeWidth={2.25} />
      </button>
    </div>
  );
}

/** Product photo with srcset; `decorative` when the name is printed right next to it. */
export function ProductImage({ name, image_url, className = "", sizes = "(min-width: 1024px) 240px, 45vw", priority = false, decorative = false }: {
  name: string; image_url?: string | null; className?: string; sizes?: string; priority?: boolean; decorative?: boolean;
}) {
  const img = productImageSet({ name, image_url });
  return img ? (
    <img
      src={img.src}
      srcSet={img.srcSet}
      sizes={img.srcSet ? sizes : undefined}
      alt={decorative ? "" : name}
      width={480}
      height={480}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchpriority: "high" } : {})}
      className={`h-full w-full object-cover ${className}`}
    />
  ) : (
    <div className={`flex h-full w-full items-center justify-center text-brand/40 ${className}`} aria-hidden="true"><Icon name="leaf" size={36} /></div>
  );
}

export default function ProductCard({ product, maxQty, priority = false }: { product: Product; maxQty: number; priority?: boolean }) {
  const cart = useCart();
  const [variantId, setVariantId] = useState(product.product_variants[0]?.id);
  const v = product.product_variants.find((x) => x.id === variantId) ?? product.product_variants[0];
  const inCart = cart.quantityOf(v.id);
  const stockQty = Number(product.stock_qty);
  const packQty = Number(v.pack_qty);
  const packsAvailable = packQty > 0 ? Math.floor(stockQty / packQty) : 0;
  const outOfStock = packsAvailable <= 0;
  const lowStock = packsAvailable > 0 && packsAvailable <= 5;
  const discount = v.mrp && v.mrp > v.price ? Math.round(((v.mrp - v.price) / v.mrp) * 100) : 0;
  const href = productPath(product);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl bg-paper shadow-soft ring-1 ring-line/70 transition hover:shadow-lift">
      <Link to={href} className="relative block aspect-square overflow-hidden bg-surface" tabIndex={-1} aria-hidden="true">
        <ProductImage name={product.name} image_url={product.image_url} priority={priority} decorative className={`transition duration-500 group-hover:scale-[1.03] ${outOfStock ? "opacity-60 grayscale" : ""}`} />
        {discount > 0 && (
          <span className="absolute left-2.5 top-2.5 rounded-md bg-brand-accent px-2 py-0.5 text-[11px] font-bold text-white">{discount}% off</span>
        )}
        {lowStock && (
          <span className="absolute bottom-2.5 left-2.5 rounded-md bg-ink/85 px-2 py-0.5 text-[11px] font-semibold text-white">Only {packsAvailable} left</span>
        )}
        {outOfStock && (
          <span className="absolute inset-x-2.5 bottom-2.5 rounded-md bg-paper py-1 text-center text-xs font-semibold text-ink-soft">Sold out today</span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-3">
        <h3 className="text-[15px] font-semibold leading-snug">
          <Link to={href} className="hover:text-brand">{product.name}</Link>
        </h3>
        {product.name_local && <p className="text-xs text-ink-muted" lang="gu">{product.name_local}</p>}

        {product.product_variants.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={`${product.name} pack size`}>
            {product.product_variants.map((x) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={x.id === v.id}
                onClick={() => setVariantId(x.id)}
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ring-1 ring-inset transition-colors ${x.id === v.id ? "bg-ink text-white ring-ink" : "bg-paper text-ink-soft ring-line hover:ring-ink/40"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs font-medium text-ink-muted">{v.label}</p>
        )}

        {/* Phones: price on its own line and a full-width button below. Wider screens: side by side. */}
        <div className="mt-auto flex flex-col gap-2 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-baseline gap-1.5 leading-tight sm:block">
            <div className="tabular text-base font-bold">{rupees(v.price)}</div>
            {discount > 0 && <div className="tabular text-[11px] text-ink-muted line-through"><span className="sr-only">MRP </span>{rupees(v.mrp)}</div>}
          </div>
          {outOfStock ? null : inCart > 0 ? (
            <QtyStepper size="sm" fluid value={inCart} label={product.name} onChange={(n) => cart.setQuantity(v.id, n)} max={Math.min(maxQty, packsAvailable)} />
          ) : (
            <button
              onClick={() => cart.add({ ...product, image_url: productImage(product) }, v)}
              className="flex h-9 w-full items-center justify-center gap-1 rounded-md bg-paper px-3 text-sm font-semibold text-brand ring-1 ring-inset ring-brand transition-colors hover:bg-brand hover:text-white sm:w-auto"
              aria-label={`Add ${product.name}, ${v.label}, to basket`}
            >
              <Icon name="plus" size={16} strokeWidth={2.25} /> Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
