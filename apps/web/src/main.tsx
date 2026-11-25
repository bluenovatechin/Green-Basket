import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthProvider";
import { CartProvider } from "./state/cart";
import App from "./App";
import { categoriesQuery, productsQuery, settingsQuery } from "./lib/api";
import { isAdminArea, isConfigured } from "./lib/supabase";
import "./lib/install"; // listen for "install app" as early as possible
import "./lib/pwa"; // keep the installed copy up to date
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
});

// Start loading the catalogue right away, in parallel with the first render (faster first paint of products)
if (isConfigured && !isAdminArea()) {
  void queryClient.prefetchQuery(productsQuery);
  void queryClient.prefetchQuery(categoriesQuery);
  void queryClient.prefetchQuery(settingsQuery);
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* basename lets the app run in a folder, e.g. github.io/Green-Basket/ */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
        <AuthProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
