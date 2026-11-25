import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Product, Variant } from "../lib/types";

// The cart lives on the phone. Prices here are only for display; the server recalculates
// every price when the order is placed, so a changed price can never be charged wrongly.
export interface CartLine {
  variant_id: string;
  product_id: string;
  quantity: number;
  name: string;
  label: string;
  price: number;
  image_url: string | null;
}

interface CartState {
  lines: CartLine[];
  count: number;
  subtotal: number;
  quantityOf: (variantId: string) => number;
  add: (p: Product, v: Variant) => void;
  setQuantity: (variantId: string, q: number) => void;
  updatePrices: (variants: { id: string; price: number }[]) => void;
  clear: () => void;
}

const KEY = "gb_cart_v1";
const CartContext = createContext<CartState | null>(null);

function load(): CartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(lines));
    } catch {
      /* private mode: cart just isn't remembered */
    }
  }, [lines]);

  const value = useMemo<CartState>(() => ({
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + l.quantity * l.price, 0),
    quantityOf: (id) => lines.find((l) => l.variant_id === id)?.quantity ?? 0,
    add: (p, v) =>
      setLines((ls) => {
        const found = ls.find((l) => l.variant_id === v.id);
        if (found) return ls.map((l) => (l.variant_id === v.id ? { ...l, quantity: l.quantity + 1 } : l));
        return [...ls, {
          variant_id: v.id, product_id: p.id, quantity: 1, name: p.name, label: v.label,
          price: Number(v.price), image_url: p.image_url,
        }];
      }),
    setQuantity: (id, q) =>
      setLines((ls) => (q <= 0 ? ls.filter((l) => l.variant_id !== id) : ls.map((l) => (l.variant_id === id ? { ...l, quantity: q } : l)))),
    updatePrices: (vs) =>
      setLines((ls) => ls.map((l) => {
        const v = vs.find((x) => x.id === l.variant_id);
        return v && Number(v.price) !== l.price ? { ...l, price: Number(v.price) } : l;
      })),
    clear: () => setLines([]),
  }), [lines]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart outside CartProvider");
  return ctx;
}
