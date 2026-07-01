"use client";

import React, { useEffect, useState } from "react";
import type { SelectorCandidate } from "@/shared/guideTypes";

type HealingSuggestion = {
  id: string;
  workflow_id: string;
  workflow_title: string;
  step_id: string;
  step_order: number;
  original_selector_candidates: SelectorCandidate[];
  original_element_identity: any;
  proposed_selector_candidates: SelectorCandidate[];
  confidence_score: number;
  healing_source: "rule-based" | "ai-assisted";
  healing_reason: string;
  ai_provider?: string;
  ai_model?: string;
  page_url: string;
  page_title?: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  playback_attempt_count: number;
  last_playback_attempt_at: string;
};

type EditModalData = {
  suggestion: HealingSuggestion;
  editedCandidates: SelectorCandidate[];
};

export default function HealingSuggestionReviewer() {
  const [suggestions, setSuggestions] = useState<HealingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<EditModalData | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function loadSuggestions() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/guided-workflow-player/healing-suggestions?status=pending");
      if (!response.ok) {
        throw new Error(`Failed to load suggestions: ${response.statusText}`);
      }
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(suggestionId: string, editedCandidates?: SelectorCandidate[]) {
    try {
      setProcessingId(suggestionId);
      const response = await fetch("/api/guided-workflow-player/healing-suggestions/review?action=approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId,
          userId: "current-user-id", // TODO: Get from auth context
          editedSelectorCandidates: editedCandidates,
          versionNotes: editedCandidates ? "Manually edited healing suggestion" : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to approve suggestion");
      }

      const result = await response.json();
      alert(`Success! Created new workflow version ${result.newVersion}`);
      setEditModal(null);
      loadSuggestions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve suggestion");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(suggestionId: string, reason?: string) {
    if (!confirm("Are you sure you want to reject this healing suggestion?")) {
      return;
    }

    try {
      setProcessingId(suggestionId);
      const response = await fetch("/api/guided-workflow-player/healing-suggestions/review?action=reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId,
          userId: "current-user-id", // TODO: Get from auth context
          reason,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to reject suggestion");
      }

      alert("Suggestion rejected");
      loadSuggestions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reject suggestion");
    } finally {
      setProcessingId(null);
    }
  }

  function openEditModal(suggestion: HealingSuggestion) {
    setEditModal({
      suggestion,
      editedCandidates: [...suggestion.proposed_selector_candidates],
    });
  }

  if (loading) {
    return <div className="p-6 text-center">Loading healing suggestions...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          Error: {error}
        </div>
        <button
          onClick={loadSuggestions}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Workflow Self-Healing Suggestions</h2>
        <p className="text-gray-600 mt-1">
          Review and approve healing suggestions from automated workflow playback
        </p>
      </div>

      {suggestions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-600 text-lg">No pending healing suggestions</p>
          <p className="text-gray-500 text-sm mt-2">
            Suggestions will appear here when workflows encounter missing controls during playback
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {suggestions.map((suggestion) => (
            <div key={suggestion.id} className="bg-white border border-gray-200 rounded-lg shadow-sm">
              <div className="p-4 border-b border-gray-200 bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900">{suggestion.workflow_title}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Step {suggestion.step_order} • ID: {suggestion.step_id}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => openEditModal(suggestion)}
                      disabled={processingId === suggestion.id}
                      className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleApprove(suggestion.id)}
                      disabled={processingId === suggestion.id}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                    >
                      {processingId === suggestion.id ? "Processing..." : "Approve"}
                    </button>
                    <button
                      onClick={() => handleReject(suggestion.id)}
                      disabled={processingId === suggestion.id}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-semibold text-gray-700">Confidence:</span>{" "}
                    <span
                      className={`font-bold ${
                        suggestion.confidence_score >= 95
                          ? "text-green-600"
                          : suggestion.confidence_score >= 75
                          ? "text-yellow-600"
                          : "text-orange-600"
                      }`}
                    >
                      {suggestion.confidence_score.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Source:</span>{" "}
                    <span className="text-gray-900">
                      {suggestion.healing_source === "ai-assisted" ? "AI-Assisted" : "Rule-Based"}
                    </span>
                  </div>
                  {suggestion.ai_provider && (
                    <div className="col-span-2">
                      <span className="font-semibold text-gray-700">AI Provider:</span>{" "}
                      <span className="text-gray-900">
                        {suggestion.ai_provider} / {suggestion.ai_model}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Healing Reason:</p>
                  <p className="text-sm text-gray-900 mt-1">{suggestion.healing_reason}</p>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700">Page Context:</p>
                  <p className="text-sm text-gray-600 mt-1">{suggestion.page_title || suggestion.page_url}</p>
                  <a
                    href={suggestion.page_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {suggestion.page_url}
                  </a>
                </div>

                <div className="pt-2 border-t border-gray-100">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Proposed Selector Candidates:</p>
                  <div className="space-y-1">
                    {suggestion.proposed_selector_candidates.map((candidate, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-2 rounded">
                        <span className="font-mono text-xs bg-gray-200 px-2 py-1 rounded">{candidate.type}</span>
                        <span className="flex-1 truncate text-gray-900">{candidate.value}</span>
                        <span className="text-xs text-gray-600">{candidate.confidence}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                  <span>Attempts: {suggestion.playback_attempt_count}</span>
                  <span>
                    Last: {new Date(suggestion.last_playback_attempt_at).toLocaleDateString()}{" "}
                    {new Date(suggestion.last_playback_attempt_at).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {editModal && (
        <EditModal
          data={editModal}
          onSave={(edited) => handleApprove(editModal.suggestion.id, edited)}
          onClose={() => setEditModal(null)}
          processing={processingId === editModal.suggestion.id}
        />
      )}
    </div>
  );
}

function EditModal({
  data,
  onSave,
  onClose,
  processing,
}: {
  data: EditModalData;
  onSave: (edited: SelectorCandidate[]) => void;
  onClose: () => void;
  processing: boolean;
}) {
  const [candidates, setCandidates] = useState(data.editedCandidates);

  function updateCandidate(index: number, field: keyof SelectorCandidate, value: string | number) {
    const updated = [...candidates];
    updated[index] = { ...updated[index], [field]: value };
    setCandidates(updated);
  }

  function removeCandidate(index: number) {
    setCandidates(candidates.filter((_, i) => i !== index));
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-xl font-bold text-gray-900">Edit Healing Suggestion</h3>
          <p className="text-sm text-gray-600 mt-1">{data.suggestion.workflow_title}</p>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-700">
            Edit the proposed selector candidates before approving. You can modify values, confidence scores, or remove
            candidates.
          </p>

          {candidates.map((candidate, idx) => (
            <div key={idx} className="bg-gray-50 p-4 rounded border border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-gray-900">Candidate {idx + 1}</span>
                <button
                  onClick={() => removeCandidate(idx)}
                  className="text-red-600 hover:text-red-700 text-sm"
                  disabled={processing}
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <input
                    type="text"
                    value={candidate.type}
                    onChange={(e) => updateCandidate(idx, "type", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    disabled={processing}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confidence</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={candidate.confidence}
                    onChange={(e) => updateCandidate(idx, "confidence", Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    disabled={processing}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                  <input
                    type="text"
                    value={candidate.value}
                    onChange={(e) => updateCandidate(idx, "value", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono"
                    disabled={processing}
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input
                    type="text"
                    value={candidate.reason}
                    onChange={(e) => updateCandidate(idx, "reason", e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                    disabled={processing}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={processing}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(candidates)}
            disabled={processing || candidates.length === 0}
            className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {processing ? "Saving..." : "Save & Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}
