import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../auth/AuthProvider";
import type { Product, Variant } from "../lib/types";

// The cart lives in client storage scoped per user, with automatic guest-to-user migration
// and multi-tab synchronization.
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

const LEGACY_KEY = "gb_cart_v1";
const getStorageKey = (userId?: string | null) => (userId ? `gb_cart_u_${userId}` : "gb_cart_guest");

  function readLines(key: string): CartLine[] {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as CartLine[]) : [];
    } catch {
      return [];
    }
  }

  function writeLines(key: string, lines: CartLine[]) {
    try {
      localStorage.setItem(key, JSON.stringify(lines));
    } catch {
      /* private mode / quota exceeded */
    }
  }

  const CartContext = createContext<CartState | null>(null);

  export function CartProvider({ children }: { children: ReactNode }) {
    const { session } = useAuth();
    const userId = session?.user?.id ?? null;
    const currentKey = getStorageKey(userId);
    const prevUserIdRef = useRef<string | null>(userId);

    // Initial load with legacy migration
    const [lines, setLines] = useState<CartLine[]>(() => {
      let initial = readLines(currentKey);
      if (!initial.length) {
        const legacy = readLines(LEGACY_KEY);
        if (legacy.length) {
          initial = legacy;
          writeLines(currentKey, legacy);
          try {
            localStorage.removeItem(LEGACY_KEY);
          } catch {
            /* ignore */
          }
        }
      }
      return initial;
    });

    // Handle switching users (e.g. guest signs in or logs out)
    useEffect(() => {
        const prevUserId = prevUserIdRef.current;
        prevUserIdRef.current = userId;

        if (prevUserId !== userId) {
          const targetKey = getStorageKey(userId);
          const userLines = readLines(targetKey);

          // If guest just signed in, merge guest items into the user's cart
          if (!prevUserId && userId) {
            const guestLines = readLines("gb_cart_guest");
            if (guestLines.length > 0) {
              const merged = [...userLines];
              for (const item of guestLines) {
                const idx = merged.findIndex((m) => m.variant_id === item.variant_id);
                if (idx >= 0) {
                  // same item in both baskets: add them up, but stay within the per-item limit (default 20)
                  merged[idx] = { ...merged[idx], quantity: Math.min(merged[idx].quantity + item.quantity, 20) };
                } else {
                  merged.push(item);
                }
              }
              writeLines(targetKey, merged);
              try {
                localStorage.removeItem("gb_cart_guest");
              } catch {
                /* ignore */
              }
              setLines(merged);
              return;
            }
          }

          setLines(userLines);
        }
  }, [userId]);

  // Persist current lines
  useEffect(() => {
    writeLines(currentKey, lines);
  }, [currentKey, lines]);

  // Cross-tab synchronization
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === currentKey && e.newValue) {
        try {
          const synced = JSON.parse(e.newValue) as CartLine[];
          setLines(synced);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [currentKey]);

  const value = useMemo<CartState>(() => ({
    lines,
    count: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal: lines.reduce((s, l) => s + l.quantity * l.price, 0),
    quantityOf: (id) => lines.find((l) => l.variant_id === id)?.quantity ?? 0,
    add: (p, v) =>
      setLines((ls) => {
        const found = ls.find((l) => l.variant_id === v.id);
        if (found) return ls.map((l) => (l.variant_id === v.id ? { ...l, quantity: l.quantity + 1 } : l));
        return [
          ...ls,
          {
            variant_id: v.id,
            product_id: p.id,
            quantity: 1,
            name: p.name,
            label: v.label,
            price: Number(v.price),
            image_url: p.image_url,
          },
        ];
      }),
    setQuantity: (id, q) =>
    setLines((ls) =>
  q <= 0 ? ls.filter((l) => l.variant_id !== id) : ls.map((l) => (l.variant_id === id ? { ...l, quantity: q } : l)),
      ),
  updatePrices: (vs) =>
    setLines((ls) =>
      ls.map((l) => {
        const v = vs.find((x) => x.id === l.variant_id);
        return v && Number(v.price) !== l.price ? { ...l, price: Number(v.price) } : l;
      }),
    ),
    clear: () => setLines([]),
  }), [lines]);

return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart outside CartProvider");
  return ctx;
}
