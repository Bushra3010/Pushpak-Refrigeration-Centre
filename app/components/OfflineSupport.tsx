"use client";

import { useEffect } from "react";

/** Registers /sw.js (production only — in dev it would cache hot-reload bundles). */
export function OfflineSupport() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}
