"use client";

// Approval response page for human approval workflows
// Displays approval details and allows approver to respond

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatDateTimeForDisplay } from "@/lib/datetime";

type ApprovalField = {
  label: string;
  value: string;
  defaultValue?: string;
};

type ApprovalRequestData = {
  title: string;
  description: string;
  fields: ApprovalField[];
  context: Record<string, unknown>;
};

type Approval = {
  id: string;
  executionId: string;
  nodeExecutionId: string;
  approverEmail: string;
  status: "pending" | "approved" | "rejected";
  requestData: ApprovalRequestData;
  responseData: Record<string, unknown> | null;
  requestedAt: string;
  respondedAt: string | null;
  respondedByEmail: string | null;
  notes: string | null;
};

export default function ApprovalPage() {
  const params = useParams();
  const router = useRouter();
  const approvalId = params.id as string;

  const [approval, setApproval] = useState<Approval | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    fetchApproval();
  }, [approvalId]);

  async function fetchApproval() {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/orchestrations/approvals?id=${approvalId}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch approval");
      }

      const data = await response.json();
      setApproval(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approval");
    } finally {
      setLoading(false);
    }
  }

  async function handleResponse(status: "approved" | "rejected") {
    if (!approval) return;

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch("/api/admin/orchestrations/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvalId: approval.id,
          status,
          notes: notes.trim() || null,
          responseData: {},
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to respond to approval");
      }

      const result = await response.json();

      // Show success message and redirect
      alert(`Approval ${status} successfully!`);
      
      // Redirect to approvals list
      router.push("/control-panel/administration/approvals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading approval...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <div className="text-red-600 text-center">
            <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold mb-2">Error</h2>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!approval) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <p className="text-gray-600 text-center">Approval not found</p>
        </div>
      </div>
    );
  }

  const isAlreadyResponded = approval.status !== "pending";

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {/* Header */}
          <div className={`p-6 ${
            isAlreadyResponded 
              ? approval.status === "approved" 
                ? "bg-green-50 border-b-4 border-green-500" 
                : "bg-red-50 border-b-4 border-red-500"
              : "bg-blue-50 border-b-4 border-blue-500"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {approval.requestData.title}
                </h1>
                <p className="text-sm text-gray-600 mt-1">
                  Requested {formatDateTimeForDisplay(approval.requestedAt, { fallback: "Never" })}
                </p>
              </div>
              <div className={`px-4 py-2 rounded-full font-semibold ${
                approval.status === "pending"
                  ? "bg-yellow-100 text-yellow-800"
                  : approval.status === "approved"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}>
                {approval.status.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Description */}
            {approval.requestData.description && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
                <p className="text-gray-700">{approval.requestData.description}</p>
              </div>
            )}

            {/* Fields */}
            {approval.requestData.fields && approval.requestData.fields.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Details</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                  {approval.requestData.fields.map((field, index) => (
                    <div key={index} className="flex flex-col">
                      <span className="text-sm font-medium text-gray-700">{field.label}</span>
                      <span className="text-gray-900 mt-1">
                        {field.value || field.defaultValue || "N/A"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Response Information (if already responded) */}
            {isAlreadyResponded && (
              <div className="mb-6 bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Response</h3>
                <p className="text-sm text-gray-600">
                  Responded by: <span className="font-medium">{approval.respondedByEmail}</span>
                </p>
                <p className="text-sm text-gray-600">
                  At: <span className="font-medium">{formatDateTimeForDisplay(approval.respondedAt, { fallback: "Never" })}</span>
                </p>
                {approval.notes && (
                  <div className="mt-2">
                    <p className="text-sm font-medium text-gray-700">Notes:</p>
                    <p className="text-gray-700 mt-1">{approval.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Notes Input (if pending) */}
            {!isAlreadyResponded && (
              <div className="mb-6">
                <label htmlFor="notes" className="block text-sm font-semibold text-gray-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any comments or notes about your decision..."
                />
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            {!isAlreadyResponded && (
              <div className="flex gap-4">
                <button
                  onClick={() => handleResponse("approved")}
                  disabled={submitting}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {submitting ? "Submitting..." : "✓ Approve"}
                </button>
                <button
                  onClick={() => handleResponse("rejected")}
                  disabled={submitting}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {submitting ? "Submitting..." : "✗ Reject"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Back Link */}
        <div className="mt-4 text-center">
          <button
            onClick={() => router.push("/control-panel/administration/approvals")}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            ← Back to Approvals List
          </button>
        </div>
      </div>
    </div>
  );
}
