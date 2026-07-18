"use client";

import { useEffect, useRef, useState } from "react";
import { LogOut, UserPlus } from "lucide-react";

export function UserMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function logout() {
    setLoggingOut(true);
    try {
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("SCOUT_SESSION_EXPIRED"));
      }

      if (typeof window !== "undefined" && window.sessionStorage) {
        const keysToRemove: string[] = [];

        for (let i = 0; i < window.sessionStorage.length; i += 1) {
          const key = window.sessionStorage.key(i);
          if (key && (key.startsWith("scout-chatbot:") || key === "scout-orchestration-executions")) {
            keysToRemove.push(key);
          }
        }

        keysToRemove.forEach((key) => {
          window.sessionStorage.removeItem(key);
        });
      }

      if (typeof window !== "undefined" && (window as Window & typeof globalThis & { __orchestrationExecutions?: Record<string, unknown> }).__orchestrationExecutions) {
        delete (window as Window & typeof globalThis & { __orchestrationExecutions?: Record<string, unknown> }).__orchestrationExecutions;
      }

      const cookiesToClear = document.cookie.split(";").map((entry) => entry.trim()).filter(Boolean);
      cookiesToClear.forEach((entry) => {
        const separatorIndex = entry.indexOf("=");
        const name = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
        const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
        document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${secureFlag}`;
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secureFlag}`;
      });

      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/control-panel/login");
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 font-mono text-xs font-semibold text-slate-800 transition hover:border-blue-500 hover:bg-slate-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <UserPlus className="h-4 w-4" />
        {name}
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-20 w-44 rounded-lg border border-slate-300 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.10)]">
          <button
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loggingOut}
            onClick={logout}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
