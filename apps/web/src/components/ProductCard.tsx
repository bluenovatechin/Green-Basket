import { useState } from "react";
import type { Product } from "../lib/types";
import { rupees } from "../lib/format";
import { useCart } from "../state/cart";

export function QtyStepper({ value, onChange, max }: { value: number; onChange: (n: number) => void; max?: number }) {
  return (
    <div className="flex h-10 items-center overflow-hidden rounded-xl bg-brand text-white">
      <button className="h-full w-10 text-xl font-bold" onClick={() => onChange(value - 1)} aria-label="Remove one">−</button>
      <span className="w-8 text-center font-semibold" aria-live="polite">{value}</span>
      <button className="h-full w-10 text-xl font-bold disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={max !== undefined && value >= max} aria-label="Add one">+</button>
    </div>
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

  return (
    <article className="flex flex-col rounded-2xl border border-gray-200 bg-white p-3">
      <div className="relative mb-2 aspect-square overflow-hidden rounded-xl bg-brand-light">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-5xl" aria-hidden>🥕</div>
        )}
        {discount > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-brand-accent px-1.5 py-0.5 text-xs font-bold text-gray-900">{discount}% off</span>
        )}
        {lowStock && !outOfStock && (
          <span className="absolute bottom-2 left-2 rounded-md bg-amber-500/90 px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm">
            Only {packsAvailable} left
          </span>
        )}
      </div>
      <h3 className="font-semibold leading-tight">{product.name}</h3>
      {product.name_local && <p className="text-sm text-gray-500">{product.name_local}</p>}

      {product.product_variants.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${product.name} pack size`}>
          {product.product_variants.map((x) => (
            <button
              key={x.id}
              role="radio"
              aria-checked={x.id === v.id}
              onClick={() => setVariantId(x.id)}
              className={`rounded-lg border px-2 py-1 text-xs font-medium ${x.id === v.id ? "border-brand bg-brand-light text-brand" : "border-gray-300 text-gray-600"}`}
            >
              {x.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-gray-500">{v.label}</p>
      )}

      <div className="mt-auto flex items-end justify-between pt-3">
        <div>
          <div className="font-bold">{rupees(v.price)}</div>
          {discount > 0 && <div className="text-xs text-gray-400 line-through">{rupees(v.mrp)}</div>}
        </div>
        {outOfStock ? (
          <span className="text-sm font-medium text-gray-400">Sold out</span>
        ) : inCart > 0 ? (
          <QtyStepper value={inCart} onChange={(n) => cart.setQuantity(v.id, n)} max={Math.min(maxQty, packsAvailable)} />
        ) : (
          <button onClick={() => cart.add(product, v)} className="h-10 rounded-xl border-2 border-brand px-4 font-bold text-brand hover:bg-brand-light">
            ADD
          </button>
        )}
      </div>
    </article>
  );
}
