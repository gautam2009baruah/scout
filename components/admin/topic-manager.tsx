"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cloud, Download, FileText, FileUp, FolderPlus, Globe2, KeyRound, Link2, Loader2, Network, Pencil, Plus, Rss, Settings2, ShieldCheck, Trash2, X } from "lucide-react";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import { TopicTree, type TopicActionTarget, type TopicCreateTarget } from "./topic-tree";
import type { RoleSummary } from "@/lib/admin/administration";
import type { TopicAccessGrant, TopicRow, TopicTreeNode, TopicUserOption } from "@/lib/admin/content-structure";

type TopicManagerProps = {
  canManageAccess: boolean;
  grants: TopicAccessGrant[];
  roles: RoleSummary[];
  selectedCompanyId: string;
  selectedCompanyName?: string;
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

type DocumentStorageMode = "managed_upload" | "external_reference" | "strict_external_reference";
type IngestionSourceType = "upload" | "web_url" | "crawler" | "sitemap" | "rss" | "google_drive" | "sharepoint";
type SourceAuth = { authType: string; credentialName: string; tenantId: string; clientId: string; clientSecret: string; accessToken: string; serviceAccountJson: string };

type ExternalReferenceRow = {
  id: string;
  sourceKind: "file" | "folder";
  externalSourceUrl: string;
  originalFilename: string;
  fileType: string;
  sourceMetadata: string;
};

type DocumentProgressRow = {
  id: string;
  label: string;
  status: string;
  progress: number;
  error?: string;
  documentId?: string;
};

const supportedFileTypes = ["pdf", "docx", "pptx", "xlsx", "csv", "txt", "md", "html", "json", "xml", "epub", "png", "jpg", "jpeg", "webp", "tiff", "zip"];

const ingestionSources = [
  { value: "upload", label: "Upload", description: "Files from your device", icon: FileUp },
  { value: "web_url", label: "Web page", description: "One public URL", icon: Link2 },
  { value: "crawler", label: "Website", description: "Crawl linked pages", icon: Globe2 },
  { value: "sitemap", label: "Sitemap", description: "Import sitemap URLs", icon: Network },
  { value: "rss", label: "RSS feed", description: "Sync new articles", icon: Rss },
  { value: "google_drive", label: "Google Drive", description: "Files and folders", icon: Cloud },
  { value: "sharepoint", label: "SharePoint", description: "Sites and libraries", icon: Cloud }
] as const;

const documentStorageModeOptions: Array<{
  value: DocumentStorageMode;
  label: string;
  description: string;
  details: string[];
}> = [
  {
    value: "managed_upload",
    label: "Managed upload",
    description: "Best when Scout should keep the original file as the system of record.",
    details: [
      "Store original file permanently",
      "Store parsed output if needed",
      "Store chunks",
      "Store embeddings"
    ]
  },
  {
    value: "external_reference",
    label: "External reference",
    description: "Best when the source lives elsewhere, but Scout can keep enough processed data for search.",
    details: [
      "Do not store original file permanently",
      "Temporary file allowed during processing",
      "Store chunks",
      "Store embeddings",
      "Store source metadata",
      "Store citation metadata",
      "Store external source link/reference"
    ]
  },
  {
    value: "strict_external_reference",
    label: "Strict external",
    description: "Best for strict retention policies where only retrieval-ready data should remain.",
    details: [
      "Do not store original file permanently",
      "Do not store full parsed text permanently",
      "Temporary file/text allowed only during processing",
      "Delete temp file/text after chunking and embedding",
      "Store only chunks, embeddings, source metadata, citation metadata"
    ]
  }
];

async function readMessage(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.message === "string" ? body.message : fallback;
}

function createExternalReferenceRow(): ExternalReferenceRow {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `external-${Date.now()}-${Math.random()}`,
    sourceKind: "file",
    externalSourceUrl: "",
    originalFilename: "",
    fileType: "pdf",
    sourceMetadata: ""
  };
}

