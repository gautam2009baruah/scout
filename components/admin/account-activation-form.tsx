"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, LockKeyhole } from "lucide-react";

type AccountActivationFormProps = {
  token: string;
};

export function AccountActivationForm({ token }: AccountActivationFormProps) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    const response = await fetch("/api/admin/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setStatus("error");
      setMessage(typeof body?.message === "string" ? body.message : "Unable to activate account.");
      return;
    }

    setStatus("success");
    setMessage("Account activated. You can now sign in.");
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-soft-xl">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">Account activated</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <Link className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" href="/control-panel/login">
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft-xl" onSubmit={submit}>
      <div className="mb-6">
        <p className="text-sm font-medium text-teal-700">Scout account</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Activate your account</h1>
        <p className="mt-2 text-sm text-slate-600">Create a password to complete activation.</p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Password</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" minLength={8} name="password" required type="password" />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-700">Confirm password</span>
          <input className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" minLength={8} name="confirmPassword" required type="password" />
        </label>
      </div>

      {message ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p> : null}

      <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70" disabled={status === "submitting"} type="submit">
        {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
        Activate account
      </button>
    </form>
  );
}
