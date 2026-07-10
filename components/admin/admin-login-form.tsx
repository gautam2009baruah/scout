"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LockKeyhole, Mail } from "lucide-react";

type LoginStatus = "idle" | "submitting" | "error";

export function AdminLoginForm() {
  const router = useRouter();
  const [status, setStatus] = useState<LoginStatus>("idle");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    document.cookie = "scout_logout_lock=; Path=/; Max-Age=0; SameSite=Lax";
    window.sessionStorage?.removeItem("scout_logout_lock");
    window.localStorage?.removeItem("scout_logout_lock");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    try {
      if (!email || !password) {
        setStatus("error");
        return;
      }

      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        setStatus("error");
        return;
      }

      const body = await response.json().catch(() => null);

      if (typeof window !== "undefined") {
        document.cookie = "scout_logout_lock=; Path=/; Max-Age=0; SameSite=Lax";
        window.sessionStorage?.removeItem("scout_logout_lock");
        window.localStorage?.removeItem("scout_logout_lock");
      }

      router.push(body?.mustChangePassword ? "/control-panel/change-password" : "/control-panel");
      router.refresh();
    } catch {
      setStatus("error");
    }
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Email</span>
        <span className="mt-2 flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/10">
          <Mail className="h-5 w-5 text-slate-400" />
          <input
            autoComplete="email"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
            name="email"
            placeholder="user@organization.com"
            required
            type="email"
          />
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <span className="mt-2 flex h-12 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 shadow-sm transition focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/10">
          <LockKeyhole className="h-5 w-5 text-slate-400" />
          <input
            autoComplete="current-password"
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-slate-950 outline-none placeholder:text-slate-400"
            name="password"
            placeholder="Enter password"
            required
            type={showPassword ? "text" : "password"}
          />
          <button
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-slate-900/10"
            onClick={() => setShowPassword((value) => !value)}
            type="button"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
      </label>

      {status === "error" ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Invalid credentials. Please try again.
        </p>
      ) : null}

      <button
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-soft-xl transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        Sign in
      </button>
    </form>
  );
}
