// Data access. Reads go straight to the database (protected by row-level security);
// anything that changes orders, stock or money calls a database function (rpc).
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Address, Category, Order, Product, Settings, Slot } from "./types";

// We don't generate database types, so query results are cast to our hand-written types in lib/types.ts.
const must = <T,>(r: { data: unknown; error: unknown }): T => {
  if (r.error) throw r.error;
  return r.data as T;
};

export const PRODUCT_FIELDS =
  "id, category_id, name, name_local, description, image_url, unit, stock_qty, low_stock_threshold, is_active, sort_order, " +
  "product_variants(id, product_id, label, pack_qty, price, mrp, is_active, sort_order)";

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: async () => must<Settings>(await supabase.from("settings").select("*").single()),
    staleTime: 5 * 60_000,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async () => must<Category[]>(await supabase.from("categories").select("*").eq("is_active", true).order("sort_order")),
    staleTime: 10 * 60_000,
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products", "store"],
    queryFn: async () => {
      const rows = must<Product[]>(
        await supabase.from("products").select(PRODUCT_FIELDS).eq("is_active", true).order("sort_order").order("name"),
      );
      return rows.map((p) => ({
        ...p,
        product_variants: p.product_variants.filter((v) => v.is_active).sort((a, b) => a.sort_order - b.sort_order),
      })).filter((p) => p.product_variants.length > 0);
    },
    staleTime: 60_000,
  });
}

export function useOpenSlots() {
  return useQuery({
    queryKey: ["slots", "open"],
    queryFn: async () =>
      must<Slot[]>(
        await supabase.from("delivery_slots").select("*").eq("is_active", true)
          .gt("cutoff_at", new Date().toISOString()).order("slot_date").order("start_time").limit(30),
      ),
    staleTime: 30_000,
  });
}

export function useAddresses(enabled = true) {
  return useQuery({
    queryKey: ["addresses"],
    enabled,
    queryFn: async () =>
      must<Address[]>(await supabase.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at")),
  });
}

export function useServicePincodes() {
  return useQuery({
    queryKey: ["pincodes"],
    queryFn: async () =>
      must<{ pincode: string; area_name: string; is_active: boolean }[]>(await supabase.from("service_pincodes").select("*").order("pincode")),
    staleTime: 10 * 60_000,
  });
}

export const ORDER_DETAIL_FIELDS =
  "*, delivery_slots(slot_date, start_time, end_time), order_items(*), order_events(*), refunds(id, amount, reason, status, created_at)";

/** Re-fetches the given queries the moment matching orders change (Supabase Realtime; RLS applies). */
export function useLiveOrders(filter: string | null, queryKeys: unknown[][]) {
  const qc = useQueryClient();
  const keyStr = JSON.stringify(queryKeys);
  useEffect(() => {
    if (filter === null) return;
    const channel = supabase
      .channel(`orders-live-${filter || "all"}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(filter ? { filter } : {}) }, () => {
        for (const k of JSON.parse(keyStr) as unknown[][]) qc.invalidateQueries({ queryKey: k });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [filter, keyStr, qc]);
}

export function useOrder(id: string | undefined, refetchMs?: number | false) {
  useLiveOrders(id ? `id=eq.${id}` : null, [["order", id]]);
  return useQuery({
    queryKey: ["order", id],
    enabled: Boolean(id),
    refetchInterval: refetchMs,
    queryFn: async () => {
      const o = must<Order>(await supabase.from("orders").select(ORDER_DETAIL_FIELDS).eq("id", id!).single());
      o.order_events?.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return o;
    },
  });
}

export function useMyOrders(enabled = true) {
  useLiveOrders(enabled ? "" : null, [["orders", "mine"]]);
  return useQuery({
    queryKey: ["orders", "mine"],
    enabled,
    queryFn: async () => {
      const { data: s } = await supabase.auth.getUser();
      return must<Order[]>(
        await supabase.from("orders")
          .select("id, order_number, status, payment_method, payment_status, total, created_at, delivery_slots(slot_date, start_time, end_time)")
          .eq("user_id", s.user?.id ?? "").order("created_at", { ascending: false }).limit(50),
      );
    },
  });
}

/** rpc helper that throws the database error (with its CODE message) */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
