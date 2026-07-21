"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Loader2, LockKeyhole, X } from "lucide-react";

const PASSWORD_REQUIREMENT_MESSAGE = "Minimum 8 characters, alphanumeric, including 1 special character.";

function isPasswordComplexityValid(password: string) {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

type ResetPasswordModalProps = {
  open: boolean;
  onClose: () => void;
};

export function ResetPasswordModal({ open, onClose }: ResetPasswordModalProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setStatus("idle");
    setMessage("");

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    if (!isPasswordComplexityValid(password)) {
      setStatus("error");
      setMessage(PASSWORD_REQUIREMENT_MESSAGE);
      return;
    }

    if (password !== confirmPassword) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    const response = await fetch("/api/admin/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setStatus("error");
      setMessage(typeof body?.message === "string" ? body.message : "Unable to reset password.");
      return;
    }

    setStatus("success");
    setMessage("Your password has been reset.");
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-teal-700">Account security</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-950">Reset password</h3>
          </div>
          <button
            aria-label="Close"
            className="rounded-md border border-slate-200 p-2 text-slate-700 transition hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {status === "success" ? (
          <div className="mt-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <p className="mt-3 text-sm text-slate-600">{message}</p>
            <button
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white"
              onClick={onClose}
              type="button"
            >
              Done
            </button>
          </div>
        ) : (
          <form className="mt-5" onSubmit={submit}>
            <p className="mb-4 text-xs text-slate-500">{PASSWORD_REQUIREMENT_MESSAGE}</p>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">New password</span>
                <input
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                  minLength={8}
                  name="password"
                  required
                  type="password"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Confirm new password</span>
                <input
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
                  minLength={8}
                  name="confirmPassword"
                  required
                  type="password"
                />
              </label>
            </div>

            {status === "error" && message ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>
            ) : null}

            <div className="mt-5 flex justify-end gap-3">
              <button
                className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
                disabled={status === "submitting"}
                type="submit"
              >
                {status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                Reset password
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
