"use client";

import { useEffect } from "react";

function hasClientLogoutLock(): boolean {
  if (typeof window === "undefined") return false;

  const cookieLocked = document.cookie.split(";").some((part) => part.trim() === "scout_logout_lock=1");
  const sessionLocked = window.sessionStorage?.getItem("scout_logout_lock") === "1";
  const localLocked = window.localStorage?.getItem("scout_logout_lock") === "1";

  return cookieLocked || sessionLocked || localLocked;
}

async function hasValidSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/session/available-companies", {
      method: "GET",
      cache: "no-store"
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function SessionBackGuard() {
  useEffect(() => {
    let checking = false;

    const verify = async () => {
      if (checking) return;
      checking = true;

      try {
        if (hasClientLogoutLock()) {
          window.location.replace("/control-panel/login");
          return;
        }

        const valid = await hasValidSession();
        if (!valid) {
          window.location.replace("/control-panel/login");
        }
      } finally {
        checking = false;
      }
    };

    // Check once on mount.
    void verify();

    const onPageShow = () => {
      void verify();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void verify();
      }
    };

    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
