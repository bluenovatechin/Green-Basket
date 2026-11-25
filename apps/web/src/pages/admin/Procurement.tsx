import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "../../lib/api";
import { dayLabel, qty, todayIST } from "../../lib/format";
import type { StockUnit } from "../../lib/types";
import { Button, Empty, FullPageSpinner, inputClass } from "../../components/ui";

interface Line { product_id: string; product_name: string; name_local: string | null; unit: StockUnit; total_qty: number; order_count: number; stock_left: number }

// "What do we need for tomorrow?" Totals every open order for a delivery date.
export default function Procurement() {
  const [date, setDate] = useState(todayIST(1));
  const report = useQuery({
    queryKey: ["admin", "procurement", date],
    queryFn: () => rpc<Line[]>("procurement_for_date", { p_date: date }),
  });

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold">Buying list</h1>
        <div className="flex gap-2">
          <input type="date" className={`${inputClass} w-auto`} value={date} onChange={(e) => setDate(e.target.value)} />
          <Button variant="secondary" onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      <p className="text-sm text-ink-soft">
        Total of all placed, confirmed and packed orders for <b>{dayLabel(date)}</b> ({date}). "Still available to sell" is the stock not yet ordered.
      </p>

      {report.isLoading ? <FullPageSpinner /> : !report.data?.length ? <Empty title="No orders for this date yet" /> : (
        <div className="print-area overflow-x-auto rounded-2xl bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface text-ink-soft">
              <tr><th className="p-3">Product</th><th className="p-3 text-right">Needed</th><th className="p-3 text-right">Orders</th><th className="p-3 text-right">Still available to sell</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {report.data.map((l) => (
                <tr key={l.product_id}>
                  <td className="p-3 font-medium">{l.product_name}{l.name_local && <span className="ml-2 text-ink-muted">{l.name_local}</span>}</td>
                  <td className="p-3 text-right text-base font-bold">{qty(l.unit, l.total_qty)}</td>
                  <td className="p-3 text-right">{l.order_count}</td>
                  <td className="p-3 text-right text-ink-soft">{qty(l.unit, l.stock_left)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
