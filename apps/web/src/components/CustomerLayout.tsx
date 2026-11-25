import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCart } from "../state/cart";
import { rupees } from "../lib/format";
import { asset } from "../lib/base";
import Icon, { type IconName } from "./Icon";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label="Green Basket home">
      <img src={asset("favicon.svg")} alt="" className="h-9 w-9 rounded-xl" />
      <span className="leading-none">
        <span className="block text-[17px] font-extrabold tracking-tight text-ink">Green Basket</span>
        <span className="mt-0.5 hidden text-[11px] font-medium text-ink-muted sm:block">Eat Fresh. Live Better.</span>
      </span>
    </Link>
  );
}

export function AccountMenu() {
  const { session, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (!session) {
    return (
      <Link to="/login" className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-white">
        Log in
      </Link>
    );
  }
  const name = profile?.full_name || profile?.email?.split("@")[0] || "Account";
  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-surface";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-full pl-1 pr-3 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-white"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{name.charAt(0).toUpperCase()}</span>
        <span className="hidden max-w-[9rem] truncate md:inline">{name}</span>
        <Icon name="chevronDown" size={16} className="text-ink-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-3xl bg-white p-2 shadow-lift ring-1 ring-line">
          <div className="px-3 pb-3 pt-2">
            <div className="truncate text-sm font-bold">{name}</div>
            <div className="truncate text-xs text-ink-muted">{profile?.email}</div>
            {profile && profile.role !== "customer" && (
              <span className="mt-2 inline-block rounded-full bg-brand-light px-2 py-0.5 text-[11px] font-semibold capitalize text-brand">{profile.role}</span>
            )}
          </div>
          <div className="border-t border-line pt-1.5">
            {(profile?.role === "admin" || profile?.role === "packer") && <MenuLink to="/admin" icon="grid" label="Admin panel" cls={item} />}
            {(profile?.role === "rider" || profile?.role === "admin") && <MenuLink to="/rider" icon="bike" label="Rider screen" cls={item} />}
            <MenuLink to="/" icon="store" label="Shop" cls={item} />
            <MenuLink to="/orders" icon="package" label="My orders" cls={item} />
            <MenuLink to="/account" icon="user" label="Account & addresses" cls={item} />
          </div>
          <div className="mt-1 border-t border-line pt-1.5">
            <button role="menuitem" className={`${item} text-red-600 hover:bg-red-50`} onClick={async () => { await signOut(); navigate("/"); }}>
              <Icon name="logout" size={18} /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuLink({ to, icon, label, cls }: { to: string; icon: IconName; label: string; cls: string }) {
  return <Link role="menuitem" to={to} className={cls}><Icon name={icon} size={18} />{label}</Link>;
}

export default function CustomerLayout() {
  const { count, subtotal } = useCart();
  const { session } = useAuth();
  const location = useLocation();
  const showCartBar = count > 0 && !["/cart", "/checkout"].includes(location.pathname) && !location.pathname.startsWith("/login");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const top = ({ isActive }: { isActive: boolean }) =>
    `inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition ${isActive ? "bg-white text-ink shadow-soft" : "text-ink-soft hover:text-ink"}`;

  return (
    <div className="min-h-screen pb-32 sm:pb-12">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo />
          <nav className="hidden items-center gap-1 rounded-full bg-line/40 p-1 sm:flex">
            <NavLink to="/" end className={top}>Shop</NavLink>
            <NavLink to="/orders" className={top}>Orders</NavLink>
            <NavLink to="/account" className={top}>Account</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/cart" className="relative hidden h-10 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-white sm:inline-flex" aria-label={`Basket, ${count} items`}>
              <Icon name="bag" size={18} />
              {count > 0 ? <span className="tabular">{rupees(subtotal)}</span> : "Basket"}
              {count > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-accent px-1 text-[10px] font-bold text-ink">{count}</span>}
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
        <Outlet />
      </main>

      {showCartBar && (
        <Link
          to="/cart"
          className="fixed inset-x-3 bottom-[76px] z-40 flex items-center justify-between rounded-full bg-ink py-2 pl-2 pr-5 text-white shadow-lift sm:hidden"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10"><Icon name="bag" size={18} /></span>
            <span className="leading-tight">
              <span className="block text-[11px] text-white/70">{count} item{count === 1 ? "" : "s"}</span>
              <span className="tabular block font-bold">{rupees(subtotal)}</span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold">View basket <Icon name="arrowRight" size={16} /></span>
        </Link>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="grid grid-cols-4">
          <Tab to="/" end icon="home" label="Shop" />
          <Tab to="/cart" icon="bag" label="Basket" badge={count} />
          <Tab to="/orders" icon="package" label="Orders" />
          <Tab to={session ? "/account" : "/login"} icon="user" label={session ? "Account" : "Log in"} />
        </div>
      </nav>
    </div>
  );
}

function Tab({ to, icon, label, badge, end }: { to: string; icon: IconName; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold ${isActive ? "text-brand" : "text-ink-muted"}`}>
      <span className="relative">
        <Icon name={icon} size={22} />
        {!!badge && <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{badge}</span>}
      </span>
      {label}
    </NavLink>
  );
}
