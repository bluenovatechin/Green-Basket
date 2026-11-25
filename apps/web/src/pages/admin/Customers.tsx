import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../../lib/api";
import { dateTime, rupees } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import { Card, Empty, ErrorText, FullPageSpinner, inputClass } from "../../components/ui";

interface CustomerRow {
  id: string; email: string; full_name: string | null; phone: string | null; is_blocked: boolean; created_at: string;
  orders_count: number; delivered_count: number; total_spent: number; last_order_at: string | null;
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["admin", "customers", q],
    queryFn: () => rpc<CustomerRow[]>("admin_customers", { p_search: q || null, p_limit: 200 }),
  });

  async function toggleBlock(c: CustomerRow) {
    if (!confirm(c.is_blocked ? `Unblock ${c.email}?` : `Block ${c.email}? They won't be able to place orders.`)) return;
    setError("");
    try {
      await rpc("admin_set_blocked", { p_user_id: c.id, p_blocked: !c.is_blocked });
      qc.invalidateQueries({ queryKey: ["admin", "customers"] });
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Customers</h1>
        <p className="text-sm text-gray-600">Everyone who has signed up, with their orders and spend.</p>
      </div>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); }}>
        <input className={inputClass} placeholder="Search name, email or phone" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="rounded-xl bg-brand px-4 font-semibold text-white">Search</button>
      </form>
      <ErrorText>{error}</ErrorText>

      {list.isLoading ? <FullPageSpinner /> : !list.data?.length ? <Empty title="No customers found" /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="p-3">Customer</th><th className="p-3">Phone</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Spent</th><th className="p-3">Last order</th><th className="p-3" /></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.data.map((c) => (
                <tr key={c.id} className={c.is_blocked ? "bg-red-50/50" : ""}>
                  <td className="p-3">
                    <div className="font-medium">{c.full_name || "—"}{c.is_blocked && <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">Blocked</span>}</div>
                    <div className="text-xs text-gray-500">{c.email}</div>
                  </td>
                  <td className="p-3">{c.phone ? <a href={`tel:${c.phone}`} className="text-brand">{c.phone}</a> : "—"}</td>
                  <td className="p-3 text-right">{c.orders_count}<span className="block text-xs text-gray-500">{c.delivered_count} delivered</span></td>
                  <td className="p-3 text-right font-semibold">{rupees(c.total_spent)}</td>
                  <td className="p-3 text-gray-600">{c.last_order_at ? dateTime(c.last_order_at) : "Never"}</td>
                  <td className="p-3 text-right">
                    <button className={c.is_blocked ? "text-brand" : "text-red-600"} onClick={() => toggleBlock(c)}>{c.is_blocked ? "Unblock" : "Block"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
