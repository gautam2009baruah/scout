"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCompanyContext } from "@/lib/admin/hooks/use-company-context";
import { Building2, Check, ChevronDown } from "lucide-react";

/**
 * CompanyContextSwitcher
 * Header component for switching between companies
 * Displays current company and dropdown to select another
 * When changed, refreshes the entire app with new company context
 */
export function CompanyContextSwitcher() {
  const { currentCompanyId, availableCompanies, loading, switchCompany } = useCompanyContext();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedCompany = useMemo(
    () => availableCompanies.find((company) => company.id === currentCompanyId),
    [availableCompanies, currentCompanyId]
  );

  useEffect(() => {
    if (!open) return;

    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  if (loading || !currentCompanyId) {
    return (
      <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm">
        <Building2 className="h-4 w-4" />
        Loading organization...
      </div>
    );
  }

  if (availableCompanies.length <= 1) {
    return (
      <div className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Building2 className="h-4 w-4" />
        </span>
        <div className="leading-tight">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Organization</div>
          <div className="font-semibold text-slate-900">{availableCompanies[0]?.name}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="group inline-flex h-10 min-w-[220px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Building2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Organization</span>
          <span className="block truncate text-sm font-semibold text-slate-900">{selectedCompany?.name}</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[320px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Switch Organization
          </div>
          <div className="max-h-72 overflow-auto p-2">
            {availableCompanies.map((company) => {
              const isActive = company.id === currentCompanyId;
              return (
                <button
                  className={`mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2.5 text-left text-sm transition last:mb-0 ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                  key={company.id}
                  onClick={() => {
                    setOpen(false);
                    if (!isActive) {
                      switchCompany(company.id);
                    }
                  }}
                  role="option"
                  type="button"
                >
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-white/15" : "bg-slate-100"}`}>
                    <Building2 className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-600"}`} />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{company.name}</span>
                  {isActive ? <Check className="h-4 w-4" /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
