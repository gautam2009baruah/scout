"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileUp, FolderPlus, KeyRound, Loader2, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import { TopicTree, type TopicActionTarget, type TopicCreateTarget } from "./topic-tree";
import type { RoleSummary } from "@/lib/admin/administration";
import type { TopicAccessGrant, TopicCompanyOption, TopicRow, TopicTreeNode, TopicUserOption } from "@/lib/admin/content-structure";

type TopicManagerProps = {
  canManageAccess: boolean;
  companies: TopicCompanyOption[];
  grants: TopicAccessGrant[];
  roles: RoleSummary[];
  topics: TopicRow[];
  tree: TopicTreeNode[];
  users: TopicUserOption[];
};

type FormState = {
  message: string;
  status: "idle" | "submitting" | "success" | "error";
};

type DocumentGridRow = {
  id: string;
  name: string;
  originalFilename: string;
  fileType: string;
  mimeType: string | null;
  fileSize: number;
  version: number;
  status: string;
  uploadedByName: string;
  errorMessage: string | null;
  roleAccessCount: number;
  userAccessCount: number;
  canDelete: boolean;
  createdAt: string;
  updatedAt: string;
};

type DocumentGridState = {
  documents: DocumentGridRow[];
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

function filterTreeByCompany(nodes: TopicTreeNode[], companyId: string): TopicTreeNode[] {
  return nodes
    .filter((node) => node.companyId === companyId)
    .map((node) => ({ ...node, children: filterTreeByCompany(node.children, companyId) }));
}

function ReadOnlyAccess({ all, label, names }: { all: boolean; label: string; names: string[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500">
          <input checked={all} className="h-4 w-4 rounded border-slate-300" disabled readOnly type="checkbox" />
          All
        </label>
      </div>
      {!all ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {names.length ? names.join(", ") : "No custom access"}
        </div>
      ) : null}
    </div>
  );
}

export function TopicManager({ canManageAccess, companies, grants, roles, topics, tree, users }: TopicManagerProps) {
  const router = useRouter();
  const [topicState, setTopicState] = useState<FormState>({ message: "", status: "idle" });
  const [selectedTreeCompanyId, setSelectedTreeCompanyId] = useState(companies.length === 1 ? companies[0].id : "");
  const [createCompanyId, setCreateCompanyId] = useState(companies[0]?.id ?? "");
  const [createTarget, setCreateTarget] = useState<TopicCreateTarget | null>(null);
  const [editTarget, setEditTarget] = useState<TopicActionTarget | null>(null);
  const [uploadTarget, setUploadTarget] = useState<TopicActionTarget | null>(null);
  const [documentsTarget, setDocumentsTarget] = useState<TopicActionTarget | null>(null);
  const [accessDocument, setAccessDocument] = useState<DocumentGridRow | null>(null);
  const [folderAccessTarget, setFolderAccessTarget] = useState<TopicActionTarget | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressLabel, setUploadProgressLabel] = useState("");
  const [documentGrid, setDocumentGrid] = useState<DocumentGridState>({ documents: [], page: 1, pageCount: 1, pageSize: 8, total: 0 });
  const [documentFilters, setDocumentFilters] = useState({ fileType: "", search: "", status: "" });
  const [accessRoleIds, setAccessRoleIds] = useState<string[]>([]);
  const [accessUserIds, setAccessUserIds] = useState<string[]>([]);
  const [folderAccessRoleIds, setFolderAccessRoleIds] = useState<string[]>([]);
  const [folderAccessUserIds, setFolderAccessUserIds] = useState<string[]>([]);
  const [actionTarget, setActionTarget] = useState<TopicActionTarget | null>(null);
  const [createAllRoles, setCreateAllRoles] = useState(true);
  const [createAllUsers, setCreateAllUsers] = useState(true);
  const [createRoleIds, setCreateRoleIds] = useState<string[]>([]);
  const [createUserIds, setCreateUserIds] = useState<string[]>([]);
  const [editAllRoles, setEditAllRoles] = useState(true);
  const [editAllUsers, setEditAllUsers] = useState(true);
  const [editRoleIds, setEditRoleIds] = useState<string[]>([]);
  const [editUserIds, setEditUserIds] = useState<string[]>([]);

  const rootParentOptions = useMemo(
    () => topics.filter((topic) => topic.companyId === createCompanyId),
    [createCompanyId, topics]
  );
  const createRoleOptions = useMemo(
    () => roles.filter((role) => role.companyId === (createTarget?.companyId || createCompanyId)),
    [createCompanyId, createTarget?.companyId, roles]
  );
  const createUserOptions = useMemo(
    () => users.filter((user) => user.companyIds.includes(createTarget?.companyId || createCompanyId)),
    [createCompanyId, createTarget?.companyId, users]
  );
  const editRoleOptions = useMemo(
    () => roles.filter((role) => role.companyId === editTarget?.companyId),
    [editTarget?.companyId, roles]
  );
  const editUserOptions = useMemo(
    () => users.filter((user) => editTarget?.companyId ? user.companyIds.includes(editTarget.companyId) : false),
    [editTarget?.companyId, users]
  );
  const visibleTree = useMemo(
    () => selectedTreeCompanyId ? filterTreeByCompany(tree, selectedTreeCompanyId) : [],
    [selectedTreeCompanyId, tree]
  );
  const editRoleNames = useMemo(
    () => grants
      .filter((grant) => grant.type === "role" && grant.topicId === editTarget?.topicId && editRoleIds.includes(grant.assigneeId))
      .map((grant) => grant.assigneeName),
    [editRoleIds, editTarget?.topicId, grants]
  );
  const editUserNames = useMemo(
    () => grants
      .filter((grant) => grant.type === "user" && grant.topicId === editTarget?.topicId && editUserIds.includes(grant.assigneeId))
      .map((grant) => grant.assigneeName),
    [editTarget?.topicId, editUserIds, grants]
  );

  function openContextMenu(target: TopicActionTarget) {
    setActionTarget({
      ...target,
      x: Math.min(target.x, globalThis.window?.innerWidth ? window.innerWidth - 220 : target.x),
      y: Math.min(target.y + 8, globalThis.window?.innerHeight ? window.innerHeight - 80 : target.y)
    });
  }

  function openCreateModal(target: TopicCreateTarget) {
    setTopicState({ message: "", status: "idle" });
    setActionTarget(null);
    setCreateTarget(target);
    setCreateCompanyId(target.companyId || companies[0]?.id || "");
    setCreateAllRoles(true);
    setCreateAllUsers(true);
    setCreateRoleIds([]);
    setCreateUserIds([]);
  }

  function closeCreateModal() {
    setCreateTarget(null);
    setTopicState({ message: "", status: "idle" });
  }

  function openEditModal(target: TopicActionTarget) {
    setActionTarget(null);
    setTopicState({ message: "", status: "idle" });
    setEditTarget(target);

    const roleIds = grants
      .filter((grant) => grant.type === "role" && grant.topicId === target.topicId)
      .map((grant) => grant.assigneeId);
    const userIds = grants
      .filter((grant) => grant.type === "user" && grant.topicId === target.topicId)
      .map((grant) => grant.assigneeId);
    const roleAccessAll = target.roleAccessAll ?? true;
    const userAccessAll = target.userAccessAll ?? true;

    setEditAllRoles(roleAccessAll);
    setEditAllUsers(userAccessAll);
    setEditRoleIds(roleAccessAll ? [] : roleIds);
    setEditUserIds(userAccessAll ? [] : userIds);
  }

  function closeEditModal() {
    setEditTarget(null);
    setTopicState({ message: "", status: "idle" });
  }

  function openUploadModal(target: TopicActionTarget) {
    setActionTarget(null);
    setTopicState({ message: "", status: "idle" });
    setUploadTarget(target);
    setUploadFiles([]);
    setUploadProgress(0);
    setUploadProgressLabel("");
  }

  function closeUploadModal() {
    setUploadTarget(null);
    setUploadFiles([]);
    setUploadProgress(0);
    setUploadProgressLabel("");
    setTopicState({ message: "", status: "idle" });
  }

  async function loadDocuments(target: TopicActionTarget, page = 1, filters = documentFilters) {
    if (!target.topicId) {
      return;
    }

    const params = new URLSearchParams({
      folderId: target.topicId,
      page: String(page),
      pageSize: String(documentGrid.pageSize)
    });

    if (filters.fileType) params.set("fileType", filters.fileType);
    if (filters.status) params.set("status", filters.status);
    if (filters.search) params.set("search", filters.search);

    const response = await fetch(`/api/admin/documents?${params.toString()}`);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setTopicState({ message: typeof body?.message === "string" ? body.message : "Unable to load documents.", status: "error" });
      return;
    }

    setDocumentGrid(body);
  }

  async function openDocumentsModal(target: TopicActionTarget) {
    setActionTarget(null);
    setTopicState({ message: "", status: "idle" });
    setDocumentsTarget(target);
    setDocumentFilters({ fileType: "", search: "", status: "" });
    await loadDocuments(target, 1, { fileType: "", search: "", status: "" });
  }

  function closeDocumentsModal() {
    setDocumentsTarget(null);
    setAccessDocument(null);
    setTopicState({ message: "", status: "idle" });
  }

  async function applyDocumentFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!documentsTarget) {
      return;
    }

    const form = new FormData(event.currentTarget);
    const nextFilters = {
      fileType: String(form.get("fileType") ?? ""),
      search: String(form.get("search") ?? ""),
      status: String(form.get("status") ?? "")
    };
    setDocumentFilters(nextFilters);
    await loadDocuments(documentsTarget, 1, nextFilters);
  }

  async function deleteDocument(row: DocumentGridRow) {
    if (!documentsTarget || !window.confirm(`Delete document "${row.name}"?`)) {
      return;
    }

    const response = await fetch(`/api/admin/documents/${row.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setTopicState({ message: typeof body?.message === "string" ? body.message : "Unable to delete document.", status: "error" });
      return;
    }

    setTopicState({ message: "Document deleted.", status: "success" });
    await loadDocuments(documentsTarget, documentGrid.page);
    router.refresh();
  }

  async function openAccessModal(row: DocumentGridRow) {
    const response = await fetch(`/api/admin/documents/${row.id}/access`);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setTopicState({ message: typeof body?.message === "string" ? body.message : "Unable to load document access.", status: "error" });
      return;
    }

    setAccessDocument(row);
    setAccessRoleIds(body.access.roleIds ?? []);
    setAccessUserIds(body.access.userIds ?? []);
  }

  async function openFolderAccessModal(target: TopicActionTarget) {
    if (!target.topicId) {
      return;
    }

    setActionTarget(null);
    const response = await fetch(`/api/admin/content-structure/${target.topicId}/chat-access`);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setTopicState({ message: typeof body?.message === "string" ? body.message : "Unable to load folder chat access.", status: "error" });
      return;
    }

    setFolderAccessTarget(target);
    setFolderAccessRoleIds(body.access.roleIds ?? []);
    setFolderAccessUserIds(body.access.userIds ?? []);
  }

  async function saveDocumentAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!accessDocument || !documentsTarget) {
      return;
    }

    const response = await fetch(`/api/admin/documents/${accessDocument.id}/access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleIds: accessRoleIds, userIds: accessUserIds })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setTopicState({ message: typeof body?.message === "string" ? body.message : "Unable to save document access.", status: "error" });
      return;
    }

    setAccessDocument(null);
    setTopicState({ message: "Document access updated.", status: "success" });
    await loadDocuments(documentsTarget, documentGrid.page);
  }

  async function saveFolderAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!folderAccessTarget?.topicId) {
      return;
    }

    const response = await fetch(`/api/admin/content-structure/${folderAccessTarget.topicId}/chat-access`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roleIds: folderAccessRoleIds, userIds: folderAccessUserIds })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setTopicState({ message: typeof body?.message === "string" ? body.message : "Unable to save folder chat access.", status: "error" });
      return;
    }

    setFolderAccessTarget(null);
    setTopicState({ message: "Folder chat access updated.", status: "success" });
  }

  function setCustomEditRoles(values: string[]) {
    setEditRoleIds(values);

    if (values.length > 0) {
      setEditAllRoles(false);
    }
  }

  function setCustomEditUsers(values: string[]) {
    setEditUserIds(values);

    if (values.length > 0) {
      setEditAllUsers(false);
    }
  }

  function setCustomCreateRoles(values: string[]) {
    setCreateRoleIds(values);

    if (values.length > 0) {
      setCreateAllRoles(false);
    }
  }

  function setCustomCreateUsers(values: string[]) {
    setCreateUserIds(values);

    if (values.length > 0) {
      setCreateAllUsers(false);
    }
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setTopicState({ message: "", status: "submitting" });

    const response = await fetch("/api/admin/content-structure", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: createTarget?.companyId || createCompanyId,
        parentId: createTarget?.parentId ?? String(form.get("parentId") ?? ""),
        name: String(form.get("name") ?? ""),
        allRoles: createAllRoles,
        allUsers: createAllUsers,
        roleIds: createAllRoles ? [] : createRoleIds,
        userIds: createAllUsers ? [] : createUserIds
      })
    });

    if (!response.ok) {
      setTopicState({ message: await readMessage(response, "Unable to create topic."), status: "error" });
      return;
    }

    formElement.reset();
    setCreateTarget(null);
    setCreateAllRoles(true);
    setCreateAllUsers(true);
    setCreateRoleIds([]);
    setCreateUserIds([]);
    setTopicState({ message: "Topic folder created.", status: "success" });
    router.refresh();
  }

  async function updateTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editTarget?.topicId) {
      return;
    }

    const form = new FormData(event.currentTarget);
    setTopicState({ message: "", status: "submitting" });

    const response = await fetch(`/api/admin/content-structure/${editTarget.topicId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        allRoles: editAllRoles,
        allUsers: editAllUsers,
        roleIds: editAllRoles ? [] : editRoleIds,
        userIds: editAllUsers ? [] : editUserIds
      })
    });

    if (!response.ok) {
      setTopicState({ message: await readMessage(response, "Unable to update topic."), status: "error" });
      return;
    }

    setEditTarget(null);
    setTopicState({ message: "Topic updated.", status: "success" });
    router.refresh();
  }

  async function deleteSelectedTopic(target: TopicActionTarget) {
    if (!target.topicId || !window.confirm(`Delete "${target.topicName}" and all of its subfolders?`)) {
      return;
    }

    setActionTarget(null);
    setTopicState({ message: "", status: "submitting" });

    const response = await fetch(`/api/admin/content-structure/${target.topicId}`, { method: "DELETE" });

    if (!response.ok) {
      setTopicState({ message: await readMessage(response, "Unable to delete topic."), status: "error" });
      return;
    }

    setTopicState({ message: "Topic deleted.", status: "success" });
    router.refresh();
  }

  function uploadWithProgress(form: FormData) {
    return new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          setUploadProgressLabel("Uploading files...");
          return;
        }

        const progress = Math.min(90, Math.round((event.loaded / event.total) * 90));
        setUploadProgress(progress);
        setUploadProgressLabel(`Uploading files ${progress}%`);
      };

      request.onload = () => {
        const body = request.responseText ? (() => {
          try {
            return JSON.parse(request.responseText);
          } catch {
            return null;
          }
        })() : null;

        if (request.status >= 200 && request.status < 300) {
          setUploadProgress(100);
          setUploadProgressLabel("Upload complete");
          resolve();
          return;
        }

        reject(new Error(typeof body?.message === "string" ? body.message : "Unable to upload files."));
      };

      request.onerror = () => reject(new Error("Network error while uploading files."));
      request.onabort = () => reject(new Error("Upload was cancelled."));
      request.open("POST", "/api/admin/documents");
      setUploadProgressLabel("Saving files...");
      request.send(form);
    });
  }

  async function registerUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!uploadTarget?.topicId || uploadFiles.length === 0) {
      setTopicState({ message: "Select at least one file.", status: "error" });
      return;
    }

    setTopicState({ message: "", status: "submitting" });
    setUploadProgress(2);
    setUploadProgressLabel("Preparing upload...");

    const form = new FormData();
    form.set("companyId", uploadTarget.companyId);
    form.set("folderId", uploadTarget.topicId);
    uploadFiles.forEach((file) => form.append("files", file));

    try {
      await uploadWithProgress(form);
    } catch (error) {
      setTopicState({ message: error instanceof Error ? error.message : "Unable to upload files.", status: "error" });
      setUploadProgress(0);
      setUploadProgressLabel("");
      return;
    }

    setUploadTarget(null);
    setUploadFiles([]);
    setUploadProgress(0);
    setUploadProgressLabel("");
    setTopicState({ message: "Document metadata registered.", status: "success" });
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section>
        <TopicTree
          canCreateRoot={canManageAccess}
          companies={companies}
          onCompanyChange={setSelectedTreeCompanyId}
          onOpenMenu={openContextMenu}
          selectedCompanyId={selectedTreeCompanyId}
          tree={visibleTree}
        />
      </section>

      {actionTarget ? (
        <div className="fixed inset-0 z-40" onClick={() => setActionTarget(null)}>
          <div
            className="absolute w-48 rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
            style={{
              left: actionTarget.x,
              top: actionTarget.y
            }}
          >
            <button
              className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
              onClick={() => openCreateModal(actionTarget)}
              type="button"
            >
              <FolderPlus className="h-4 w-4 text-emerald-600" />
              Create
            </button>
            {actionTarget.topicId ? (
              <>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-sky-700 hover:bg-sky-50"
                  onClick={() => openEditModal(actionTarget)}
                  type="button"
                >
                  <Pencil className="h-4 w-4 text-sky-600" />
                  Edit
                </button>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-violet-700 hover:bg-violet-50"
                  onClick={() => openUploadModal(actionTarget)}
                  type="button"
                >
                  <FileUp className="h-4 w-4 text-violet-600" />
                  Upload
                </button>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  onClick={() => openDocumentsModal(actionTarget)}
                  type="button"
                >
                  <FileText className="h-4 w-4 text-slate-600" />
                  Documents
                </button>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-teal-700 hover:bg-teal-50"
                  onClick={() => openFolderAccessModal(actionTarget)}
                  type="button"
                >
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  Chat Access
                </button>
                <button
                  className={`flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold ${
                    canManageAccess
                      ? "text-red-700 hover:bg-red-50"
                      : "cursor-not-allowed text-slate-400"
                  }`}
                  disabled={!canManageAccess}
                  onClick={() => canManageAccess ? deleteSelectedTopic(actionTarget) : undefined}
                  type="button"
                >
                  <Trash2 className={`h-4 w-4 ${canManageAccess ? "text-red-600" : "text-slate-400"}`} />
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {documentsTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={closeDocumentsModal}>
          <div className="flex max-h-[86vh] w-full max-w-6xl flex-col rounded-lg border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-lg font-semibold tracking-normal text-slate-950">Documents</h2>
                  <p className="text-sm text-slate-500">{documentsTarget.topicName} | {documentGrid.total} files</p>
                </div>
              </div>
              <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={closeDocumentsModal} type="button">
                Close
              </button>
            </div>

            <form className="grid gap-2 border-b border-slate-200 px-5 py-3 md:grid-cols-[minmax(180px,1fr)_130px_150px_auto]" onSubmit={applyDocumentFilters}>
              <input className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900" defaultValue={documentFilters.search} name="search" placeholder="Search name or filename" />
              <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" defaultValue={documentFilters.fileType} name="fileType">
                <option value="">All types</option>
                {["pdf", "docx", "txt", "csv", "xlsx", "pptx"].map((type) => <option key={type} value={type}>{type.toUpperCase()}</option>)}
              </select>
              <select className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" defaultValue={documentFilters.status} name="status">
                <option value="">All statuses</option>
                {["uploaded", "queued", "processing", "parsed", "chunked", "embedded", "indexed", "failed"].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
              <button className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" type="submit">Filter</button>
            </form>

            {topicState.message ? (
              <p className={`mx-5 mt-3 rounded-lg px-3 py-2 text-sm ${topicState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {topicState.message}
              </p>
            ) : null}

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-slate-950 text-white">
                  <tr>
                    <th className="px-3 py-3 font-medium">No.</th>
                    <th className="px-3 py-3 font-medium">Document</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Size</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Version</th>
                    <th className="px-3 py-3 font-medium">Access</th>
                    <th className="px-3 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {documentGrid.documents.map((document, index) => (
                    <tr className="align-top" key={document.id}>
                      <td className="px-3 py-3 font-semibold text-slate-500">{(documentGrid.page - 1) * documentGrid.pageSize + index + 1}</td>
                      <td className="px-3 py-3">
                        <p className="font-semibold text-slate-950">{document.name}</p>
                        <p className="max-w-64 truncate text-xs text-slate-500">{document.originalFilename}</p>
                        <p className="text-xs text-slate-400">By {document.uploadedByName}</p>
                      </td>
                      <td className="px-3 py-3 uppercase text-slate-600">{document.fileType}</td>
                      <td className="px-3 py-3 text-slate-600">{Math.ceil(document.fileSize / 1024)} KB</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{document.status}</span>
                        {document.errorMessage ? <p className="mt-1 max-w-40 text-xs text-red-600">{document.errorMessage}</p> : null}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{document.version}</td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {document.roleAccessCount + document.userAccessCount > 0 ? `${document.roleAccessCount} roles | ${document.userAccessCount} users` : "Folder access"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 text-sky-700 hover:bg-sky-50" onClick={() => openAccessModal(document)} title="Access" type="button">
                            <ShieldCheck className="h-4 w-4" />
                          </button>
                          {document.canDelete ? (
                            <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50" onClick={() => deleteDocument(document)} title="Delete" type="button">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {documentGrid.documents.length === 0 ? (
                    <tr>
                      <td className="px-3 py-8 text-center text-slate-500" colSpan={8}>No documents found.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
              <p className="text-sm text-slate-500">Page {documentGrid.page} of {documentGrid.pageCount}</p>
              <div className="flex gap-2">
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={documentGrid.page <= 1} onClick={() => loadDocuments(documentsTarget, Math.max(1, documentGrid.page - 1))} type="button">Previous</button>
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={documentGrid.page >= documentGrid.pageCount} onClick={() => loadDocuments(documentsTarget, Math.min(documentGrid.pageCount, documentGrid.page + 1))} type="button">Next</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {accessDocument && documentsTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={() => setAccessDocument(null)}>
          <form className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={saveDocumentAccess}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Document access</h2>
                <p className="text-sm text-slate-500">{accessDocument.name}</p>
              </div>
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Leave both lists empty to allow all users with folder access. Selecting roles or users makes this document restricted.
            </p>
            <div className="mt-4 space-y-4">
              <MultiSelectDropdown
                emptyLabel="All roles"
                label="Restrict to roles"
                onChange={setAccessRoleIds}
                options={roles.filter((role) => role.companyId === documentsTarget.companyId).map((role) => ({ label: role.name, value: role.id }))}
                selectedValues={accessRoleIds}
              />
              <MultiSelectDropdown
                emptyLabel="All users"
                label="Restrict to users"
                onChange={setAccessUserIds}
                options={users.filter((user) => user.companyIds.includes(documentsTarget.companyId)).map((user) => ({ label: user.name, value: user.id }))}
                selectedValues={accessUserIds}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setAccessDocument(null)} type="button">Cancel</button>
              <button className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700" type="submit">Save access</button>
            </div>
          </form>
        </div>
      ) : null}

      {folderAccessTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={() => setFolderAccessTarget(null)}>
          <form className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={saveFolderAccess}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Chat Access</h2>
                <p className="text-sm text-slate-500">{folderAccessTarget.topicName}</p>
              </div>
            </div>
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Leave both lists empty to allow chatbot retrieval from this folder for all users with folder access. Selecting roles or users restricts retrieval for this folder. Document access still overrides this.
            </p>
            <div className="mt-4 space-y-4">
              <MultiSelectDropdown
                emptyLabel="All roles"
                label="Restrict to roles"
                onChange={setFolderAccessRoleIds}
                options={roles.filter((role) => role.companyId === folderAccessTarget.companyId).map((role) => ({ label: role.name, value: role.id }))}
                selectedValues={folderAccessRoleIds}
              />
              <MultiSelectDropdown
                emptyLabel="All users"
                label="Restrict to users"
                onChange={setFolderAccessUserIds}
                options={users.filter((user) => user.companyIds.includes(folderAccessTarget.companyId)).map((user) => ({ label: user.name, value: user.id }))}
                selectedValues={folderAccessUserIds}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={() => setFolderAccessTarget(null)} type="button">Cancel</button>
              <button className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700" type="submit">Save access</button>
            </div>
          </form>
        </div>
      ) : null}

      {uploadTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={closeUploadModal}>
          <form className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={registerUpload}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white">
                <FileUp className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Upload documents</h2>
                <p className="text-sm text-slate-500">{uploadTarget.topicName}</p>
              </div>
            </div>

            <label className="mt-5 block rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-violet-300 hover:bg-violet-50/50">
              <input
                accept=".pdf,.docx,.txt,.csv,.xlsx,.pptx"
                className="sr-only"
                multiple
                onChange={(event) => setUploadFiles(Array.from(event.target.files ?? []))}
                type="file"
              />
              <span className="text-sm font-semibold text-slate-800">Choose files</span>
              <span className="mt-1 block text-xs text-slate-500">PDF, DOCX, TXT, CSV, XLSX, PPTX</span>
            </label>

            {uploadFiles.length ? (
              <div className="mt-3 max-h-32 overflow-auto rounded-lg border border-slate-200">
                {uploadFiles.map((file) => (
                  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0" key={`${file.name}-${file.lastModified}`}>
                    <span className="truncate text-sm font-medium text-slate-700">{file.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{Math.ceil(file.size / 1024)} KB</span>
                  </div>
                ))}
              </div>
            ) : null}

            {topicState.status === "submitting" ? (
              <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-violet-700">
                  <span>{uploadProgressLabel || "Uploading files..."}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-violet-600 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            ) : null}

            {topicState.message ? (
              <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${topicState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {topicState.message}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={topicState.status === "submitting"} onClick={closeUploadModal} type="button">
                Cancel
              </button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-70" disabled={topicState.status === "submitting"} type="submit">
                {topicState.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                Register
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {createTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={closeCreateModal}>
          <form className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={createTopic}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
                <FolderPlus className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Create folder</h2>
                <p className="text-sm text-slate-500">Under {createTarget.parentName}</p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {!createTarget.parentId && canManageAccess ? (
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">Parent folder</span>
                  <select className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" name="parentId">
                    <option value="">Root folder</option>
                    {rootParentOptions.map((topic) => (
                      <option key={topic.id} value={topic.id}>{topic.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Folder name</span>
                <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 transition focus-within:border-slate-900 focus-within:ring-4 focus:ring-slate-900/10">
                  <KeyRound className="h-4 w-4 text-slate-400" />
                  <input className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" name="name" placeholder="Payslip" required />
                </span>
              </label>

              {canManageAccess ? (
                <>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700">Roles</span>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input checked={createAllRoles} className="h-4 w-4 rounded border-slate-300" onChange={(event) => {
                          setCreateAllRoles(event.target.checked);
                          if (event.target.checked) {
                            setCreateRoleIds([]);
                          }
                        }} type="checkbox" />
                        All
                      </label>
                    </div>
                    <div className={createAllRoles ? "pointer-events-none opacity-50" : ""}>
                      <MultiSelectDropdown
                        emptyLabel="Select roles"
                        label="Role access"
                        onChange={setCustomCreateRoles}
                        options={createRoleOptions.map((role) => ({ label: role.name, value: role.id }))}
                        selectedValues={createRoleIds}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-slate-700">Users</span>
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <input checked={createAllUsers} className="h-4 w-4 rounded border-slate-300" onChange={(event) => {
                          setCreateAllUsers(event.target.checked);
                          if (event.target.checked) {
                            setCreateUserIds([]);
                          }
                        }} type="checkbox" />
                        All
                      </label>
                    </div>
                    <div className={createAllUsers ? "pointer-events-none opacity-50" : ""}>
                      <MultiSelectDropdown
                        emptyLabel="Select users"
                        label="User access"
                        onChange={setCustomCreateUsers}
                        options={createUserOptions.map((user) => ({ label: user.name, value: user.id }))}
                        selectedValues={createUserIds}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <ReadOnlyAccess all label="Roles" names={[]} />
                  <ReadOnlyAccess all label="Users" names={[]} />
                </>
              )}
            </div>

            {topicState.message ? (
              <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${topicState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {topicState.message}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={closeCreateModal} type="button">
                Cancel
              </button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70" disabled={topicState.status === "submitting"} type="submit">
                {topicState.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
                Create folder
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 py-6" onClick={closeEditModal}>
          <form className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={updateTopic}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-600 text-white">
                <Pencil className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Edit folder</h2>
                <p className="text-sm text-slate-500">{editTarget.topicName}</p>
              </div>
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Folder name</span>
              <span className="mt-2 flex h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 transition focus-within:border-slate-900 focus-within:ring-4 focus:ring-slate-900/10">
                <KeyRound className="h-4 w-4 text-slate-400" />
                <input className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none" defaultValue={editTarget.topicName} name="name" required />
              </span>
            </label>

            {canManageAccess ? (
              <div className="mt-5 space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700">Roles</span>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <input checked={editAllRoles} className="h-4 w-4 rounded border-slate-300" onChange={(event) => {
                        setEditAllRoles(event.target.checked);
                        if (event.target.checked) {
                          setEditRoleIds([]);
                        }
                      }} type="checkbox" />
                      All
                    </label>
                  </div>
                  <div className={editAllRoles ? "pointer-events-none opacity-50" : ""}>
                    <MultiSelectDropdown
                      emptyLabel="Select roles"
                      label="Role access"
                      onChange={setCustomEditRoles}
                      options={editRoleOptions.map((role) => ({ label: role.name, value: role.id }))}
                      selectedValues={editRoleIds}
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-700">Users</span>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <input checked={editAllUsers} className="h-4 w-4 rounded border-slate-300" onChange={(event) => {
                        setEditAllUsers(event.target.checked);
                        if (event.target.checked) {
                          setEditUserIds([]);
                        }
                      }} type="checkbox" />
                      All
                    </label>
                  </div>
                  <div className={editAllUsers ? "pointer-events-none opacity-50" : ""}>
                    <MultiSelectDropdown
                      emptyLabel="Select users"
                      label="User access"
                      onChange={setCustomEditUsers}
                      options={editUserOptions.map((user) => ({ label: user.name, value: user.id }))}
                      selectedValues={editUserIds}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <ReadOnlyAccess all={editAllRoles} label="Roles" names={editRoleNames} />
                <ReadOnlyAccess all={editAllUsers} label="Users" names={editUserNames} />
              </div>
            )}

            {topicState.message ? (
              <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${topicState.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
                {topicState.message}
              </p>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={closeEditModal} type="button">
                Cancel
              </button>
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-70" disabled={topicState.status === "submitting"} type="submit">
                {topicState.status === "submitting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                Save
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
