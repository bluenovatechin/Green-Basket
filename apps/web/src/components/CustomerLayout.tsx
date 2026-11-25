import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCart } from "../state/cart";
import { rupees } from "../lib/format";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2" aria-label="Green Basket home">
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <span className="leading-tight">
        <span className="block text-lg font-extrabold tracking-tight text-brand">Green Basket</span>
        <span className="hidden text-[11px] font-medium text-gray-500 sm:block">Eat Fresh. Live Better.</span>
      </span>
    </Link>
  );
}

export function AccountMenu({ dark = false }: { dark?: boolean }) {
  const { session, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!session) {
    return (
      <Link to="/login" className={`rounded-xl px-3 py-2 text-sm font-semibold ${dark ? "text-white hover:bg-white/10" : "text-brand hover:bg-brand-light"}`}>
        Log in
      </Link>
    );
  }
  const name = profile?.full_name || profile?.email?.split("@")[0] || "Account";
  const initial = name.charAt(0).toUpperCase();
  const item = "block w-full rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm font-medium ${dark ? "text-white hover:bg-white/10" : "text-gray-700 hover:bg-gray-100"}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={`flex h-8 w-8 items-center justify-center rounded-full font-bold ${dark ? "bg-white text-brand" : "bg-brand text-white"}`}>{initial}</span>
        <span className="hidden max-w-[10rem] truncate md:inline">{name}</span>
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl">
          <div className="border-b border-gray-100 px-3 pb-2 pt-1">
            <div className="truncate text-sm font-semibold text-gray-900">{name}</div>
            <div className="truncate text-xs text-gray-500">{profile?.email}</div>
            {profile && profile.role !== "customer" && (
              <span className="mt-1 inline-block rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-semibold capitalize text-brand">{profile.role}</span>
            )}
          </div>
          <div className="py-1">
            {(profile?.role === "admin" || profile?.role === "packer") && <Link role="menuitem" to="/admin" className={item}>🛠️ Admin panel</Link>}
            {(profile?.role === "rider" || profile?.role === "admin") && <Link role="menuitem" to="/rider" className={item}>🛵 Rider screen</Link>}
            <Link role="menuitem" to="/" className={item}>🥬 Shop</Link>
            <Link role="menuitem" to="/orders" className={item}>📦 My orders</Link>
            <Link role="menuitem" to="/account" className={item}>👤 My account & addresses</Link>
          </div>
          <div className="border-t border-gray-100 pt-1">
            <button role="menuitem" className={`${item} text-red-600`} onClick={async () => { await signOut(); navigate("/"); }}>Log out</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerLayout() {
  const { count, subtotal } = useCart();
  const { session } = useAuth();
  const location = useLocation();
  const showCartBar = count > 0 && !["/cart", "/checkout"].includes(location.pathname) && !location.pathname.startsWith("/login");

  useEffect(() => window.scrollTo(0, 0), [location.pathname]);

  const tab = ({ isActive }: { isActive: boolean }) =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? "text-brand" : "text-gray-500"}`;
  const top = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? "bg-brand-light text-brand" : "text-gray-700 hover:bg-gray-100"}`;

  return (
    <div className="min-h-screen pb-28 sm:pb-10">
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5">
          <Logo />
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={(s) => `hidden sm:block ${top(s)}`}>Shop</NavLink>
            {session && <NavLink to="/orders" className={(s) => `hidden sm:block ${top(s)}`}>My orders</NavLink>}
            <Link to="/cart" className="relative ml-1 hidden items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white sm:flex" aria-label={`Basket, ${count} items`}>
              🧺 {count > 0 ? <>{count} · {rupees(subtotal)}</> : "Basket"}
            </Link>
            <AccountMenu />
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4">
        <Outlet />
      </main>

      {showCartBar && (
        <Link
          to="/cart"
          className="fixed inset-x-3 bottom-[68px] z-30 flex items-center justify-between rounded-2xl bg-brand px-4 py-3 text-white shadow-lg sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-80"
        >
          <span>
            <span className="block text-xs text-white/80">{count} item{count === 1 ? "" : "s"}</span>
            <span className="font-bold">{rupees(subtotal)}</span>
          </span>
          <span className="font-semibold">View basket →</span>
        </Link>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden">
        <NavLink to="/" end className={tab}><span aria-hidden className="text-lg">🥬</span>Shop</NavLink>
        <NavLink to="/cart" className={tab}>
          <span aria-hidden className="relative text-lg">🧺{count > 0 && <span className="absolute -right-2.5 -top-1 rounded-full bg-brand-accent px-1.5 text-[10px] font-bold text-gray-900">{count}</span>}</span>Basket
        </NavLink>
        <NavLink to="/orders" className={tab}><span aria-hidden className="text-lg">📦</span>Orders</NavLink>
        <NavLink to={session ? "/account" : "/login"} className={tab}><span aria-hidden className="text-lg">👤</span>{session ? "Account" : "Log in"}</NavLink>
      </nav>
    </div>
  );
}
