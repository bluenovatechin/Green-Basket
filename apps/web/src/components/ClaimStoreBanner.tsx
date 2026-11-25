import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthProvider";
import { rpc } from "../lib/api";
import { friendlyError } from "../lib/errors";
import { Button } from "./ui";

/** Shown only on a brand-new installation that has no admin yet: the logged-in person can claim it. */
export default function ClaimStoreBanner() {
  const { session, profile, refreshProfile } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
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
      navigate("/admin");
    } catch (e) {
      setError(friendlyError(e));
      qc.invalidateQueries({ queryKey: ["store-has-admin"] });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-2xl border-2 border-dashed border-brand bg-brand-light p-4">
      <div className="font-bold text-brand">🏪 This store has no owner yet</div>
      <p className="mt-1 text-sm text-gray-700">
        You're the first person here. Claim the store to become its admin: add products, set prices and delivery slots, and manage orders.
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      <Button className="mt-3" loading={busy} onClick={claim}>Claim this store</Button>
    </div>
  );
}
