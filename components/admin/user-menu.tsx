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

    // Set immediate logout lock so fast back navigation cannot re-open protected pages.
    if (typeof window !== "undefined") {
      document.cookie = "scout_logout_lock=1; Path=/; Max-Age=120; SameSite=Lax";
      window.sessionStorage?.setItem("scout_logout_lock", "1");
      window.localStorage?.setItem("scout_logout_lock", "1");
    }

    try {
      // Clear chatbot conversation history from sessionStorage
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const keysToRemove: string[] = [];
        
        // Find all chatbot-related keys and orchestration keys
        for (let i = 0; i < window.sessionStorage.length; i++) {
          const key = window.sessionStorage.key(i);
          if (key && (key.startsWith('scout-chatbot:') || key === 'scout-orchestration-executions')) {
            keysToRemove.push(key);
          }
        }
        
        // Remove all chatbot and orchestration keys
        keysToRemove.forEach(key => {
          window.sessionStorage.removeItem(key);
        });
        
        console.log(`🧹 Cleared ${keysToRemove.length} session items on logout`);
      }
      
      // Clear orchestration executions from window
      if (typeof window !== 'undefined' && (window as any).__orchestrationExecutions) {
        const count = Object.keys((window as any).__orchestrationExecutions).length;
        delete (window as any).__orchestrationExecutions;
        console.log(`🧹 Cleared ${count} orchestration executions from memory`);
      }
      
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } finally {
      window.location.replace("/control-panel/login");
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <UserPlus className="h-4 w-4" />
        {name}
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-20 w-44 rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
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
