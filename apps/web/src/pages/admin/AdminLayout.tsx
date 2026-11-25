import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { AccountMenu, Logo } from "../../components/CustomerLayout";
import Icon, { type IconName } from "../../components/Icon";
import { ADMIN_PATH, BASE } from "../../lib/base";
import { usePrivatePage } from "../../lib/seo";

type NavItem = { to: string; label: string; icon: IconName; adminOnly?: boolean; end?: boolean };
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ to: `${ADMIN_PATH}`, label: "Dashboard", icon: "grid", end: true }] },
  {
    title: "Sales",
    items: [
      { to: `${ADMIN_PATH}/orders`, label: "Orders", icon: "package" },
      { to: `${ADMIN_PATH}/customers`, label: "Customers", icon: "users", adminOnly: true },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { to: `${ADMIN_PATH}/products`, label: "Products & stock", icon: "leaf" },
      { to: `${ADMIN_PATH}/prices`, label: "Today's prices", icon: "tag", adminOnly: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: `${ADMIN_PATH}/procurement`, label: "Buying list", icon: "cart" },
      { to: `${ADMIN_PATH}/slots`, label: "Delivery slots", icon: "clock", adminOnly: true },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: `${ADMIN_PATH}/settings`, label: "Store settings", icon: "settings", adminOnly: true },
      { to: `${ADMIN_PATH}/staff`, label: "Staff & roles", icon: "shield", adminOnly: true },
    ],
  },
];

function BottomTab({ to, icon, label, end }: { to: string; icon: IconName; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? "text-brand before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:bg-brand" : "text-ink-muted"}`}>
      <Icon name={icon} size={22} />
      {label}
    </NavLink>
  );
}

export function useIsAdmin() {
  return useAuth().profile?.role === "admin";
}

function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-ink text-white" : "text-ink-soft hover:bg-surface hover:text-ink"}`;
  return (
    <nav className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-5" aria-label="Admin">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => isAdmin || !i.adminOnly);
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{g.title}</div>
            <div className="space-y-0.5">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={link}>
                  <Icon name={i.icon} size={18} />
                  {i.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
      <div className="mt-auto space-y-0.5 border-t border-line pt-4">
        <a href={BASE} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface"><Icon name="store" size={18} />View store ↗</a>
        {isAdmin && <a href={`${BASE}rider`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface"><Icon name="bike" size={18} />Rider screen ↗</a>}
      </div>
    </nav>
  );
}

export default function AdminLayout() {
  usePrivatePage("Store Console");
  const isAdmin = useIsAdmin();
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-surface">
      <header className="no-print sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur-xl lg:pl-0">
        <div className="flex items-center gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <div className="flex min-w-0 items-center gap-2 lg:w-64 lg:px-6">
            <Logo to={`${ADMIN_PATH}`} />
            <span className="hidden rounded-md bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white sm:inline">{profile?.role === "packer" ? "Packer" : "Admin"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={BASE} target="_blank" rel="noreferrer" className="hidden h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-ink-soft hover:bg-surface sm:inline-flex">
            <Icon name="store" size={18} /> View store ↗
          </a>
          <AccountMenu area="admin" />
        </div>
      </header>

      <div className="flex">
        <aside className="no-print sticky top-16 hidden h-[calc(100vh-4rem)] w-64 flex-none border-r border-line bg-white lg:block">
          <Sidebar isAdmin={isAdmin} />
        </aside>

        {open && (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-lift">
              <div className="flex h-16 items-center justify-between border-b border-line px-4">
                <Logo to={`${ADMIN_PATH}`} />
                <button className="flex h-10 w-10 items-center justify-center rounded-md hover:bg-surface" onClick={() => setOpen(false)} aria-label="Close menu">
                  <Icon name="x" size={20} />
                </button>
              </div>
              <div className="h-[calc(100%-4rem)]"><Sidebar isAdmin={isAdmin} /></div>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>

      {/* phones and tablets: the most used sections one tap away; "More" opens the full menu */}
      <nav aria-label="Console sections" className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid h-16 grid-cols-5">
          <BottomTab to={ADMIN_PATH} end icon="grid" label="Home" />
          <BottomTab to={`${ADMIN_PATH}/orders`} icon="package" label="Orders" />
          <BottomTab to={`${ADMIN_PATH}/products`} icon="leaf" label="Stock" />
          <BottomTab to={`${ADMIN_PATH}/procurement`} icon="cart" label="Buying" />
          <button onClick={() => setOpen(true)} className="flex flex-col items-center justify-center gap-1 text-[11px] font-semibold text-ink-muted">
            <Icon name="menu" size={22} /> More
          </button>
        </div>
      </nav>
    </div>
  );
}
