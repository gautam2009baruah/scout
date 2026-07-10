"use client";

import { useCallback, useState, useEffect } from "react";

export type AvailableCompany = {
  id: string;
  name: string;
  slug: string;
  roleId: string;
  roleName: string;
  isPrimary: boolean;
};

export function useCompanyContext() {
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [currentCompanyName, setCurrentCompanyName] = useState<string>("");
  const [availableCompanies, setAvailableCompanies] = useState<AvailableCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch available companies on mount
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await fetch("/api/session/available-companies");
        if (!res.ok) {
          throw new Error("Failed to fetch companies");
        }
        const data = await res.json();
        setCurrentCompanyId(data.currentCompanyId);
        setCurrentCompanyName(data.currentCompanyName);
        setAvailableCompanies(data.availableCompanies);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  const switchCompany = useCallback(async (newCompanyId: string) => {
    try {
      setLoading(true);
      const res = await fetch("/api/session/set-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: newCompanyId })
      });

      if (!res.ok) {
        throw new Error("Failed to switch company");
      }

      // Refresh the entire application to reload data with new company context
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setLoading(false);
    }
  }, []);

  return {
    currentCompanyId,
    currentCompanyName,
    availableCompanies,
    loading,
    error,
    switchCompany
  };
}
