import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { AccountMenu } from "../../components/CustomerLayout";

type NavItem = { to: string; label: string; icon: string; adminOnly?: boolean; end?: boolean };
const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Overview", items: [{ to: "/admin", label: "Dashboard", icon: "📊", end: true }] },
  {
    title: "Sales",
    items: [
      { to: "/admin/orders", label: "Orders", icon: "📦" },
      { to: "/admin/customers", label: "Customers", icon: "👥", adminOnly: true },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { to: "/admin/products", label: "Products & stock", icon: "🥬" },
      { to: "/admin/prices", label: "Today's prices", icon: "🏷️", adminOnly: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { to: "/admin/procurement", label: "Buying list", icon: "🛒" },
      { to: "/admin/slots", label: "Delivery slots", icon: "🕒", adminOnly: true },
    ],
  },
  {
    title: "Settings",
    items: [
      { to: "/admin/settings", label: "Store settings", icon: "⚙️", adminOnly: true },
      { to: "/admin/staff", label: "Staff & roles", icon: "🧑‍🤝‍🧑", adminOnly: true },
    ],
  },
];

export function useIsAdmin() {
  return useAuth().profile?.role === "admin";
}

function Sidebar({ isAdmin }: { isAdmin: boolean }) {
  const link = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${isActive ? "bg-brand text-white shadow-sm" : "text-gray-700 hover:bg-gray-100"}`;
  return (
    <nav className="flex h-full flex-col gap-5 overflow-y-auto p-3" aria-label="Admin">
      {GROUPS.map((g) => {
        const items = g.items.filter((i) => isAdmin || !i.adminOnly);
        if (!items.length) return null;
        return (
          <div key={g.title}>
            <div className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{g.title}</div>
            <div className="space-y-0.5">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.end} className={link}>
                  <span aria-hidden className="w-5 text-center">{i.icon}</span>
                  {i.label}
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
      <div className="mt-auto space-y-0.5 border-t border-gray-200 pt-3">
        <Link to="/" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"><span className="w-5 text-center">🏪</span>View store</Link>
        <Link to="/rider" className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"><span className="w-5 text-center">🛵</span>Rider screen</Link>
      </div>
    </nav>
  );
}

export default function AdminLayout() {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-3 lg:pl-0">
        <div className="flex items-center gap-2">
          <button className="rounded-lg p-2 text-xl lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
          <Link to="/admin" className="flex items-center gap-2 lg:w-64 lg:px-5">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="font-extrabold text-brand">Green Basket</span>
            <span className="rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Admin</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/" className="hidden rounded-xl px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 sm:block">View store ↗</Link>
          <AccountMenu />
        </div>
      </header>

      <div className="flex">
        {/* desktop sidebar */}
        <aside className="no-print sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 flex-none border-r border-gray-200 bg-white lg:block">
          <Sidebar isAdmin={isAdmin} />
        </aside>

        {/* mobile drawer */}
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl">
              <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
                <span className="font-extrabold text-brand">Menu</span>
                <button className="rounded-lg p-2 text-xl" onClick={() => setOpen(false)} aria-label="Close menu">✕</button>
              </div>
              <div className="h-[calc(100%-3.5rem)]"><Sidebar isAdmin={isAdmin} /></div>
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 p-4 lg:p-6">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
