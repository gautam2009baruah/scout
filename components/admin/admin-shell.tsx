"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, BarChart3, Bot, Building2, ChevronDown, FolderTree, GitBranch, LayoutDashboard, MapPinned, Menu, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Sparkles, TableProperties, UsersRound, X } from "lucide-react";
import type { AdminSession } from "@/lib/admin/auth";
import { ScoutChatbot } from "@/components/scout-chatbot";
import { UserMenu } from "./user-menu";
import { CompanyContextSwitcher } from "./company-context-switcher";

type AdminModuleKey = number;

const MODULE_KEYS = {
  overview: 1,
  administration: 2,
  userManagement: 3,
  contentStructure: 4,
  aiConfiguration: 5,
  guidedWorkflows: 6,
  workflowTrainingSetup: 7,
  workflowSelfHealingReview: 8,
  workflowAnalytics: 9,
  orchestrationDesigner: 10,
  emailCredentials: 11,
  companyRoleSetup: 12,
  triggersMonitoring: 13,
  searchAnalytics: 14,
  chatbotSettings: 15
} as const;

type AdminShellProps = {
  active: AdminModuleKey;
  activeHref?: string;
  children: ReactNode;
  session: AdminSession;
  title?: string; // Optional - defaults to module name from database
};

const moduleIcons = {
  [MODULE_KEYS.overview]: LayoutDashboard,
  [MODULE_KEYS.administration]: Building2,
  [MODULE_KEYS.contentStructure]: FolderTree,
  [MODULE_KEYS.userManagement]: UsersRound,
  [MODULE_KEYS.aiConfiguration]: Bot,
  [MODULE_KEYS.guidedWorkflows]: MapPinned,
  [MODULE_KEYS.workflowTrainingSetup]: MapPinned,
  [MODULE_KEYS.workflowSelfHealingReview]: Sparkles,
  [MODULE_KEYS.workflowAnalytics]: BarChart3,
  [MODULE_KEYS.orchestrationDesigner]: GitBranch,
  [MODULE_KEYS.emailCredentials]: Bot,
  [MODULE_KEYS.companyRoleSetup]: TableProperties,
  [MODULE_KEYS.triggersMonitoring]: Activity,
  [MODULE_KEYS.searchAnalytics]: BarChart3,
  [MODULE_KEYS.chatbotSettings]: SlidersHorizontal
} as const;

const CRS_SCOUT_BASE_URL = "http://localhost:3000";
const CRS_TARGET_APP_ID = "6141a508-4fea-48c0-a92f-7a7064164209";

