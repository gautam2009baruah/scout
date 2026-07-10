"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { TopicTreeNode } from "@/lib/admin/content-structure";

type D3TopicNode = {
  id: string;
  companyId?: string;
  name: string;
  companyName?: string;
  roleAccessAll?: boolean;
  userAccessAll?: boolean;
  documentCount?: number;
  children?: D3TopicNode[];
};

export type TopicCreateTarget = {
  companyId: string;
  companyName: string;
  parentId: string | null;
  parentName: string;
};

export type TopicActionTarget = TopicCreateTarget & {
  roleAccessAll?: boolean;
  topicId: string | null;
  topicName: string;
  userAccessAll?: boolean;
  x: number;
  y: number;
};

type TopicTreeProps = {
  canCreateRoot: boolean;
  onOpenMenu: (target: TopicActionTarget) => void;
  selectedCompanyId: string;
  selectedCompanyName?: string;
  tree: TopicTreeNode[];
};

function toD3Node(nodes: TopicTreeNode[]): D3TopicNode {
  return {
    id: "root",
    name: "Base",
    children: nodes.map((node) => ({
      id: node.id,
      companyId: node.companyId,
      name: node.name,
      companyName: node.companyName,
      roleAccessAll: node.roleAccessAll,
      userAccessAll: node.userAccessAll,
      documentCount: node.documentCount,
      children: node.children.map((child) => toChildNode(child))
    }))
  };
}

function toChildNode(node: TopicTreeNode): D3TopicNode {
  return {
    id: node.id,
    companyId: node.companyId,
    name: node.name,
    companyName: node.companyName,
    roleAccessAll: node.roleAccessAll,
    userAccessAll: node.userAccessAll,
    documentCount: node.documentCount,
    children: node.children.map((child) => toChildNode(child))
  };
}

