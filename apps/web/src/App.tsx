import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/AuthProvider";
import { FullPageSpinner } from "./components/ui";
import { isConfigured } from "./lib/supabase";
import CustomerLayout from "./components/CustomerLayout";
import Home from "./pages/customer/Home";
// Shop pages people land on from search are in the main bundle; the rest load when first opened
const Cart = lazy(() => import("./pages/customer/Cart"));
const Login = lazy(() => import("./pages/customer/Login"));
const ResetPassword = lazy(() => import("./pages/customer/ResetPassword"));
const Checkout = lazy(() => import("./pages/customer/Checkout"));
const Orders = lazy(() => import("./pages/customer/Orders"));
const OrderDetail = lazy(() => import("./pages/customer/OrderDetail"));
const Account = lazy(() => import("./pages/customer/Account"));
import NotFound from "./pages/NotFound";
import ProductPage from "./pages/customer/ProductPage";
import CategoryPage from "./pages/customer/CategoryPage";

const Privacy = lazy(() => import("./pages/legal/Privacy"));
const Terms = lazy(() => import("./pages/legal/Terms"));
import AdminGate, { AdminOnly } from "./auth/AdminGate";
import { ADMIN_PATH } from "./lib/base";

const ADMIN_SEGMENT = ADMIN_PATH.slice(1);

// Staff screens are loaded only when needed, so customers never download them
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout"));
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const AdminOrderDetail = lazy(() => import("./pages/admin/OrderDetail"));
const AdminProcurement = lazy(() => import("./pages/admin/Procurement"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const AdminProductEdit = lazy(() => import("./pages/admin/ProductEdit"));
const AdminPrices = lazy(() => import("./pages/admin/Prices"));
const AdminSlots = lazy(() => import("./pages/admin/Slots"));
const AdminSettings = lazy(() => import("./pages/admin/Settings"));
const AdminStaff = lazy(() => import("./pages/admin/Staff"));
const AdminCustomers = lazy(() => import("./pages/admin/Customers"));
const RiderLayout = lazy(() => import("./pages/rider/RiderLayout"));
const RiderHome = lazy(() => import("./pages/rider/RiderHome"));
const RiderDone = lazy(() => import("./pages/rider/RiderDone"));
const RiderOrder = lazy(() => import("./pages/rider/RiderOrder"));

export default function App() {
  if (!isConfigured) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="text-xl font-bold text-brand">Green Basket</h1>
        <p className="mt-2">Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/web/.env.local (see .env.example).</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<CustomerLayout />}>
          <Route index element={<Home />} />
          <Route path="cart" element={<Cart />} />
          <Route path="login" element={<Login />} />
          <Route path="reset-password" element={<ResetPassword />} />
          <Route path="checkout" element={<RequireAuth><Checkout /></RequireAuth>} />
          <Route path="orders" element={<RequireAuth><Orders /></RequireAuth>} />
          <Route path="orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
          <Route path="account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="p/:slug" element={<ProductPage />} />
          <Route path="c/:slug" element={<CategoryPage />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          {/* unknown addresses get the branded 404 inside the normal header and footer */}
          <Route path="*" element={<NotFound />} />
        </Route>

        {/* Admin panel lives at a private address (ADMIN_PATH, e.g. /gb-console), with its own password-only login.
            The old /admin address is just "Page not found". */}
        <Route path={`${ADMIN_SEGMENT}/login`} element={<AdminLogin />} />
        <Route path={ADMIN_SEGMENT} element={<AdminGate><AdminLayout /></AdminGate>}>
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:id" element={<AdminOrderDetail />} />
          <Route path="procurement" element={<AdminProcurement />} />
          <Route path="products" element={<AdminProducts />} />
          {/* admin-only pages: packers get an "Admins only" message (the database refuses them anyway) */}
          <Route path="products/:id" element={<AdminOnly><AdminProductEdit /></AdminOnly>} />
          <Route path="prices" element={<AdminOnly><AdminPrices /></AdminOnly>} />
          <Route path="slots" element={<AdminOnly><AdminSlots /></AdminOnly>} />
          <Route path="settings" element={<AdminOnly><AdminSettings /></AdminOnly>} />
          <Route path="staff" element={<AdminOnly><AdminStaff /></AdminOnly>} />
          <Route path="customers" element={<AdminOnly><AdminCustomers /></AdminOnly>} />
        </Route>

        {/* Rider app: its own header, tabs (Deliveries / Completed / Account) and back buttons */}
        <Route path="rider" element={<RequireAuth roles={["rider", "admin"]}><RiderLayout /></RequireAuth>}>
          <Route index element={<RiderHome />} />
          <Route path="done" element={<RiderDone />} />
          <Route path=":id" element={<RiderOrder />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
