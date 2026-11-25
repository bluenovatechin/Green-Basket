import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { dateTime, dayLabel, time12, todayIST } from "../../lib/format";
import { friendlyError } from "../../lib/errors";
import type { Slot } from "../../lib/types";
import { Button, Card, ErrorText, FullPageSpinner, inputClass } from "../../components/ui";

interface Template { id: number; weekday: number; start_time: string; end_time: string; capacity: number; cutoff_minutes: number; is_active: boolean }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Slots() {
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const templates = useQuery({
    queryKey: ["admin", "slot-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("slot_templates").select("*").order("weekday").order("start_time");
      if (error) throw error;
      return data as Template[];
    },
  });
  const upcoming = useQuery({
    queryKey: ["admin", "upcoming-slots"],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_slots").select("*").gte("slot_date", todayIST()).order("slot_date").order("start_time").limit(60);
      if (error) throw error;
      return data as Slot[];
    },
  });

  const [nt, setNt] = useState({ weekdays: [0, 1, 2, 3, 4, 5, 6], start: "07:00", end: "09:00", capacity: "40", cutoffHours: "10" });

  async function act(fn: () => PromiseLike<{ error: unknown }> | Promise<unknown>, ok?: string) {
    setError(""); setMsg("");
    try {
      const r = (await fn()) as { error?: unknown } | undefined;
      if (r && r.error) throw r.error;
      if (ok) setMsg(ok);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (e) {
      setError(friendlyError(e));
    }
  }

  if (templates.isLoading || upcoming.isLoading) return <FullPageSpinner />;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Delivery slots</h1>
      <p className="text-sm text-gray-600">
        Weekly templates create the actual slots every night for the next 7 days. Change capacity or close a single day's slot below.
      </p>
      <ErrorText>{error}</ErrorText>
      {msg && <p className="text-sm text-brand">{msg}</p>}

      <Card className="space-y-3">
        <h2 className="font-semibold">Weekly templates</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500"><tr><th className="py-1">Day</th><th>Time</th><th>Capacity</th><th>Order by</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {templates.data!.map((t) => (
                <tr key={t.id} className={t.is_active ? "" : "opacity-50"}>
                  <td className="py-2">{DAYS[t.weekday]}</td>
                  <td>{time12(t.start_time)}–{time12(t.end_time)}</td>
                  <td>{t.capacity}</td>
                  <td>{t.cutoff_minutes / 60} h before</td>
                  <td className="space-x-3 text-right">
                    <button className="text-brand" onClick={() => act(() => supabase.from("slot_templates").update({ is_active: !t.is_active }).eq("id", t.id))}>{t.is_active ? "Pause" : "Resume"}</button>
                    <button className="text-red-600" onClick={() => confirm("Delete this template?") && act(() => supabase.from("slot_templates").delete().eq("id", t.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 rounded-xl bg-gray-50 p-3">
          <div className="text-sm font-medium">Add template</div>
          <div className="flex flex-wrap gap-1">
            {DAYS.map((d, i) => (
              <button key={d} onClick={() => setNt({ ...nt, weekdays: nt.weekdays.includes(i) ? nt.weekdays.filter((x) => x !== i) : [...nt.weekdays, i] })}
                className={`rounded-lg border px-2 py-1 text-xs ${nt.weekdays.includes(i) ? "border-brand bg-brand-light text-brand" : "border-gray-300"}`}>{d}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <label className="text-xs">Start<input type="time" className={inputClass} value={nt.start} onChange={(e) => setNt({ ...nt, start: e.target.value })} /></label>
            <label className="text-xs">End<input type="time" className={inputClass} value={nt.end} onChange={(e) => setNt({ ...nt, end: e.target.value })} /></label>
            <label className="text-xs">Orders per slot<input className={inputClass} inputMode="numeric" value={nt.capacity} onChange={(e) => setNt({ ...nt, capacity: e.target.value })} /></label>
            <label className="text-xs">Close ordering (hours before)<input className={inputClass} inputMode="decimal" value={nt.cutoffHours} onChange={(e) => setNt({ ...nt, cutoffHours: e.target.value })} /></label>
          </div>
          <Button onClick={() => act(() => supabase.from("slot_templates").upsert(
            nt.weekdays.map((w) => ({ weekday: w, start_time: nt.start, end_time: nt.end, capacity: Number(nt.capacity), cutoff_minutes: Math.round(Number(nt.cutoffHours) * 60), is_active: true })),
            { onConflict: "weekday,start_time" }), "Template saved. Click 'Create slots now' to apply.")}>
            Save template
          </Button>
        </div>
        <Button variant="secondary" onClick={() => act(() => rpc("generate_slots", { p_days: 7 }), "Slots created for the next 7 days.")}>Create slots now</Button>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Upcoming slots</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500"><tr><th className="py-1">Date</th><th>Time</th><th>Booked</th><th>Capacity</th><th>Ordering closes</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {upcoming.data!.map((s) => (
                <tr key={s.id} className={s.is_active ? "" : "opacity-50"}>
                  <td className="py-2">{dayLabel(s.slot_date)}</td>
                  <td>{time12(s.start_time)}–{time12(s.end_time)}</td>
                  <td>{s.booked}</td>
                  <td>
                    <input className="w-16 rounded border border-gray-300 px-1 py-0.5" defaultValue={s.capacity} inputMode="numeric"
                      onBlur={(e) => Number(e.target.value) !== s.capacity && act(() => supabase.from("delivery_slots").update({ capacity: Number(e.target.value) }).eq("id", s.id), "Capacity updated.")} />
                  </td>
                  <td>{dateTime(s.cutoff_at)}</td>
                  <td className="text-right">
                    <button className="text-brand" onClick={() => act(() => supabase.from("delivery_slots").update({ is_active: !s.is_active }).eq("id", s.id))}>{s.is_active ? "Close" : "Open"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
