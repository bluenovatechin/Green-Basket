import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { useCart } from "../state/cart";
import { useCategories, useSettings } from "../lib/api";
import { rupees } from "../lib/format";
import { asset, ADMIN_PATH, BASE } from "../lib/base";
import { BUSINESS } from "../lib/site";
import { openCookieSettings, trackPageView } from "../lib/consent";
import CookieBanner from "./CookieBanner";
import Icon, { type IconName } from "./Icon";
import { FullPageSpinner } from "./ui";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5" aria-label={`${BUSINESS.name} home`}>
      <img src={asset("favicon.svg")} alt="" width={36} height={36} className="h-9 w-9 rounded-md" />
      <span className="leading-none">
        <span className="display block text-[19px] text-ink">{BUSINESS.name}</span>
        <span className="mt-1 hidden text-[11px] font-medium text-ink-muted sm:block">{BUSINESS.tagline}</span>
      </span>
    </Link>
  );
}

/** area="shop": no staff links (the admin panel is never advertised in the shop). area="admin": full menu. */
export function AccountMenu({ area = "shop" }: { area?: "shop" | "admin" }) {
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
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  if (!session) {
    return (
      <Link to="/login" className="inline-flex h-10 items-center rounded-md px-3.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-paper hover:ring-ink/30">
        Log in
      </Link>
    );
  }
  const name = profile?.full_name || profile?.email?.split("@")[0] || "Account";
  const item = "flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-surface hover:text-ink";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 items-center gap-2 rounded-md pl-1 pr-2.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-paper hover:ring-ink/30"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${name}`}
      >
        <span className="flex h-8 w-8 items-center justify-center rounded bg-brand text-xs font-bold text-white">{name.charAt(0).toUpperCase()}</span>
        <span className="hidden max-w-[9rem] truncate md:inline">{name}</span>
        <Icon name="chevronDown" size={16} className="text-ink-muted" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-64 rounded-lg bg-paper p-1.5 shadow-lift ring-1 ring-line">
          <div className="px-3 pb-3 pt-2">
            <div className="truncate text-sm font-semibold">{name}</div>
            <div className="truncate text-xs text-ink-muted">{profile?.email}</div>
            {area === "admin" && profile && profile.role !== "customer" && (
              <span className="mt-2 inline-block rounded bg-brand-light px-2 py-0.5 text-[11px] font-semibold capitalize text-brand">{profile.role}</span>
            )}
          </div>
          <div className="border-t border-line pt-1.5">
            {area === "admin" ? (
              <>
                <MenuLink to={`${ADMIN_PATH}`} icon="grid" label="Dashboard" cls={item} />
                {/* the shop has its own separate login, so it opens in a new tab */}
                <a role="menuitem" href={BASE} target="_blank" rel="noreferrer" className={item}><Icon name="store" size={18} />Open store in new tab</a>
                {profile?.role === "admin" && <a role="menuitem" href={`${BASE}rider`} target="_blank" rel="noreferrer" className={item}><Icon name="bike" size={18} />Rider screen (new tab)</a>}
              </>
            ) : (
              <>
                {profile?.role === "rider" && <MenuLink to="/rider" icon="bike" label="Rider screen" cls={item} />}
                <MenuLink to="/" icon="store" label="Shop" cls={item} />
                <MenuLink to="/orders" icon="package" label="My orders" cls={item} />
                <MenuLink to="/account" icon="user" label="Account & addresses" cls={item} />
              </>
            )}
          </div>
          <div className="mt-1 border-t border-line pt-1.5">
            <button role="menuitem" className={`${item} text-red-700 hover:bg-red-50 hover:text-red-700`} onClick={async () => { await signOut(); navigate(area === "admin" ? `${ADMIN_PATH}/login` : "/"); }}>
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
  const { session, profile } = useAuth();
  const isRider = profile?.role === "rider";
  const location = useLocation();
  const showCartBar = count > 0 && !["/cart", "/checkout"].includes(location.pathname) && !location.pathname.startsWith("/login");
  // Checkout is a focused flow with its own fixed "Place order" bar, so the tab bar steps aside there
  const showTabs = location.pathname !== "/checkout";
  // Space at the bottom of every page so fixed bars (tabs: 64px, basket bar: ~56px) never cover content
  const bottomSpace = !showTabs ? "pb-28" : showCartBar ? "pb-[calc(9rem+env(safe-area-inset-bottom))]" : "pb-[calc(4rem+env(safe-area-inset-bottom))]";

  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
    else document.getElementById(location.hash.slice(1))?.scrollIntoView();
    // let the page set its title first, then count the view (only with analytics consent)
    const t = setTimeout(() => trackPageView(location.pathname), 50);
    return () => clearTimeout(t);
  }, [location.pathname, location.hash]);

  const top = ({ isActive }: { isActive: boolean }) =>
    `relative inline-flex h-16 items-center px-1 text-sm font-semibold transition-colors ${isActive ? "text-ink after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-brand" : "text-ink-muted hover:text-ink"}`;

  return (
    <div className={`flex min-h-screen flex-col ${bottomSpace} sm:pb-0`}>
      <a href="#main" className="sr-only z-[80] rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-page items-center justify-between gap-3 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-7 sm:flex">
            {isRider && <NavLink to="/rider" className={top}>Deliveries</NavLink>}
            <NavLink to="/" end className={top}>Shop</NavLink>
            <NavLink to="/orders" className={top}>Orders</NavLink>
            <NavLink to="/account" className={top}>Account</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/cart" className="relative hidden h-10 items-center gap-2 rounded-md bg-ink px-3.5 text-sm font-semibold text-white hover:bg-black sm:inline-flex" aria-label={`Basket, ${count} item${count === 1 ? "" : "s"}`}>
              <Icon name="bag" size={18} />
              {count > 0 ? <span className="tabular">{rupees(subtotal)}</span> : "Basket"}
              {count > 0 && <span className="tabular -mr-1 ml-0.5 flex h-5 min-w-5 items-center justify-center rounded bg-brand-accent px-1 text-[11px] font-bold text-white">{count}</span>}
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="mx-auto min-h-[calc(100svh-4rem)] w-full max-w-page flex-1 px-4 py-5 outline-none sm:px-6 sm:py-8">
        <Suspense fallback={<FullPageSpinner />}>
          <Outlet />
        </Suspense>
      </main>

      <Footer />

      {showCartBar && (
        <Link
          to="/cart"
          className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-lg bg-ink py-2 pl-2 pr-4 text-white shadow-lift sm:hidden"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-md bg-white/10"><Icon name="bag" size={18} /></span>
            <span className="leading-tight">
              <span className="block text-[11px] text-white/75">{count} item{count === 1 ? "" : "s"}</span>
              <span className="tabular block font-bold">{rupees(subtotal)}</span>
            </span>
          </span>
          <span className="flex items-center gap-1 text-sm font-semibold">View basket <Icon name="arrowRight" size={16} /></span>
        </Link>
      )}

      {showTabs && (
        <nav aria-label="Quick links" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
          <div className="grid h-16 grid-cols-4">
            {/* riders get a one-tap way back to their deliveries */}
            {isRider ? <Tab to="/rider" icon="bike" label="Deliveries" /> : null}
            <Tab to="/" end icon="home" label="Shop" />
            {!isRider && <Tab to="/cart" icon="bag" label="Basket" badge={count} />}
            <Tab to="/orders" icon="package" label="Orders" />
            <Tab to={session ? "/account" : "/login"} icon="user" label={session ? "Account" : "Log in"} />
          </div>
        </nav>
      )}

      <CookieBanner />
    </div>
  );
}