function inferNameFromReference(reference: string) {
  try {
    const url = new URL(reference);
    return decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "") || "external-document";
  } catch {
    return reference.split(/[\\/]/).filter(Boolean).pop() || "external-document";
  }
}

function progressForDocumentStatus(status: string) {
  switch (status) {
    case "uploaded":
      return 30;
    case "queued":
      return 38;
    case "processing":
      return 58;
    case "parsed":
      return 70;
    case "chunked":
      return 82;
    case "embedded":
    case "indexed":
      return 100;
    case "failed":
      return 100;
    default:
      return 20;
  }
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

export function TopicManager({ canManageAccess, grants, roles, selectedCompanyId, selectedCompanyName, topics, tree, users }: TopicManagerProps) {
  const router = useRouter();
  const [topicState, setTopicState] = useState<FormState>({ message: "", status: "idle" });
  const createCompanyId = selectedCompanyId;
  const [createTarget, setCreateTarget] = useState<TopicCreateTarget | null>(null);
  const [editTarget, setEditTarget] = useState<TopicActionTarget | null>(null);
  const [uploadTarget, setUploadTarget] = useState<TopicActionTarget | null>(null);
  const [documentsTarget, setDocumentsTarget] = useState<TopicActionTarget | null>(null);
  const [accessDocument, setAccessDocument] = useState<DocumentGridRow | null>(null);
  const [folderAccessTarget, setFolderAccessTarget] = useState<TopicActionTarget | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressLabel, setUploadProgressLabel] = useState("");
  const [documentStorageMode, setDocumentStorageMode] = useState<DocumentStorageMode>("managed_upload");
  const [ingestionSource, setIngestionSource] = useState<IngestionSourceType>("upload");
  const [sourceAuth, setSourceAuth] = useState<SourceAuth>({ authType: "oauth_client", credentialName: "", tenantId: "", clientId: "", clientSecret: "", accessToken: "", serviceAccountJson: "" });
  const [crawlSettings, setCrawlSettings] = useState({ maxPages: 200, maxDepth: 4 });
  const [externalRows, setExternalRows] = useState<ExternalReferenceRow[]>([createExternalReferenceRow()]);
  const [documentProgressRows, setDocumentProgressRows] = useState<DocumentProgressRow[]>([]);
  const [documentGrid, setDocumentGrid] = useState<DocumentGridState>({ documents: [], page: 1, pageCount: 1, pageSize: 25, total: 0 });
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
    () => selectedCompanyId ? filterTreeByCompany(tree, selectedCompanyId) : [],
    [selectedCompanyId, tree]
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
  const selectedStorageMode = useMemo(
    () => documentStorageModeOptions.find((option) => option.value === documentStorageMode) ?? documentStorageModeOptions[0],
    [documentStorageMode]
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
    setDocumentStorageMode("managed_upload");
    setIngestionSource("upload");
    setSourceAuth({ authType: "oauth_client", credentialName: "", tenantId: "", clientId: "", clientSecret: "", accessToken: "", serviceAccountJson: "" });
    setExternalRows([createExternalReferenceRow()]);
    setDocumentProgressRows([]);
  }

  function closeUploadModal() {
    setUploadTarget(null);
    setUploadFiles([]);
    setUploadProgress(0);
    setUploadProgressLabel("");
    setDocumentStorageMode("managed_upload");
    setIngestionSource("upload");
    setSourceAuth({ authType: "oauth_client", credentialName: "", tenantId: "", clientId: "", clientSecret: "", accessToken: "", serviceAccountJson: "" });
    setExternalRows([createExternalReferenceRow()]);
    setDocumentProgressRows([]);
    setTopicState({ message: "", status: "idle" });
  }

  function updateExternalRow(id: string, patch: Partial<ExternalReferenceRow>) {
    setExternalRows((rows) => rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function addExternalReferenceRow() {
    setExternalRows((rows) => [...rows, createExternalReferenceRow()]);
  }

  function removeExternalReferenceRow(id: string) {
    setExternalRows((rows) => rows.length === 1 ? rows : rows.filter((row) => row.id !== id));
  }

  async function loadDocuments(target: TopicActionTarget, page = 1, filters = documentFilters, pageSize = documentGrid.pageSize) {
    if (!target.topicId) {
      return;
    }

    const params = new URLSearchParams({
      folderId: target.topicId,
      page: String(page),
      pageSize: String(pageSize)
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
    if (!target.topicId || !window.confirm(`Delete "${target.topicName}" and all of its subfolders? All documents, chunks, embeddings, processing records, and stored files inside them will be permanently deleted. Folder names are retained only for audit.`)) {
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

  function uploadWithProgress(form: FormData, rowId: string) {
    return new Promise<{ documents?: Array<{ id: string; originalFilename?: string; name?: string; status?: string; errorMessage?: string | null }> }>((resolve, reject) => {
      const request = new XMLHttpRequest();

      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          setUploadProgressLabel("Uploading files...");
          return;
        }

        const progress = Math.min(90, Math.round((event.loaded / event.total) * 90));
        setUploadProgressLabel("Uploading files in parallel...");
        setDocumentProgressRows((rows) => rows.map((row) => row.id === rowId ? { ...row, progress, status: "Uploading" } : row));
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
          resolve(body ?? {});
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

  async function pollRegisteredDocuments(documentIds: string[]) {
    if (!documentIds.length) {
      return;
    }

    const finalStatuses = new Set(["indexed", "failed", "deleted"]);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 350 : 1800));

      const documents = await Promise.all(
        documentIds.map(async (id) => {
          const response = await fetch(`/api/admin/documents/${id}`);
          if (!response.ok) {
            return null;
          }
          const body = await response.json().catch(() => null);
          return body?.document ?? null;
        })
      );

      const validDocuments = documents.filter(Boolean);

      setDocumentProgressRows((rows) => {
        const nextRows = rows.map((row) => {
          if (!row.documentId) {
            return row;
          }

          const document = validDocuments.find((item) => item.id === row.documentId);
          if (!document) {
            return row;
          }

          return {
            ...row,
            status: document.status,
            progress: progressForDocumentStatus(document.status),
            error: document.errorMessage ?? undefined
          };
        });
        const averageProgress = nextRows.length ? Math.round(nextRows.reduce((sum, row) => sum + row.progress, 0) / nextRows.length) : 0;

        setUploadProgress(averageProgress);
        setUploadProgressLabel(averageProgress >= 100 ? "Processing complete" : "Processing in background...");

        return nextRows;
      });

      if (validDocuments.length === documentIds.length && validDocuments.every((document) => finalStatuses.has(document.status))) {
        return;
      }
    }
  }

  async function registerUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!uploadTarget?.topicId) {
      setTopicState({ message: "Select a folder first.", status: "error" });
      return;
    }

    if (ingestionSource === "upload" && uploadFiles.length === 0) {
      setTopicState({ message: "Select at least one file.", status: "error" });
      return;
    }

    setTopicState({ message: "", status: "submitting" });
    setUploadProgress(2);
    setUploadProgressLabel(ingestionSource === "upload" ? "Preparing upload..." : "Connecting to source...");

    let createdDocuments: Array<{ id: string; originalFilename?: string; name?: string; status?: string; errorMessage?: string | null }> = [];
    let uploadFailureCount = 0;

    if (ingestionSource === "upload") {
      setDocumentProgressRows(uploadFiles.map((file) => ({
        id: `${file.name}-${file.lastModified}`,
        label: file.name,
        progress: 2,
        status: "Preparing"
      })));

      const results = await Promise.all(uploadFiles.map(async (file) => {
        const rowId = `${file.name}-${file.lastModified}`;
        const form = new FormData();
        form.set("companyId", uploadTarget.companyId);
        form.set("folderId", uploadTarget.topicId!);
        form.append("files", file);
        try {
          const body = await uploadWithProgress(form, rowId);
          return { documents: body.documents ?? [] };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unable to upload file.";
          setDocumentProgressRows((rows) => rows.map((row) => row.id === rowId ? { ...row, status: "Failed", progress: 100, error: message } : row));
          return { documents: [], error: message };
        }
      }));

      createdDocuments = results.flatMap((result) => result.documents);
      const failedCount = results.filter((result) => result.error).length;
      uploadFailureCount = failedCount;
      if (createdDocuments.length === 0) {
        setTopicState({ message: "None of the selected files could be uploaded.", status: "error" });
        return;
      }
      if (failedCount) setTopicState({ message: `${createdDocuments.length} file(s) queued; ${failedCount} failed to upload.`, status: "error" });
    } else {
      let credentialId: string | undefined;
      if (ingestionSource === "google_drive" || ingestionSource === "sharepoint") {
        if (!sourceAuth.credentialName.trim()) {
          setTopicState({ message: "Enter a connection name.", status: "error" });
          return;
        }
        const secret = sourceAuth.authType === "oauth_client"
          ? { clientSecret: sourceAuth.clientSecret }
          : sourceAuth.authType === "service_account"
            ? { serviceAccountJson: sourceAuth.serviceAccountJson }
            : { accessToken: sourceAuth.accessToken };
        const credentialResponse = await fetch("/api/admin/ingestion-credentials", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: ingestionSource,
            name: sourceAuth.credentialName,
            authType: sourceAuth.authType,
            publicConfig: { tenantId: sourceAuth.tenantId, clientId: sourceAuth.clientId },
            secret
          })
        });
        const credentialBody = await credentialResponse.json().catch(() => null);
        if (!credentialResponse.ok) {
          setTopicState({ message: credentialBody?.message || "Unable to save connection credentials.", status: "error" });
          return;
        }
        credentialId = credentialBody.credentialId;
      }

      const activeRows = externalRows
        .map((row) => ({ ...row, externalSourceUrl: row.externalSourceUrl.trim(), originalFilename: row.originalFilename.trim(), sourceMetadata: row.sourceMetadata.trim() }))
        .filter((row) => row.externalSourceUrl || row.originalFilename);

      if (activeRows.length === 0) {
        setTopicState({ message: "Add at least one external reference.", status: "error" });
        return;
      }

      const documents = [];

      for (const row of activeRows) {
        let sourceMetadata: Record<string, unknown> = {};

        if (row.sourceMetadata) {
          try {
            sourceMetadata = JSON.parse(row.sourceMetadata);
          } catch {
            setTopicState({ message: "Source metadata must be valid JSON.", status: "error" });
            return;
          }
        }

        documents.push({
          companyId: uploadTarget.companyId,
          folderId: uploadTarget.topicId,
          storageMode: documentStorageMode,
          externalSourceKind: row.sourceKind,
          externalSourceUrl: row.externalSourceUrl || undefined,
          externalSourceReference: row.externalSourceUrl || row.originalFilename,
          originalFilename: row.sourceKind === "folder" ? "external-folder" : row.originalFilename || inferNameFromReference(row.externalSourceUrl),
          fileType: row.fileType,
          fileSize: 0,
          sourceMetadata: { ...sourceMetadata, ingestion_source_type: ingestionSource, credential_reference: credentialId, max_pages: crawlSettings.maxPages, max_depth: crawlSettings.maxDepth }
        });
      }

      setDocumentProgressRows(documents.map((document, index) => ({
        id: activeRows[index].id,
        label: document.originalFilename,
        progress: 15,
        status: "Registering"
      })));

      try {
        const response = await fetch("/api/admin/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents })
        });

        const body = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(typeof body?.message === "string" ? body.message : "Unable to register references.");
        }

        createdDocuments = body?.documents ?? [];
        setDocumentProgressRows(createdDocuments.map((document) => ({
          id: document.id,
          documentId: document.id,
          label: document.originalFilename ?? document.name ?? document.id,
          progress: progressForDocumentStatus(document.status ?? "queued"),
          status: document.status ?? "queued",
          error: document.errorMessage ?? undefined
        })));
        setUploadProgress(38);
        setUploadProgressLabel("References queued");
      } catch (error) {
        setTopicState({ message: error instanceof Error ? error.message : "Unable to register references.", status: "error" });
        setDocumentProgressRows((rows) => rows.map((row) => ({ ...row, status: "Failed", progress: 100, error: error instanceof Error ? error.message : "Unable to register references." })));
        return;
      }
    }

    const createdByLabel = new Map(createdDocuments.map((document) => [document.originalFilename ?? document.name ?? document.id, document]));

    setDocumentProgressRows((rows) => {
      const nextRows = rows.map((row) => {
        const document = createdByLabel.get(row.label) ?? createdDocuments.find((item) => item.name === row.label || item.id === row.documentId);
        return document ? {
          ...row,
          documentId: document.id,
          status: document.status ?? "queued",
          progress: progressForDocumentStatus(document.status ?? "queued"),
          error: document.errorMessage ?? undefined
        } : row;
      });

      setUploadProgress(nextRows.length ? Math.round(nextRows.reduce((sum, row) => sum + row.progress, 0) / nextRows.length) : 0);
      setUploadProgressLabel("Documents queued");

      return nextRows;
    });

    setTopicState(uploadFailureCount > 0
      ? { message: `${createdDocuments.length} file(s) queued; ${uploadFailureCount} failed to upload.`, status: "error" }
      : { message: `${createdDocuments.length} document(s) queued for processing. You can close this window while processing continues.`, status: "success" });
    await pollRegisteredDocuments(createdDocuments.map((document) => document.id));
    router.refresh();
  }

  return (
    <div className="grid gap-6">
      <section>
        <TopicTree
          canCreateRoot={canManageAccess}
          onOpenMenu={openContextMenu}
          selectedCompanyId={selectedCompanyId}
          selectedCompanyName={selectedCompanyName}
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
              Create Folder
            </button>
            {actionTarget.topicId ? (
              <>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-sky-700 hover:bg-sky-50"
                  onClick={() => openEditModal(actionTarget)}
                  type="button"
                >
                  <Pencil className="h-4 w-4 text-sky-600" />
                  Edit Folder
                </button>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-violet-700 hover:bg-violet-50"
                  onClick={() => openUploadModal(actionTarget)}
                  type="button"
                >
                  <FileUp className="h-4 w-4 text-violet-600" />
                  Add Documents
                </button>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-100"
                  onClick={() => openDocumentsModal(actionTarget)}
                  type="button"
                >
                  <FileText className="h-4 w-4 text-slate-600" />
                  View Documents
                </button>
                <button
                  className="flex h-9 w-full items-center gap-2 rounded-md px-3 text-left text-sm font-semibold text-teal-700 hover:bg-teal-50"
                  onClick={() => openFolderAccessModal(actionTarget)}
                  type="button"
                >
                  <ShieldCheck className="h-4 w-4 text-teal-600" />
                  Chatbot Access
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
                  Delete Folder
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {documentsTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-2 sm:px-4 sm:py-6" onClick={closeDocumentsModal}>
          <div className="flex max-h-[calc(100vh-1rem)] w-full max-w-6xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl sm:max-h-[86vh]" onClick={(event) => event.stopPropagation()}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 sm:px-5 sm:py-4">
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

            <form className="grid gap-2 border-b border-slate-200 px-3 py-3 sm:px-5 md:grid-cols-[minmax(180px,1fr)_130px_150px_auto]" onSubmit={applyDocumentFilters}>
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

            <div className="min-h-0 flex-1 overflow-auto px-2 py-3 sm:px-5 sm:py-4">
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
                        <div className="flex max-w-72 items-center gap-2">
                          <p className="min-w-0 truncate font-semibold text-slate-950">{document.name}</p>
                          <a
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                            href={`/api/admin/documents/${document.id}/download`}
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
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

            <div className="flex flex-col gap-3 border-t border-slate-200 px-3 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                <span>Page <strong className="text-slate-900">{documentGrid.page}</strong> of <strong className="text-slate-900">{documentGrid.pageCount}</strong></span>
                <span>Total: <strong className="text-slate-900">{documentGrid.total}</strong> documents</span>
                <label className="inline-flex items-center gap-2">
                  <span>Page size</span>
                  <select
                    aria-label="Documents per page"
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                    onChange={(event) => loadDocuments(documentsTarget, 1, documentFilters, Number(event.target.value))}
                    value={documentGrid.pageSize}
                  >
                    {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={documentGrid.page <= 1} onClick={() => loadDocuments(documentsTarget, Math.max(1, documentGrid.page - 1))} type="button">Previous</button>
                {Array.from({ length: documentGrid.pageCount }, (_, index) => index + 1)
                  .filter((page) => page === 1 || page === documentGrid.pageCount || Math.abs(page - documentGrid.page) <= 1)
                  .map((page, index, pages) => (
                    <span className="contents" key={page}>
                      {index > 0 && page - pages[index - 1] > 1 ? <span className="px-1 text-slate-400">…</span> : null}
                      <button className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${page === documentGrid.page ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`} onClick={() => loadDocuments(documentsTarget, page)} type="button">{page}</button>
                    </span>
                  ))}
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
          <form className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} onSubmit={registerUpload}>
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-white">
                <FileUp className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Add documents</h2>
                <p className="text-sm text-slate-500">{uploadTarget.topicName}</p>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Choose a source</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {ingestionSources.map((source) => {
                  const active = source.value === ingestionSource;
                  return (
                    <button
                      className={`min-h-24 rounded-xl border p-3 text-left transition ${active ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                      disabled={topicState.status === "submitting"}
                      key={source.value}
                      onClick={() => {
                        setIngestionSource(source.value);
                        setDocumentStorageMode(source.value === "upload" ? "managed_upload" : "external_reference");
                        setExternalRows([{ ...createExternalReferenceRow(), sourceKind: source.value === "web_url" ? "file" : "folder", fileType: ["web_url", "crawler", "sitemap", "rss"].includes(source.value) ? "html" : "pdf" }]);
                        setDocumentProgressRows([]);
                        setTopicState({ message: "", status: "idle" });
                      }}
                      type="button"
                    >
                      <source.icon className={`h-4 w-4 ${active ? "text-violet-600" : "text-slate-500"}`} />
                      <span className={`mt-2 block text-xs font-semibold ${active ? "text-violet-900" : "text-slate-800"}`}>{source.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-4 text-slate-500">{source.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700">
                <span className="inline-flex items-center gap-2"><Settings2 className="h-4 w-4" /> Storage & retention</span>
                <span className="text-xs font-medium text-slate-500">{selectedStorageMode.label}</span>
              </summary>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {documentStorageModeOptions.filter((option) => ingestionSource === "upload" ? option.value === "managed_upload" : option.value !== "managed_upload").map((option) => {
                const active = option.value === documentStorageMode;

                return (
                  <button
                    className={`rounded-lg border px-3 py-3 text-left transition ${active ? "border-violet-300 bg-violet-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                    disabled={topicState.status === "submitting"}
                    key={option.value}
                    onClick={() => {
                      setDocumentStorageMode(option.value);
                      setDocumentProgressRows([]);
                      setTopicState({ message: "", status: "idle" });
                    }}
                    type="button"
                  >
                    <span className={`text-sm font-semibold ${active ? "text-violet-800" : "text-slate-800"}`}>{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-sm font-semibold text-slate-800">{selectedStorageMode.label}</div>
              <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                {selectedStorageMode.details.map((detail) => (
                  <div className="flex items-start gap-2 text-xs leading-5 text-slate-600" key={detail}>
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-violet-500" />
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
            </div>
            </details>

            {ingestionSource === "upload" ? (
              <>
                <label className="mt-5 block rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center transition hover:border-violet-300 hover:bg-violet-50/50">
                  <input
                    accept=".pdf,.docx,.pptx,.xlsx,.csv,.txt,.md,.html,.json,.xml,.epub,.png,.jpg,.jpeg,.webp,.tiff,.zip"
                    className="sr-only"
                    disabled={topicState.status === "submitting"}
                    multiple
                    onChange={(event) => {
                      setUploadFiles(Array.from(event.target.files ?? []));
                      setDocumentProgressRows([]);
                    }}
                    type="file"
                  />
                  <span className="text-sm font-semibold text-slate-800">Choose files</span>
                  <span className="mt-1 block text-xs text-slate-500">Documents, spreadsheets, web formats, images and ZIP archives</span>
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
              </>
            ) : (
              <div className="mt-5 space-y-3">
                {ingestionSource === "crawler" ? (
                  <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-slate-600">Maximum pages
                      <input className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" max={1000} min={1} onChange={(event) => setCrawlSettings((value) => ({ ...value, maxPages: Number(event.target.value) }))} type="number" value={crawlSettings.maxPages} />
                    </label>
                    <label className="text-xs font-semibold text-slate-600">Link depth
                      <input className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" max={10} min={0} onChange={(event) => setCrawlSettings((value) => ({ ...value, maxDepth: Number(event.target.value) }))} type="number" value={crawlSettings.maxDepth} />
                    </label>
                    <p className="text-xs leading-5 text-slate-500 sm:col-span-2">Follows same-domain links only. Tracking parameters, media assets, logout, cart and checkout URLs are skipped.</p>
                  </div>
                ) : null}
                {(ingestionSource === "google_drive" || ingestionSource === "sharepoint") ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><KeyRound className="h-4 w-4 text-violet-600" /> Connection credentials</div>
                    <p className="mt-1 text-xs text-slate-500">Secrets are encrypted and are never stored in document metadata.</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold text-slate-600">Connection name
                        <input className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-violet-400" onChange={(event) => setSourceAuth((value) => ({ ...value, credentialName: event.target.value }))} placeholder="Company knowledge drive" value={sourceAuth.credentialName} />
                      </label>
                      <label className="text-xs font-semibold text-slate-600">Authentication
                        <select className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" onChange={(event) => setSourceAuth((value) => ({ ...value, authType: event.target.value }))} value={sourceAuth.authType}>
                          <option value="oauth_client">OAuth client credentials</option>
                          {ingestionSource === "google_drive" ? <option value="service_account">Service account JSON</option> : null}
                          <option value="access_token">Existing access token</option>
                        </select>
                      </label>
                      {sourceAuth.authType === "oauth_client" ? <>
                        {ingestionSource === "sharepoint" ? <label className="text-xs font-semibold text-slate-600">Microsoft tenant ID<input className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" onChange={(event) => setSourceAuth((value) => ({ ...value, tenantId: event.target.value }))} value={sourceAuth.tenantId} /></label> : null}
                        <label className="text-xs font-semibold text-slate-600">Client ID<input className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" onChange={(event) => setSourceAuth((value) => ({ ...value, clientId: event.target.value }))} value={sourceAuth.clientId} /></label>
                        <label className="text-xs font-semibold text-slate-600">Client secret<input autoComplete="new-password" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" onChange={(event) => setSourceAuth((value) => ({ ...value, clientSecret: event.target.value }))} type="password" value={sourceAuth.clientSecret} /></label>
                      </> : null}
                      {sourceAuth.authType === "access_token" ? <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Access token<input autoComplete="off" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal" onChange={(event) => setSourceAuth((value) => ({ ...value, accessToken: event.target.value }))} type="password" value={sourceAuth.accessToken} /></label> : null}
                      {sourceAuth.authType === "service_account" ? <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Service account JSON<textarea className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 bg-white p-3 font-mono text-xs font-normal" onChange={(event) => setSourceAuth((value) => ({ ...value, serviceAccountJson: event.target.value }))} placeholder='{"type":"service_account", ...}' value={sourceAuth.serviceAccountJson} /></label> : null}
                    </div>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{ingestionSources.find((source) => source.value === ingestionSource)?.label} settings</div>
                    <div className="text-xs text-slate-500">Only the settings needed for this source are shown.</div>
                  </div>
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60" disabled={topicState.status === "submitting"} onClick={addExternalReferenceRow} type="button">
                    <Plus className="h-3.5 w-3.5" />
                    Add another
                  </button>
                </div>

                <div className="space-y-2">
                  {externalRows.map((row, index) => (
                    <div className="rounded-lg border border-slate-200 bg-white p-3" key={row.id}>
                      <div className="grid gap-2 md:grid-cols-[110px_1.4fr_1fr_110px_36px]">
                        <label className="block">
                          <span className="text-xs font-semibold text-slate-600">Scope</span>
                          <select className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm" disabled={topicState.status === "submitting"} onChange={(event) => updateExternalRow(row.id, { sourceKind: event.target.value as "file" | "folder" })} value={row.sourceKind}>
                            <option value="file">Single item</option>
                            <option value="folder">Collection</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold text-slate-600">{ingestionSource === "google_drive" ? "Drive file or folder URL" : ingestionSource === "sharepoint" ? "Site, library or file URL" : ingestionSource === "sitemap" ? "Sitemap.xml URL" : ingestionSource === "rss" ? "RSS or Atom feed URL" : ingestionSource === "crawler" ? "Website start URL" : "Page URL"}</span>
                          <div className="mt-1 flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 focus-within:border-slate-900 focus-within:ring-4 focus-within:ring-slate-900/10">
                            <Link2 className="h-4 w-4 text-slate-400" />
                            <input className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" disabled={topicState.status === "submitting"} onChange={(event) => updateExternalRow(row.id, { externalSourceUrl: event.target.value })} placeholder="https://example.com/..." value={row.externalSourceUrl} />
                          </div>
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold text-slate-600">Display filename</span>
                          <input className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10 disabled:bg-slate-50" disabled={topicState.status === "submitting" || row.sourceKind === "folder"} onChange={(event) => updateExternalRow(row.id, { originalFilename: event.target.value })} placeholder={row.sourceKind === "folder" ? "Discovered automatically" : `Reference ${index + 1}`} value={row.originalFilename} />
                        </label>
                        <label className="block">
                          <span className="text-xs font-semibold text-slate-600">Type</span>
                          <select className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10 disabled:bg-slate-50" disabled={topicState.status === "submitting" || row.sourceKind === "folder"} onChange={(event) => updateExternalRow(row.id, { fileType: event.target.value })} value={row.fileType}>
                            {supportedFileTypes.map((fileType) => (
                              <option key={fileType} value={fileType}>{fileType.toUpperCase()}</option>
                            ))}
                          </select>
                        </label>
                        <button className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40" disabled={topicState.status === "submitting" || externalRows.length === 1} onClick={() => removeExternalReferenceRow(row.id)} title="Remove row" type="button">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <label className="mt-2 block">
                        <span className="text-xs font-semibold text-slate-600">Source metadata JSON</span>
                        <textarea className="mt-1 min-h-16 w-full resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10" disabled={topicState.status === "submitting"} onChange={(event) => updateExternalRow(row.id, { sourceMetadata: event.target.value })} placeholder='{"owner":"Finance","source":"SharePoint"}' value={row.sourceMetadata} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {documentProgressRows.length ? (
              <div className="mt-4 rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs font-semibold text-violet-700">
                  <span>{uploadProgressLabel || "Processing documents..."}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-violet-600 transition-all duration-200"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="mt-3 max-h-36 space-y-2 overflow-auto">
                  {documentProgressRows.map((row) => (
                    <div className="rounded-md bg-white/80 px-2.5 py-2" key={row.id}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate font-semibold text-slate-700">{row.label}</span>
                        <span className={`shrink-0 font-semibold ${row.error ? "text-red-600" : "text-violet-700"}`}>{row.error ? "Failed" : row.status}</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full transition-all duration-300 ${row.error ? "bg-red-500" : "bg-violet-600"}`} style={{ width: `${row.progress}%` }} />
                      </div>
                      {row.error ? <div className="mt-1 text-xs text-red-600">{row.error}</div> : null}
                    </div>
                  ))}
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
                {ingestionSource === "upload" ? "Upload & process" : "Connect & import"}
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
