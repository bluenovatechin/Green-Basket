import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { AccountMenu, Logo } from "../../components/CustomerLayout";
import Icon, { type IconName } from "../../components/Icon";

type NavItem = { to: string; label: string; icon: IconName; adminOnly?: boolean; end?: boolean };
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ to: "/admin", label: "Dashboard", icon: "grid", end: true }] },
  {
    title: "Sales",
    items: [
      { to: "/admin/orders", label: "Orders", icon: "package" },
      { to: "/admin/customers", label: "Customers", icon: "users", adminOnly: true },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { to: "/admin/products", label: "Products & stock", icon: "leaf" },
      { to: "/admin/prices", label: "Today's prices", icon: "tag", adminOnly: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/admin/procurement", label: "Buying list", icon: "cart" },
      { to: "/admin/slots", label: "Delivery slots", icon: "clock", adminOnly: true },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/admin/settings", label: "Store settings", icon: "settings", adminOnly: true },
      { to: "/admin/staff", label: "Staff & roles", icon: "shield", adminOnly: true },
    ],
  },
];

export function useIsAdmin() {
  return useAuth().profile?.role === "admin";
}

function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${isActive ? "bg-ink text-white" : "text-ink-soft hover:bg-surface hover:text-ink"}`;
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
        <Link to="/" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface"><Icon name="store" size={18} />View store</Link>
        <Link to="/rider" className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-ink-soft hover:bg-surface"><Icon name="bike" size={18} />Rider screen</Link>
      </div>
    </nav>
  );
}

export default function AdminLayout() {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-surface">
      <header className="no-print sticky top-0 z-40 flex h-16 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur-xl lg:pl-0">
        <div className="flex items-center gap-2">
          <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={22} />
          </button>
          <div className="flex items-center gap-2 lg:w-64 lg:px-6">
            <Logo to="/admin" />
            <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">Admin</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="hidden h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-ink-soft hover:bg-surface sm:inline-flex">
            <Icon name="store" size={18} /> View store
          </Link>
          <AccountMenu />
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
                <Logo to="/admin" />
                <button className="flex h-10 w-10 items-center justify-center rounded-full hover:bg-surface" onClick={() => setOpen(false)} aria-label="Close menu">
                  <Icon name="x" size={20} />
                </button>
              </div>
              <div className="h-[calc(100%-4rem)]"><Sidebar isAdmin={isAdmin} /></div>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