export function AdminShell({ active, activeHref, children, session, title }: AdminShellProps) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarScrolling, setIsSidebarScrolling] = useState(false);
  const [showSessionWarning, setShowSessionWarning] = useState(false);
  const [warningCountdownSeconds, setWarningCountdownSeconds] = useState(30);
  const [isExtendingSession, setIsExtendingSession] = useState(false);
  const [sessionDeadline, setSessionDeadline] = useState(() => new Date(session.expiresAt).getTime());
  const warningTimerRef = useRef<number | null>(null);
  const logoutTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const sidebarScrollTimerRef = useRef<number | null>(null);
  const logoutRequestedRef = useRef(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("scout-admin-sidebar-collapsed");
    if (saved === "true") {
      setIsSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => () => {
    if (sidebarScrollTimerRef.current !== null) {
      window.clearTimeout(sidebarScrollTimerRef.current);
    }
  }, []);

  function revealSidebarScrollbar() {
    setIsSidebarScrolling(true);
    if (sidebarScrollTimerRef.current !== null) {
      window.clearTimeout(sidebarScrollTimerRef.current);
    }
    sidebarScrollTimerRef.current = window.setTimeout(() => {
      setIsSidebarScrolling(false);
      sidebarScrollTimerRef.current = null;
    }, 900);
  }

  const clearClientSessionArtifacts = useCallback(() => {
    if (typeof window === "undefined") return;

    window.dispatchEvent(new CustomEvent("SCOUT_SESSION_EXPIRED"));

    const keysToRemove: string[] = [];
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index);
      if (key && (key.startsWith("scout-chatbot:") || key === "scout-orchestration-executions")) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      window.sessionStorage.removeItem(key);
    });

    const orchestrationExecutions = (window as Window & typeof globalThis & { __orchestrationExecutions?: Record<string, unknown> }).__orchestrationExecutions;
    if (orchestrationExecutions) {
      delete (window as Window & typeof globalThis & { __orchestrationExecutions?: Record<string, unknown> }).__orchestrationExecutions;
    }

    const cookiesToClear = document.cookie.split(";").map((entry) => entry.trim()).filter(Boolean);
    cookiesToClear.forEach((entry) => {
      const separatorIndex = entry.indexOf("=");
      const name = separatorIndex >= 0 ? entry.slice(0, separatorIndex) : entry;
      const secureFlag = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${secureFlag}`;
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax${secureFlag}`;
    });
  }, []);

  const clearSessionTimers = useCallback(() => {
    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }

    if (logoutTimerRef.current !== null) {
      window.clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }

    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const logoutNow = useCallback(async () => {
    if (logoutRequestedRef.current) return;
    logoutRequestedRef.current = true;
    clearSessionTimers();
    clearClientSessionArtifacts();

    try {
      await fetch("/api/admin/auth/logout", { method: "POST" });
    } catch {
      // Ignore logout network errors and redirect to login so the user is not stuck.
    }

    window.location.replace("/control-panel/login");
  }, [clearClientSessionArtifacts, clearSessionTimers]);

  const scheduleSessionWarning = useCallback((deadlineMs: number) => {
    clearSessionTimers();
    const remainingMs = deadlineMs - Date.now();

    if (remainingMs <= 0) {
      setShowSessionWarning(true);
      setWarningCountdownSeconds(0);
      void logoutNow();
      return;
    }

    if (remainingMs <= 30_000) {
      setShowSessionWarning(true);
      setWarningCountdownSeconds(30);
      const startedAt = Date.now();

      countdownTimerRef.current = window.setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        const remainingCountdownMs = Math.max(0, 30_000 - elapsedMs);
        setWarningCountdownSeconds(Math.max(0, Math.ceil(remainingCountdownMs / 1000)));

        if (remainingCountdownMs <= 0) {
          clearSessionTimers();
          void logoutNow();
        }
      }, 250);

      logoutTimerRef.current = window.setTimeout(() => {
        clearSessionTimers();
        void logoutNow();
      }, 30_000);
      return;
    }

    warningTimerRef.current = window.setTimeout(() => {
      setShowSessionWarning(true);
      setWarningCountdownSeconds(30);
      const startedAt = Date.now();

      countdownTimerRef.current = window.setInterval(() => {
        const elapsedMs = Date.now() - startedAt;
        const remainingCountdownMs = Math.max(0, 30_000 - elapsedMs);
        setWarningCountdownSeconds(Math.max(0, Math.ceil(remainingCountdownMs / 1000)));

        if (remainingCountdownMs <= 0) {
          clearSessionTimers();
          void logoutNow();
        }
      }, 250);

      logoutTimerRef.current = window.setTimeout(() => {
        clearSessionTimers();
        void logoutNow();
      }, 30_000);
    }, remainingMs - 30_000);
  }, [clearSessionTimers, logoutNow]);

  async function stayOnPage() {
    if (isExtendingSession || logoutRequestedRef.current) return;

    setIsExtendingSession(true);
    logoutRequestedRef.current = false;

    try {
      const response = await fetch("/api/admin/auth/extend", { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.message || "Unable to extend the session.");
      }

      const nextDeadline = body?.expiresAt ? new Date(body.expiresAt).getTime() : Date.now() + 15 * 60 * 1000;
      setSessionDeadline(nextDeadline);
      setShowSessionWarning(false);
      setWarningCountdownSeconds(30);
      scheduleSessionWarning(nextDeadline);
    } catch {
      await logoutNow();
    } finally {
      setIsExtendingSession(false);
    }
  }

  useEffect(() => {
    setSessionDeadline(new Date(session.expiresAt).getTime());
  }, [session.expiresAt]);

  useEffect(() => {
    scheduleSessionWarning(sessionDeadline);

    return () => {
      clearSessionTimers();
    };
  }, [clearSessionTimers, scheduleSessionWarning, sessionDeadline]);

  function toggleDesktopSidebar() {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("scout-admin-sidebar-collapsed", String(next));
      return next;
    });
  }

  // Get title from database if not explicitly provided
  // If activeHref is specified, find by href; otherwise find by key
  const pageTitle = title || 
    (activeHref 
      ? session.modules.find(m => m.href === activeHref)?.name 
      : session.modules.find(m => m.key === active)?.name) || 
    "Control Panel";
  
  // Group modules by parent-child relationship
  const topLevelModules = session.modules.filter(m => m.parentKey === null);
  const modulesByParent = new Map<number, typeof session.modules>();
  
  // Build a map of parent_key -> children modules
  session.modules.forEach(module => {
    if (module.parentKey !== null) {
      const siblings = modulesByParent.get(module.parentKey) || [];
      siblings.push(module);
      modulesByParent.set(module.parentKey, siblings);
    }
  });
  
  // Helper to check if a module or its children are active
  const isModuleOrChildActive = (moduleKey: number): boolean => {
    if (moduleKey === active) return true;
    const children = modulesByParent.get(moduleKey) || [];
    return children.some(child => child.key === active);
  };

  const sidebarContent = (collapsed: boolean, closeMobileMenu?: () => void) => (
    <>
      <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between gap-3 px-2"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
            <SlidersHorizontal className="h-5 w-5" />
          </span>
          {!collapsed ? <p className="text-base font-semibold text-slate-950">Control Panel</p> : null}
        </div>
        {!collapsed && !closeMobileMenu ? (
          <button
            aria-label="Collapse sidebar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            onClick={toggleDesktopSidebar}
            title="Collapse sidebar"
            type="button"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        ) : null}
        {closeMobileMenu ? (
          <button
            aria-label="Close navigation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
            onClick={closeMobileMenu}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {collapsed ? (
        <button
          aria-label="Expand sidebar"
          className="mt-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
          onClick={toggleDesktopSidebar}
          title="Expand sidebar"
          type="button"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      ) : null}

      <nav className={`${collapsed ? "mt-4 flex flex-col items-center gap-1" : "mt-8 space-y-1"}`}>
        {topLevelModules.map((module) => {
          const children = modulesByParent.get(module.key) || [];
          const hasChildren = children.length > 0;
          const isActiveTree = isModuleOrChildActive(module.key);
          const Icon = moduleIcons[module.key as keyof typeof moduleIcons] ?? LayoutDashboard;

          if (collapsed) {
            if (hasChildren) {
              return (
                <button
                  aria-label={`${module.name}. Expand sidebar to view submenu.`}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition ${
                    isActiveTree
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                  key={module.key}
                  onClick={toggleDesktopSidebar}
                  title={module.name}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            }

            return <NavLink active={active} activeHref={activeHref} collapsed key={module.key} module={module} onNavigate={closeMobileMenu} />;
          }

          if (hasChildren) {
            return (
              <details key={module.key} className="group" open>
                <summary className={`flex h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 text-sm font-medium transition marker:hidden ${
                  isActiveTree
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{module.name}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <div className="mt-1 space-y-1 border-l border-slate-200 pl-3">
                  {children.sort((a, b) => a.sortOrder - b.sortOrder).map((child) => (
                    <NavLink active={active} activeHref={activeHref} inset key={child.key} module={child} onNavigate={closeMobileMenu} />
                  ))}
                </div>
              </details>
            );
          }

          return <NavLink key={module.key} active={active} activeHref={activeHref} module={module} onNavigate={closeMobileMenu} />;
        })}
      </nav>
    </>
  );

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="flex min-h-screen">
        <aside
          aria-label="Control Panel navigation"
          className={`admin-sidebar-scroll sticky top-0 hidden h-screen shrink-0 overflow-y-auto border-r border-slate-200 bg-white py-5 transition-[width] duration-200 lg:block ${isSidebarScrolling ? "is-scrolling" : ""} ${isSidebarCollapsed ? "w-20 px-3" : "w-80 px-4"}`}
          onScroll={revealSidebarScrollbar}
          tabIndex={0}
        >
          {sidebarContent(isSidebarCollapsed)}
        </aside>

        <section className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <button
                  aria-label="Open navigation"
                  className="mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 lg:hidden"
                  onClick={() => setIsMobileMenuOpen(true)}
                  type="button"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-teal-700">{session.tenant.name}</p>
                  <h1 className="truncate text-2xl font-semibold tracking-normal text-slate-950">{pageTitle}</h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CompanyContextSwitcher />
                <UserMenu name={session.user.name} />
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</div>
          <footer className="border-t border-slate-200 bg-white/80 px-4 py-3 text-xs text-slate-500 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <span>Scout Control Panel</span>
              <span>© 2026 Scout</span>
            </div>
          </footer>
        </section>
      </div>

      {isMobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation overlay"
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
          />
          <aside
            aria-label="Control Panel mobile navigation"
            className={`admin-sidebar-scroll relative h-full w-80 max-w-[88vw] overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 shadow-xl ${isSidebarScrolling ? "is-scrolling" : ""}`}
            onScroll={revealSidebarScrollbar}
            tabIndex={0}
          >
            {sidebarContent(false, () => setIsMobileMenuOpen(false))}
          </aside>
        </div>
      ) : null}

      {showSessionWarning ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-teal-700">Session timeout</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">Your session is about to expire</h2>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              You will be logged out automatically in {warningCountdownSeconds} seconds if you do nothing.
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-teal-600 transition-[width] duration-200" style={{ width: `${Math.max(0, (warningCountdownSeconds / 30) * 100)}%` }} />
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100" onClick={() => void logoutNow()} type="button">
                Logout
              </button>
              <button className="inline-flex items-center justify-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isExtendingSession} onClick={() => void stayOnPage()} type="button">
                {isExtendingSession ? "Extending..." : "Stay on the page"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ScoutChatbot
        assistantName="Scout Assistant"
        companyId={session.user.tenantId}
        defaultOpen={false}
        placeholder="Ask or request a workflow..."
        scoutBaseUrl={CRS_SCOUT_BASE_URL}
        targetAppId={CRS_TARGET_APP_ID}
        targetAppName="CRS"
        theme={{
          brandColor: "#111827",
          accentColor: "#0ea5e9"
        }}
        userId={session.user.id}
        variant="floating"
      />
    </main>
  );
}

function NavLink({
  active,
  activeHref,
  collapsed,
  inset,
  module,
  onNavigate
}: {
  active: AdminModuleKey;
  activeHref?: string;
  collapsed?: boolean;
  inset?: boolean;
  module: AdminSession["modules"][number];
  onNavigate?: () => void;
}) {
  const Icon = moduleIcons[module.key as keyof typeof moduleIcons] ?? LayoutDashboard;
  const isActive = module.key === active && (!activeHref || module.href === activeHref);

  return (
    <Link
      className={`flex h-11 items-center gap-3 rounded-lg text-sm font-medium transition ${collapsed ? "w-10 justify-center px-0" : "px-3"} ${
        isActive
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
      href={module.href}
      onClick={onNavigate}
      title={module.name}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {collapsed ? <span className="sr-only">{module.name}</span> : <span className="min-w-0 truncate">{module.name}</span>}
    </Link>
  );
}