export function TopicTree({ canCreateRoot, onOpenMenu, selectedCompanyId, selectedCompanyName, tree }: TopicTreeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    const svgElement = svgRef.current;

    if (!container || !svgElement) {
      return;
    }

    const width = Math.max(container.clientWidth, 760);
    const data = toD3Node(tree);
    const root = d3.hierarchy<D3TopicNode>(data);

    root.each((node) => {
      if (collapsedIds.has(node.data.id) && node.children) {
        node.children = undefined;
      }
    });

    const visibleNodeCount = root.descendants().length;
    const labelLimit = visibleNodeCount > 42 ? 10 : visibleNodeCount > 22 ? 12 : 14;
    const xSpacing = Math.max(
      labelLimit * 7 + 22,
      visibleNodeCount > 60 ? 92 : visibleNodeCount > 36 ? 98 : visibleNodeCount > 18 ? 106 : 116
    );
    const ySpacing = visibleNodeCount > 50 ? 58 : visibleNodeCount > 24 ? 62 : 66;
    const formatNodeName = (name: string) => {
      return name.length > labelLimit ? `${name.slice(0, labelLimit - 1)}...` : name;
    };

    const treeLayout = d3.tree<D3TopicNode>().nodeSize([xSpacing, ySpacing]);
    treeLayout(root);

    const descendants = root.descendants() as d3.HierarchyPointNode<D3TopicNode>[];
    const links = root.links() as d3.HierarchyPointLink<D3TopicNode>[];
    const minX = d3.min(descendants, (node) => node.x) ?? 0;
    const maxX = d3.max(descendants, (node) => node.x) ?? 0;
    const maxY = d3.max(descendants, (node) => node.y) ?? 0;
    const contentWidth = Math.max(width, Math.max(Math.abs(minX), Math.abs(maxX)) * 2 + 320);
    const height = Math.max(maxY + 118, 500);

    const svg = d3.select(svgElement);
    svg.selectAll("*").remove();
    svg
      .attr("viewBox", [-contentWidth / 2, -42, contentWidth, height].join(" "))
      .attr("width", contentWidth * zoom)
      .attr("height", height * zoom)
      .style("width", `${contentWidth * zoom}px`)
      .style("height", `${height * zoom}px`);
    svg.append("style").text(`
      .topic-node .topic-menu { opacity: 0.16; transition: opacity 120ms ease; }
      .topic-node:hover .topic-menu { opacity: 1; }
      .topic-node .topic-menu:hover circle { fill: #0f172a; }
      .topic-node .topic-menu:hover circle.dot { fill: #ffffff; }
    `);

    const link = d3.linkVertical<d3.HierarchyPointLink<D3TopicNode>, d3.HierarchyPointNode<D3TopicNode>>()
      .x((node) => node.x)
      .y((node) => node.y);

    svg.append("g")
      .attr("fill", "none")
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1.5)
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("d", link);

    const nodeGroup = svg.append("g")
      .selectAll("g")
      .data(descendants)
      .join("g")
      .attr("class", "topic-node")
      .attr("transform", (node) => `translate(${node.x},${node.y})`)
      .style("cursor", (node) => node.data.id === "root" || node.data.children?.length ? "pointer" : "default")
      .on("click", (_event, node) => {
        if (node.data.id === "root" || !node.data.children?.length) {
          return;
        }

        setCollapsedIds((current) => {
          const next = new Set(current);

          if (next.has(node.data.id)) {
            next.delete(node.data.id);
          } else {
            next.add(node.data.id);
          }

          return next;
        });
      });

    const folderPath = (node: d3.HierarchyPointNode<D3TopicNode>) => {
      const open = Boolean(node.data.children?.length) && !collapsedIds.has(node.data.id);

      return open
        ? "M-23 -11Q-23 -15 -19 -15H-8Q-6 -15 -4 -12L-1 -9H18Q22 -9 22 -5V1H-17Q-21 1 -22 5L-25 17Q-26 21 -21 21H18Q22 21 23 17L26 4Q27 -1 22 -1H-20V-11Z"
        : "M-22 -11Q-22 -15 -18 -15H-8Q-6 -15 -4 -12L-1 -9H18Q22 -9 22 -5V17Q22 21 18 21H-18Q-22 21 -22 17Z";
    };

    nodeGroup.append("path")
      .attr("d", folderPath)
      .attr("transform", "translate(1,2)")
      .attr("fill", "#0f172a")
      .attr("opacity", 0.14);

    nodeGroup.append("path")
      .attr("d", (node) => {
        return folderPath(node);
      })
      .attr("fill", (node) => node.data.id === "root" ? "#1e293b" : collapsedIds.has(node.data.id) ? "#f59e0b" : "#facc15")
      .attr("stroke", (node) => node.data.id === "root" ? "#0f172a" : "#b45309")
      .attr("stroke-linejoin", "round")
      .attr("stroke-width", 1.25);

    const nodeLabel = nodeGroup.append("text")
      .attr("x", 0)
      .attr("y", 36)
      .attr("font-size", 13)
      .attr("font-weight", 700)
      .attr("fill", "#0f172a")
      .attr("text-anchor", "middle")
      .text((node) => formatNodeName(node.data.name));

    nodeLabel.append("title")
      .text((node) => node.data.name);

    const documentBadge = nodeGroup.filter((node) => node.data.id !== "root" && Number(node.data.documentCount ?? 0) > 0)
      .append("g")
      .attr("transform", "translate(29,15)");

    documentBadge.append("rect")
      .attr("x", (node) => Number(node.data.documentCount ?? 0) > 99 ? -13 : -10)
      .attr("y", -8)
      .attr("width", (node) => Number(node.data.documentCount ?? 0) > 99 ? 26 : 20)
      .attr("height", 16)
      .attr("rx", 8)
      .attr("fill", "#2563eb")
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 2);

    documentBadge.append("text")
      .attr("x", 0)
      .attr("y", 4)
      .attr("font-size", 9)
      .attr("font-weight", 800)
      .attr("fill", "#ffffff")
      .attr("text-anchor", "middle")
      .text((node) => {
        const count = Number(node.data.documentCount ?? 0);
        return count > 99 ? "99+" : String(count);
      });

    nodeGroup.filter((node) => Boolean(node.data.children?.length))
      .append("text")
      .attr("x", 0)
      .attr("y", 8)
      .attr("font-size", 12)
      .attr("font-weight", 800)
      .attr("fill", (node) => node.data.id === "root" ? "#ffffff" : "#78350f")
      .attr("text-anchor", "middle")
      .text((node) => collapsedIds.has(node.data.id) ? "+" : "-");

    const menuNodes = nodeGroup.filter((node) => {
      if (node.data.id === "root") {
        return canCreateRoot && Boolean(selectedCompanyId);
      }

      return Boolean(node.data.companyId);
    });

    const menuGroup = menuNodes.append("g")
      .attr("class", "topic-menu")
      .attr("transform", "translate(25,-17)")
      .style("cursor", "pointer")
      .on("click", (event, node) => {
        event.stopPropagation();

        if (node.data.id === "root") {
          onOpenMenu({
            companyId: selectedCompanyId,
            companyName: selectedCompanyName ?? "",
            parentId: null,
            parentName: "Root",
            roleAccessAll: true,
            topicId: null,
            topicName: "Base",
            userAccessAll: true,
            x: event.clientX,
            y: event.clientY
          });
          return;
        }

        onOpenMenu({
          companyId: node.data.companyId ?? "",
          companyName: node.data.companyName ?? "",
          parentId: node.data.id,
          parentName: node.data.name,
          roleAccessAll: node.data.roleAccessAll,
          topicId: node.data.id,
          topicName: node.data.name,
          userAccessAll: node.data.userAccessAll,
          x: event.clientX,
          y: event.clientY
        });
      });

    menuGroup.append("circle")
      .attr("r", 9)
      .attr("fill", "#ffffff")
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 1.4);

    menuGroup.selectAll("circle.dot")
      .data([-4, 0, 4])
      .join("circle")
      .attr("class", "dot")
      .attr("cx", (value) => value)
      .attr("cy", 0)
      .attr("r", 1.35)
      .attr("fill", "#0f172a");
  }, [canCreateRoot, collapsedIds, onOpenMenu, selectedCompanyId, selectedCompanyName, tree, zoom]);

  return (
    <div className="space-y-3">
      {/* Controls Row */}
      <div className="flex items-center gap-2">
        <div className="inline-flex h-8 items-center rounded-full border border-slate-300/30 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm">
          Company: {selectedCompanyName || "Selected company"}
        </div>
        <div className="inline-flex h-8 items-center overflow-hidden rounded-full border border-slate-300/40 bg-white shadow-sm">
        <button
          aria-label="Zoom out"
          className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={zoom <= 0.7}
          onClick={() => setZoom((current) => Math.max(0.7, Number((current - 0.1).toFixed(1))))}
          title="Zoom out"
          type="button"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="min-w-12 border-x border-slate-200/70 px-2 text-center text-xs font-semibold text-slate-600">
          {Math.round(zoom * 100)}%
        </span>
        <button
          aria-label="Reset zoom"
          className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={zoom === 1}
          onClick={() => setZoom(1)}
          title="Reset zoom"
          type="button"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          aria-label="Zoom in"
          className="inline-flex h-8 w-8 items-center justify-center text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={zoom >= 1.8}
          onClick={() => setZoom((current) => Math.min(1.8, Number((current + 0.1).toFixed(1))))}
          title="Zoom in"
          type="button"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
        </div>
      </div>
      
      {/* Tree Visualization */}
      <div className="relative min-h-[500px] overflow-auto rounded-lg border border-slate-200 bg-white" ref={containerRef}>
      {selectedCompanyId && tree.length === 0 ? (
        <div className="absolute inset-x-0 top-32 z-10 text-center text-sm font-medium text-slate-500">
          No topics created for this company.
        </div>
      ) : null}
      <svg className="min-h-[500px] w-full" ref={svgRef} role="img" />
    </div>
    </div>
  );
}
