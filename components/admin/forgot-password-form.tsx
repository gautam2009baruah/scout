"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2, Mail, Send } from "lucide-react";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      setStatus("error");
      setMessage("Please enter your email.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/admin/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      if (!response.ok) {
        setStatus("error");
        setMessage("Unable to process your request. Please try again.");
        return;
      }

      setStatus("success");
      setMessage("If an account exists for that email, we've sent a link to reset your password.");
    } catch {
      setStatus("error");
      setMessage("Unable to process your request. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-center shadow-soft-xl">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="mt-4 text-2xl font-semibold text-slate-950">Check your email</h1>
        <p className="mt-2 text-sm text-slate-600">{message}</p>
        <Link className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" href="/control-panel/login">
          Back to login
        </Link>
      </div>
    );
  }

  return (
    <form className="rounded-lg border border-slate-200 bg-white p-6 shadow-soft-xl sm:p-8" onSubmit={submit}>
      <div className="mb-6">
        <p className="text-sm font-medium text-teal-700">Account recovery</p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-950">Forgot your password?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Enter the email associated with your account and we&apos;ll send you a link to reset your password.
        </p>
      </div>

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

      {status === "error" && message ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
      ) : null}

      <button
        className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-soft-xl transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-70"
        disabled={status === "submitting"}
        type="submit"
      >
        {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send reset link
      </button>

      <Link
        className="mt-5 inline-flex w-full items-center justify-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-950"
        href="/control-panel/login"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to login
      </Link>
    </form>
  );
}
