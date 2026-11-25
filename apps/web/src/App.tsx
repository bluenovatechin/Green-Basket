import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { RequireAuth } from "./auth/AuthProvider";
import { FullPageSpinner } from "./components/ui";
import { isConfigured } from "./lib/supabase";
import CustomerLayout from "./components/CustomerLayout";
import Home from "./pages/customer/Home";
import Cart from "./pages/customer/Cart";
import Login from "./pages/customer/Login";
import ResetPassword from "./pages/customer/ResetPassword";
import Checkout from "./pages/customer/Checkout";
import Orders from "./pages/customer/Orders";
import OrderDetail from "./pages/customer/OrderDetail";
import Account from "./pages/customer/Account";
import NotFound from "./pages/NotFound";
import AdminGate from "./auth/AdminGate";
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
const RiderHome = lazy(() => import("./pages/rider/RiderHome"));

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
          <Route path="products/:id" element={<AdminProductEdit />} />
          <Route path="prices" element={<AdminPrices />} />
          <Route path="slots" element={<AdminSlots />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="staff" element={<AdminStaff />} />
          <Route path="customers" element={<AdminCustomers />} />
        </Route>

        <Route path="rider" element={<RequireAuth roles={["rider", "admin"]}><RiderHome /></RequireAuth>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
