"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen, MoreVertical, Plus } from "lucide-react";
import type { TopicTreeNode } from "@/lib/admin/content-structure";
import type { TopicActionTarget } from "./topic-tree";

type TopicTreeListProps = {
  canCreateRoot: boolean;
  onOpenMenu: (target: TopicActionTarget) => void;
  selectedCompanyId: string;
  selectedCompanyName?: string;
  tree: TopicTreeNode[];
  accessibleTargetAppIds: string[];
};

function isRestrictedNode(node: TopicTreeNode, accessibleApps: Set<string>) {
  return Boolean(node.targetAppIds?.some((id) => !accessibleApps.has(id)));
}

function TopicListRow({
  accessibleApps,
  collapsedIds,
  depth,
  node,
  onOpenMenu,
  toggleCollapse
}: {
  accessibleApps: Set<string>;
  collapsedIds: Set<string>;
  depth: number;
  node: TopicTreeNode;
  onOpenMenu: (target: TopicActionTarget) => void;
  toggleCollapse: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const restricted = isRestrictedNode(node, accessibleApps);

  function openMenu(event: React.MouseEvent) {
    event.stopPropagation();
    if (restricted) return;

    onOpenMenu({
      companyId: node.companyId,
      companyName: node.companyName,
      parentId: node.id,
      parentName: node.name,
      roleAccessAll: node.roleAccessAll,
      topicId: node.id,
      topicName: node.name,
      targetAppIds: node.targetAppIds ?? [],
      targetAppNames: node.targetAppNames ?? [],
      userAccessAll: node.userAccessAll,
      x: event.clientX,
      y: event.clientY
    });
  }

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 rounded-md py-1.5 pr-1.5 ${restricted ? "cursor-default" : "cursor-pointer hover:bg-slate-100"}`}
        onClick={() => hasChildren && toggleCollapse(node.id)}
        style={{ paddingLeft: depth * 20 + 4 }}
        title={restricted
          ? `You cannot edit this folder because you do not have access to its assigned target app${(node.targetAppNames?.length ?? 0) === 1 ? "" : "s"}: ${node.targetAppNames?.join(", ") || "Restricted target app"}.`
          : undefined}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-400">
          {hasChildren ? (
            collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />
          ) : null}
        </span>

        <span className={`flex h-5 w-5 shrink-0 items-center justify-center ${restricted ? "text-slate-300" : "text-amber-500"}`}>
          {hasChildren && !collapsed ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
        </span>

        <span className={`truncate text-sm font-medium ${restricted ? "text-slate-400" : "text-slate-800"}`}>
          {node.name}
        </span>

        {node.documentCount > 0 ? (
          <span className="ml-1 inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
            {node.documentCount > 99 ? "99+" : node.documentCount}
          </span>
        ) : null}

        <span className="flex-1" />

        <button
          aria-label={`Actions for ${node.name}`}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded transition ${restricted ? "cursor-not-allowed text-slate-300" : "text-slate-400 opacity-0 hover:bg-slate-200 hover:text-slate-900 group-hover:opacity-100"}`}
          disabled={restricted}
          onClick={openMenu}
          type="button"
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </button>
      </div>

      {hasChildren && !collapsed ? (
        <div className="ml-[13px] border-l border-slate-200">
          {node.children.map((child) => (
            <TopicListRow
              accessibleApps={accessibleApps}
              collapsedIds={collapsedIds}
              depth={depth + 1}
              key={child.id}
              node={child}
              onOpenMenu={onOpenMenu}
              toggleCollapse={toggleCollapse}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TopicTreeList({ accessibleTargetAppIds, canCreateRoot, onOpenMenu, selectedCompanyId, selectedCompanyName, tree }: TopicTreeListProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const accessibleApps = new Set(accessibleTargetAppIds);

  function toggleCollapse(id: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function openRootMenu(event: React.MouseEvent) {
    onOpenMenu({
      companyId: selectedCompanyId,
      companyName: selectedCompanyName ?? "",
      parentId: null,
      parentName: "Root",
      roleAccessAll: true,
      topicId: null,
      topicName: "Base",
      targetAppIds: [],
      userAccessAll: true,
      x: event.clientX,
      y: event.clientY
    });
  }

  return (
    <div className="min-h-[500px] rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1.5 rounded-md py-1.5 pr-1.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-slate-700">
          <FolderOpen className="h-4 w-4" />
        </span>
        <span className="text-sm font-bold text-slate-900">Base</span>
        <span className="flex-1" />
        {canCreateRoot && selectedCompanyId ? (
          <button
            aria-label="Create folder at root"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 transition hover:bg-slate-200 hover:text-slate-900"
            onClick={openRootMenu}
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {selectedCompanyId && tree.length === 0 ? (
        <div className="py-10 text-center text-sm font-medium text-slate-500">
          No topics created for this company.
        </div>
      ) : (
        <div className="ml-[13px] border-l border-slate-200">
          {tree.map((node) => (
            <TopicListRow
              accessibleApps={accessibleApps}
              collapsedIds={collapsedIds}
              depth={1}
              key={node.id}
              node={node}
              onOpenMenu={onOpenMenu}
              toggleCollapse={toggleCollapse}
            />
          ))}
        </div>
      )}

      {tree.some((node) => node.documentCount > 0 || node.children.length > 0) ? null : (
        <div className="flex items-center gap-1.5 pl-1 pt-2 text-[11px] text-slate-400">
          <FileText className="h-3 w-3" />
          Document counts appear next to folders that contain files.
        </div>
      )}
    </div>
  );
}
