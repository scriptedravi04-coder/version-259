import ErrorBoundary from "@/components/ErrorBoundary";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";
import App from "@/App";
import { installKeyboardAware } from "@/lib/keyboardAware";
import { registerSW } from "virtual:pwa-register";

// Session 41 — installable app (PWA). The service worker makes Chrome offer "Install app";
// public/manifest.json gives the name and icons.
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try { registerSW({ immediate: true }); } catch (e) { console.warn("Service worker not registered:", e); }
}
// Chrome can fire "beforeinstallprompt" before React has mounted the install banner.
// Keep the event so the banner (usePWAInstall) can still use it.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__ybexInstallPrompt = e;
    window.dispatchEvent(new Event("ybex-install-ready"));
  });
}

if (typeof window !== "undefined") {
  const handleChunkError = (errMessage) => {
    const msg = String(errMessage || "").toLowerCase();
    if (
      msg.includes("failed to fetch dynamically imported module") ||
      msg.includes("importing a module script failed") ||
      msg.includes("error loading dynamically imported module") ||
      msg.includes("chunkloaderror") ||
      msg.includes("invalid hook call") ||
      msg.includes("reading 'usecontext'") ||
      msg.includes("reading 'usestate'") ||
      msg.includes("reading 'useeffect'")
    ) {
      const lastReload = parseInt(sessionStorage.getItem("last_chunk_reload_ts") || "0", 10);
      const now = Date.now();
      if (now - lastReload > 10000) {
        sessionStorage.setItem("last_chunk_reload_ts", String(now));
        window.location.reload();
        return true;
      }
    }
    return false;
  };

  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    handleChunkError("failed to fetch dynamically imported module");
  });

  window.onerror = function (msg, url, lineNo, columnNo, error) {
    if (handleChunkError(msg || error?.message)) {
      return true;
    }
    if (
      msg === "Script error." ||
      (typeof msg === "string" && (msg.includes("ResizeObserver") || msg.includes("Script error")))
    ) {
      console.warn("Suppressed cross-origin / harmless script event:", msg);
      return true;
    }
    return false;
  };

  window.addEventListener("error", (event) => {
    if (handleChunkError(event.message || event.error?.message)) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if (
      event.message === "Script error." ||
      event.message?.includes("ResizeObserver loop") ||
      event.message?.includes("Script error")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      console.warn("Handled cross-origin script / layout event:", event.message);
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (handleChunkError(event.reason?.message || String(event.reason || ""))) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
      return;
    }
    if (
      event.reason?.message?.includes?.("ResizeObserver") ||
      event.reason?.message?.includes?.("Script error")
    ) {
      event.preventDefault();
      event.stopImmediatePropagation?.();
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  },
});

installKeyboardAware(); // Session 39 (M9): fields never hide under the phone keyboard
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary><App /></ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);

// Session 42: a logged-in phone starts downloading its home screen right away, while the login check
// (/auth/me) is still on its way — the two no longer wait for each other.
try {
  if (window.localStorage.getItem("ybex_token") && window.innerWidth < 768) {
    const role = JSON.parse(window.localStorage.getItem("ybex_user") || "{}")?.role;
    const load = role === "creator" ? import("./pages/creator/CreatorHomeMobile") : import("./pages/brand/BrandHomeMobile");
    load.catch(() => {});
  }
} catch { /* storage blocked: the page loads normally */ }
