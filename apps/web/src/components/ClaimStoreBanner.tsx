import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { rpc } from "../lib/api";
import { friendlyError } from "../lib/errors";
import { Button } from "./ui";
import Icon from "./Icon";
import { ADMIN_PATH, BASE } from "../lib/base";

/** Shown only on a brand-new installation that has no admin yet: the logged-in person can claim it. */
export default function ClaimStoreBanner() {
  const { session, profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const hasAdmin = useQuery({
    queryKey: ["store-has-admin"],
    enabled: Boolean(session),
    queryFn: () => rpc<boolean>("store_has_admin", {}),
    staleTime: 60_000,
  });

  if (!session || profile?.role !== "customer" || hasAdmin.data !== false) return null;

  async function claim() {
    if (!confirm("Make this account the owner (admin) of this store? Only the first person can do this.")) return;
    setBusy(true);
    setError("");
    try {
      await rpc("claim_store_ownership", {});
      await refreshProfile();
      await qc.invalidateQueries({ queryKey: ["store-has-admin"] });
      // the admin console has its own login: open it fresh (it asks for email + password)
      window.location.assign(BASE + ADMIN_PATH.slice(1));
    } catch (e) {
      setError(friendlyError(e));
      qc.invalidateQueries({ queryKey: ["store-has-admin"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border-2 border-dashed border-brand/40 bg-brand-50 p-5">
      <div className="flex items-center gap-2 font-bold text-brand"><Icon name="store" size={18} /> This store has no owner yet</div>
      <p className="mt-1 text-sm text-ink-soft">
        You're the first person here. Claim the store to become its admin: add products, set prices and delivery slots, and manage orders.
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <Button className="mt-3" loading={busy} onClick={claim}>Claim this store</Button>
    </div>
  );
}
