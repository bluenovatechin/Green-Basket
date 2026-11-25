import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { rpc } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import { friendlyError } from "../../lib/errors";
import type { Profile, Role } from "../../lib/types";
import { Button, Card, ErrorText, Field, FullPageSpinner, inputClass } from "../../components/ui";

export default function Staff() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("rider");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const staff = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").neq("role", "customer").order("role");
      if (error) throw error;
      return data as Profile[];
    },
  });

  async function setUserRole(e: string, r: Role) {
    setError(""); setMsg("");
    try {
      await rpc("admin_set_role", { p_email: e, p_role: r });
      setMsg(`${e} is now ${r}.`);
      setEmail("");
      qc.invalidateQueries({ queryKey: ["admin", "staff"] });
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  if (staff.isLoading) return <FullPageSpinner />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-bold">Staff</h1>
      <Card className="space-y-3">
        <h2 className="font-semibold">Give someone access</h2>
        <p className="text-sm text-gray-600">They must log in to the app once with their email first.</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Email"><input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Role">
            <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="rider">Rider</option><option value="packer">Packer</option><option value="admin">Admin</option>
            </select>
          </Field>
          <div className="flex items-end"><Button onClick={() => setUserRole(email, role)} disabled={!email}>Save</Button></div>
        </div>
        <ErrorText>{error}</ErrorText>
        {msg && <p className="text-sm text-brand">{msg}</p>}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Current staff</h2>
        <ul className="divide-y divide-gray-100 text-sm">
          {staff.data?.map((p) => (
            <li key={p.id} className="flex items-center justify-between py-2">
              <span>{p.full_name || p.email}<span className="block text-xs text-gray-500">{p.email}</span></span>
              <span className="flex items-center gap-3">
                <b className="capitalize">{p.role}</b>
                <button className="text-red-600" onClick={() => confirm(`Remove staff access for ${p.email}?`) && setUserRole(p.email, "customer")}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
