import { Link } from "react-router-dom";
import { Empty } from "../components/ui";

export default function NotFound() {
  return (
    <Empty title="Page not found">
      <Link to="/" className="font-semibold text-brand">Go to the shop</Link>
    </Empty>
  );
}
