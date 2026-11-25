import { useState } from "react";
import type { Product } from "../lib/types";
import { rupees } from "../lib/format";
import { productImage } from "../lib/images";
import { useCart } from "../state/cart";
import Icon from "./Icon";

export function QtyStepper({ value, onChange, max, size = "md" }: { value: number; onChange: (n: number) => void; max?: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? "h-9" : "h-10";
  return (
    <div className={`flex ${h} items-center rounded-full bg-brand text-white shadow-sm`}>
      <button className={`flex ${h} w-9 items-center justify-center rounded-full hover:bg-white/10`} onClick={() => onChange(value - 1)} aria-label="Remove one">
        <Icon name="minus" size={16} strokeWidth={2.25} />
      </button>
      <span className="tabular w-6 text-center text-sm font-bold" aria-live="polite">{value}</span>
      <button className={`flex ${h} w-9 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40`} onClick={() => onChange(value + 1)} disabled={max !== undefined && value >= max} aria-label="Add one">
        <Icon name="plus" size={16} strokeWidth={2.25} />
      </button>
    </div>
  );
}

export function ProductImage({ name, image_url, className = "" }: { name: string; image_url?: string | null; className?: string }) {
  const src = productImage({ name, image_url });
  return src ? (
    <img src={src} alt={name} loading="lazy" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <div className={`flex h-full w-full items-center justify-center text-brand/40 ${className}`}><Icon name="leaf" size={36} /></div>
  );
}

export default function ProductCard({ product, maxQty }: { product: Product; maxQty: number }) {
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
  const image = productImage(product);

  return (
    <article className={`group flex flex-col rounded-3xl bg-white p-2.5 shadow-soft ring-1 ring-line/60 transition hover:shadow-lift ${outOfStock ? "opacity-70" : ""}`}>
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-surface">
        <ProductImage name={product.name} image_url={product.image_url} className="transition duration-500 group-hover:scale-105" />
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-brand shadow-sm">{discount}% off</span>
        )}
        {lowStock && (
          <span className="absolute bottom-2 left-2 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">Only {packsAvailable} left</span>
        )}
        {outOfStock && (
          <span className="absolute inset-x-2 bottom-2 rounded-full bg-white/95 py-1 text-center text-xs font-semibold text-ink-muted">Sold out</span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-1.5 pb-1 pt-3">
        <h3 className="text-[15px] font-semibold leading-snug">{product.name}</h3>
        {product.name_local && <p className="text-xs text-ink-muted">{product.name_local}</p>}

        {product.product_variants.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label={`${product.name} pack size`}>
            {product.product_variants.map((x) => (
              <button
                key={x.id}
                role="radio"
                aria-checked={x.id === v.id}
                onClick={() => setVariantId(x.id)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${x.id === v.id ? "bg-ink text-white" : "bg-surface text-ink-soft hover:bg-line"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs font-medium text-ink-muted">{v.label}</p>
        )}

        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="leading-tight">
            <div className="tabular text-base font-bold">{rupees(v.price)}</div>
            {discount > 0 && <div className="tabular text-[11px] text-ink-muted line-through">{rupees(v.mrp)}</div>}
          </div>
          {outOfStock ? null : inCart > 0 ? (
            <QtyStepper size="sm" value={inCart} onChange={(n) => cart.setQuantity(v.id, n)} max={Math.min(maxQty, packsAvailable)} />
          ) : (
            <button
              onClick={() => cart.add({ ...product, image_url: image }, v)}
              className="flex h-9 items-center gap-1 rounded-full bg-brand-light px-3.5 text-sm font-bold text-brand transition hover:bg-brand hover:text-white"
              aria-label={`Add ${product.name} ${v.label}`}
            >
              <Icon name="plus" size={16} strokeWidth={2.25} /> Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
