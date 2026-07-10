"use client";

import { useCompanyContext } from "@/lib/admin/hooks/use-company-context";
import { ChevronDown } from "lucide-react";

/**
 * CompanyContextSwitcher
 * Header component for switching between companies
 * Displays current company and dropdown to select another
 * When changed, refreshes the entire app with new company context
 */
export function CompanyContextSwitcher() {
  const { currentCompanyId, availableCompanies, loading, switchCompany } = useCompanyContext();

  if (loading || !currentCompanyId) {
    return (
      <div className="px-3 py-2 bg-slate-100 rounded text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  if (availableCompanies.length <= 1) {
    // Only one company, don't show dropdown
    const company = availableCompanies[0];
    return (
      <div className="px-3 py-2 text-sm text-slate-700 flex items-center gap-2">
        <span className="font-medium">{company.name}</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={currentCompanyId}
        onChange={(e) => switchCompany(e.target.value)}
        className="
          appearance-none pl-3 pr-8 py-2 bg-white border border-slate-300 rounded
          text-sm font-medium text-slate-700 cursor-pointer
          hover:border-slate-400 hover:bg-slate-50
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
          transition-colors
        "
      >
        {availableCompanies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none"
        size={16}
        strokeWidth={2}
      />
    </div>
  );
}
