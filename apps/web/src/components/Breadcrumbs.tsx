import { Link } from "react-router-dom";
import type { Crumb } from "../lib/seo";
import Icon from "./Icon";

/** Visible breadcrumb trail. Pass the same list to useSeo({ crumbs }) for the BreadcrumbList schema. */
export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-5 text-sm">
      <ol className="flex flex-wrap items-center gap-1.5 text-ink-muted">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-1.5">
              {i > 0 && <Icon name="chevronRight" size={14} aria-hidden="true" />}
              {last ? (
                <span aria-current="page" className="font-medium text-ink">{c.name}</span>
              ) : (
                <Link to={c.path} className="hover:text-ink hover:underline underline-offset-2">{c.name}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
