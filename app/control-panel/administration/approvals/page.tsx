"use client";

// Approvals list page for viewing all approval requests
// Shows pending, approved, and rejected approvals

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Approval = {
  id: string;
  executionId: string;
  nodeExecutionId: string;
  approverEmail: string;
  status: "pending" | "approved" | "rejected";
  requestData: {
    title: string;
    description: string;
  };
  responseData: Record<string, unknown> | null;
  requestedAt: string;
  respondedAt: string | null;
  respondedByEmail: string | null;
  notes: string | null;
};

export default function ApprovalsListPage() {
  const router = useRouter();
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");

  useEffect(() => {
    fetchApprovals();
  }, [filter]);

  async function fetchApprovals() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") {
        params.append("status", filter);
      }
      
      const response = await fetch(`/api/admin/orchestrations/approvals?${params}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch approvals");
      }

      const data = await response.json();
      setApprovals(data.approvals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }

  function getStatusColor(status: string) {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "approved":
        return "bg-green-100 text-green-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  }

  const pendingCount = approvals.filter((a) => a.status === "pending").length;
  const approvedCount = approvals.filter((a) => a.status === "approved").length;
  const rejectedCount = approvals.filter((a) => a.status === "rejected").length;

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Approval Requests</h1>
          <p className="text-gray-600 mt-2">Review and respond to orchestration approval requests</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <button
            onClick={() => setFilter("all")}
            className={`p-4 rounded-lg border-2 transition-all ${
              filter === "all" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="text-2xl font-bold text-gray-900">{approvals.length}</div>
            <div className="text-sm text-gray-600">All Approvals</div>
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`p-4 rounded-lg border-2 transition-all ${
              filter === "pending" ? "border-yellow-500 bg-yellow-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="text-2xl font-bold text-yellow-700">{pendingCount}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`p-4 rounded-lg border-2 transition-all ${
              filter === "approved" ? "border-green-500 bg-green-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="text-2xl font-bold text-green-700">{approvedCount}</div>
            <div className="text-sm text-gray-600">Approved</div>
          </button>
          <button
            onClick={() => setFilter("rejected")}
            className={`p-4 rounded-lg border-2 transition-all ${
              filter === "rejected" ? "border-red-500 bg-red-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="text-2xl font-bold text-red-700">{rejectedCount}</div>
            <div className="text-sm text-gray-600">Rejected</div>
          </button>
        </div>

        {/* Content */}
        <div className="bg-white rounded-lg shadow">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading approvals...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center text-red-600">
              <p>{error}</p>
            </div>
          ) : approvals.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No {filter !== "all" ? filter : ""} approvals found</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {approvals.map((approval) => (
                <div
                  key={approval.id}
                  onClick={() => router.push(`/control-panel/approvals/${approval.id}`)}
                  className="p-6 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {approval.requestData.title}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(approval.status)}`}>
                          {approval.status.toUpperCase()}
                        </span>
                      </div>
                      {approval.requestData.description && (
                        <p className="text-gray-600 mb-2">{approval.requestData.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>Requested: {new Date(approval.requestedAt).toLocaleString()}</span>
                        {approval.respondedAt && (
                          <span>Responded: {new Date(approval.respondedAt).toLocaleString()}</span>
                        )}
                      </div>
                      {approval.notes && (
                        <div className="mt-2 text-sm text-gray-600">
                          <span className="font-medium">Notes:</span> {approval.notes}
                        </div>
                      )}
                    </div>
                    <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Back Link */}
        <div className="mt-4 text-center">
          <button
            onClick={() => router.push("/control-panel/administration")}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Administration
          </button>
        </div>
      </div>
    </div>
  );
}
