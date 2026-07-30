"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "notification";

type ToastState = {
  id: number;
  type: ToastType;
  message: string;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showWarning: (message: string) => void;
  showNotification: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Success/notification are transient; warning/error require the reader to
// actively dismiss them since they signal something needs attention.
const AUTO_DISMISS_TYPES = new Set<ToastType>(["success", "notification"]);
const AUTO_DISMISS_MS = 5000;

const TOAST_STYLES: Record<ToastType, { container: string; iconClassName: string; Icon: typeof CheckCircle2 }> = {
  success: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-900",
    iconClassName: "text-emerald-600",
    Icon: CheckCircle2
  },
  error: {
    container: "border-red-200 bg-red-50 text-red-900",
    iconClassName: "text-red-600",
    Icon: XCircle
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-900",
    iconClassName: "text-amber-600",
    Icon: AlertTriangle
  },
  notification: {
    container: "border-blue-200 bg-blue-50 text-blue-900",
    iconClassName: "text-blue-600",
    Icon: Info
  }
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const idRef = useRef(0);

  const clearScheduledDismiss = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearScheduledDismiss();
    setToast(null);
  }, [clearScheduledDismiss]);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      clearScheduledDismiss();
      idRef.current += 1;
      const id = idRef.current;
      setToast({ id, type, message });

      if (AUTO_DISMISS_TYPES.has(type)) {
        timeoutRef.current = window.setTimeout(() => {
          setToast((current) => (current?.id === id ? null : current));
        }, AUTO_DISMISS_MS);
      }
    },
    [clearScheduledDismiss]
  );

  useEffect(() => clearScheduledDismiss, [clearScheduledDismiss]);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      showSuccess: (message: string) => showToast(message, "success"),
      showError: (message: string) => showToast(message, "error"),
      showWarning: (message: string) => showToast(message, "warning"),
      showNotification: (message: string) => showToast(message, "notification")
    }),
    [showToast]
  );

  const style = toast ? TOAST_STYLES[toast.type] : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && style ? (
        <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-4">
          <div
            className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-2xl ${style.container}`}
            role="status"
          >
            <style.Icon className={`h-5 w-5 shrink-0 ${style.iconClassName}`} />
            <p className="flex-1 text-sm font-medium">{toast.message}</p>
            <button
              aria-label="Dismiss message"
              className="shrink-0 rounded p-0.5 opacity-70 transition hover:opacity-100"
              onClick={dismiss}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
}
