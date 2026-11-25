import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCategories } from "../lib/api";
import { useSeo } from "../lib/seo";
import { categoryPath } from "../lib/site";
import Icon from "../components/Icon";

export default function NotFound() {
  const navigate = useNavigate();
  const categories = useCategories();
  const [q, setQ] = useState("");
  useSeo({
    title: "Page Not Found",
    description: "This page doesn't exist or has moved. Search for a product or go back to the shop to browse fresh vegetables and fruit available today.",
    path: window.location.pathname,
    noindex: true,
  });

  return (
    <section className="mx-auto max-w-xl py-10 text-center sm:py-16">
      <p className="eyebrow">Error 404</p>
      <h1 className="display mt-3 text-3xl sm:text-4xl">We couldn't find that page</h1>
      <p className="mt-3 text-[15px] leading-7 text-ink-soft">The link may be old, or the product may no longer be sold. Search below or go back to the shop.</p>

      <form
        role="search"
        className="mx-auto mt-7 flex max-w-md gap-2"
        onSubmit={(e) => { e.preventDefault(); navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/"); }}
      >
        <label htmlFor="nf-search" className="sr-only">Search products</label>
        <input
          id="nf-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tomato, onion…"
          className="h-12 w-full min-w-0 rounded-md bg-paper px-3.5 text-base ring-1 ring-inset ring-line outline-none focus:ring-2 focus:ring-brand"
        />
        <button className="inline-flex h-12 flex-none items-center gap-2 rounded-md bg-brand px-5 font-semibold text-white hover:bg-brand-dark">
          <Icon name="search" size={18} /> Search
        </button>
      </form>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-black">
          <Icon name="home" size={16} /> Back to the shop
        </Link>
        {categories.data?.map((c) => (
          <Link key={c.id} to={categoryPath(c)} className="inline-flex h-10 items-center rounded-md bg-paper px-4 text-sm font-semibold ring-1 ring-inset ring-line hover:ring-ink/40">
            {c.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