function Footer() {
  const settings = useSettings();
  const categories = useCategories();
  const s = settings.data;
  const year = new Date().getFullYear();
  const linkCls = "text-sm text-ink-soft hover:text-ink hover:underline underline-offset-2";
  const registrations = [
    BUSINESS.fssai && `FSSAI Lic. No. ${BUSINESS.fssai}`,
    BUSINESS.gstin && `GSTIN ${BUSINESS.gstin}`,
  ].filter(Boolean);
  const address = [BUSINESS.streetAddress, BUSINESS.city, BUSINESS.postalCode, BUSINESS.region].filter(Boolean).join(", ");

  return (
    <footer className="no-print mt-12 border-t border-line bg-paper">
      <div className="mx-auto grid max-w-page gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-6 text-ink-soft">
            Vegetables, greens and fruit bought fresh and delivered to your home in the time slot you choose.
          </p>
          {address && <p className="mt-3 text-sm text-ink-muted">{address}</p>}
        </div>
        <nav aria-label="Shop categories">
          <h2 className="eyebrow">Shop</h2>
          <ul className="mt-3 space-y-2">
            <li><Link className={linkCls} to="/">All products</Link></li>
            {categories.data?.map((c) => <li key={c.id}><Link className={linkCls} to={`/c/${c.slug}`}>{c.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Help">
          <h2 className="eyebrow">Help</h2>
          <ul className="mt-3 space-y-2">
            <li><Link className={linkCls} to="/#faq">Delivery questions</Link></li>
            <li><Link className={linkCls} to="/orders">Track an order</Link></li>
            <li><Link className={linkCls} to="/account">Your account</Link></li>
            {s?.support_phone && <li><a className={linkCls} href={`tel:${s.support_phone.replace(/\s+/g, "")}`}>Call {s.support_phone}</a></li>}
            {s?.support_email && <li><a className={linkCls} href={`mailto:${s.support_email}`}>{s.support_email}</a></li>}
          </ul>
        </nav>
        <nav aria-label="Legal">
          <h2 className="eyebrow">Legal</h2>
          <ul className="mt-3 space-y-2">
            <li><Link className={linkCls} to="/privacy">Privacy Policy</Link></li>
            <li><Link className={linkCls} to="/terms">Terms & Conditions</Link></li>
            <li><Link className={linkCls} to="/terms#refunds">Cancellations & refunds</Link></li>
            <li><button className={linkCls} onClick={openCookieSettings}>Cookie settings</button></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-page flex-col gap-1 px-4 py-5 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {year} {BUSINESS.legalName || BUSINESS.name}. All rights reserved.</span>
          {registrations.length > 0 && <span>{registrations.join(" · ")}</span>}
        </div>
      </div>
    </footer>
  );
}

function Tab({ to, icon, label, badge, end }: { to: string; icon: IconName; label: string; badge?: number; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? "text-brand before:absolute before:inset-x-6 before:top-0 before:h-0.5 before:bg-brand" : "text-ink-muted"}`}>
      <span className="relative">
        <Icon name={icon} size={22} />
        {!!badge && <span className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-brand-accent px-1 text-[10px] font-bold text-white">{badge}</span>}
      </span>
      {label}
    </NavLink>
  );
}
