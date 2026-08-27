"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !("serviceWorker" in navigator)
    )
      return;
    void navigator.serviceWorker.register("/dashboard/service-worker.js", {
      scope: "/dashboard/",
    });
  }, []);

  return null;
}
