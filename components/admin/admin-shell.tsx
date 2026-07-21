"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Activity, BarChart3, Bot, Building2, ChevronDown, ChevronRight, CircleHelp, Compass, Database, FolderTree, GitBranch, LayoutDashboard, MapPinned, Menu, PanelLeftClose, PanelLeftOpen, SlidersHorizontal, Sparkles, TableProperties, UsersRound, X } from "lucide-react";
import type { AdminSession } from "@/lib/admin/auth";
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
  chatbotSettings: 15,
  databaseSchemaManager: 16
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
  [MODULE_KEYS.chatbotSettings]: SlidersHorizontal,
  [MODULE_KEYS.databaseSchemaManager]: Database
} as const;

const administrationMenuGroups = [
  {
    label: "Organization & Access",
    moduleKeys: [MODULE_KEYS.companyRoleSetup, MODULE_KEYS.userManagement],
  },
  {
    label: "AI & Chatbot",
    moduleKeys: [MODULE_KEYS.aiConfiguration, MODULE_KEYS.chatbotSettings],
  },
  {
    label: "Guided Workflow",
    moduleKeys: [
      MODULE_KEYS.workflowTrainingSetup,
      MODULE_KEYS.workflowSelfHealingReview,
      MODULE_KEYS.workflowAnalytics,
    ],
  },
  {
    label: "Platform Operations",
    moduleKeys: [
      MODULE_KEYS.databaseSchemaManager,
      MODULE_KEYS.emailCredentials,
      MODULE_KEYS.triggersMonitoring,
      MODULE_KEYS.searchAnalytics,
    ],
  },
] as const;

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
  const isExtendingSessionRef = useRef(false);
  const showSessionWarningRef = useRef(false);
  const lastSessionExtensionRef = useRef(0);

  const preferredTopLevelOrder = [
    MODULE_KEYS.overview,
    MODULE_KEYS.guidedWorkflows,
    MODULE_KEYS.contentStructure,
    MODULE_KEYS.orchestrationDesigner,
    MODULE_KEYS.administration
  ];

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

  const beginWarningCountdown = useCallback((remainingMs: number) => {
    const clampedMs = Math.max(0, Math.min(30_000, remainingMs));
    showSessionWarningRef.current = true;
    setShowSessionWarning(true);
    setWarningCountdownSeconds(Math.max(0, Math.ceil(clampedMs / 1000)));
    const startedAt = Date.now();

    countdownTimerRef.current = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const remainingCountdownMs = Math.max(0, clampedMs - elapsedMs);
      setWarningCountdownSeconds(Math.max(0, Math.ceil(remainingCountdownMs / 1000)));

      if (remainingCountdownMs <= 0) {
        clearSessionTimers();
        void logoutNow();
      }
    }, 250);

    logoutTimerRef.current = window.setTimeout(() => {
      clearSessionTimers();
      void logoutNow();
    }, clampedMs);
  }, [clearSessionTimers, logoutNow]);

  const scheduleSessionWarning = useCallback((deadlineMs: number) => {
    clearSessionTimers();
    if (!Number.isFinite(deadlineMs)) {
      void logoutNow();
      return;
    }

    const remainingMs = deadlineMs - Date.now();

    if (remainingMs <= 0) {
      beginWarningCountdown(0);
      void logoutNow();
      return;
    }

    if (remainingMs <= 30_000) {
      beginWarningCountdown(remainingMs);
      return;
    }

    warningTimerRef.current = window.setTimeout(() => {
      beginWarningCountdown(30_000);
    }, remainingMs - 30_000);
  }, [beginWarningCountdown, clearSessionTimers, logoutNow]);

  const renewActiveSession = useCallback(async () => {
    if (
      logoutRequestedRef.current ||
      isExtendingSessionRef.current ||
      showSessionWarningRef.current
    ) {
      return;
    }

    isExtendingSessionRef.current = true;

    try {
      const response = await fetch("/api/admin/auth/extend", {
        method: "POST",
        cache: "no-store",
        keepalive: true,
      });
      const body = await response.json().catch(() => null);

      if (response.status === 401) {
        await logoutNow();
        return;
      }

      if (!response.ok) {
        return;
      }

      const nextDeadline = body?.expiresAt
        ? new Date(body.expiresAt).getTime()
        : Number.NaN;

      if (!Number.isFinite(nextDeadline)) {
        return;
      }

      lastSessionExtensionRef.current = Date.now();
      showSessionWarningRef.current = false;
      setSessionDeadline(nextDeadline);
      setShowSessionWarning(false);
      setWarningCountdownSeconds(30);
    } catch {
      // Keep the existing deadline and warning schedule on transient failures.
      // A later activity or heartbeat will retry before expiry.
    } finally {
      isExtendingSessionRef.current = false;
    }
  }, [logoutNow]);

  async function stayOnPage() {
    if (isExtendingSessionRef.current || logoutRequestedRef.current) return;

    // Stop the pending logout/countdown immediately to avoid race conditions
    // while the extend-session request is in flight.
    clearSessionTimers();
    showSessionWarningRef.current = false;
    setShowSessionWarning(false);

    setIsExtendingSession(true);
    isExtendingSessionRef.current = true;
    logoutRequestedRef.current = false;

    try {
      const response = await fetch("/api/admin/auth/extend", { method: "POST" });
      const body = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(body?.message || "Unable to extend the session.");
      }

      const nextDeadline = body?.expiresAt ? new Date(body.expiresAt).getTime() : Number.NaN;
      if (!Number.isFinite(nextDeadline)) {
        throw new Error("The server returned an invalid session expiry.");
      }
      lastSessionExtensionRef.current = Date.now();
      setSessionDeadline(nextDeadline);
      showSessionWarningRef.current = false;
      setShowSessionWarning(false);
      setWarningCountdownSeconds(30);
      scheduleSessionWarning(nextDeadline);
    } catch {
      await logoutNow();
    } finally {
      isExtendingSessionRef.current = false;
      setIsExtendingSession(false);
    }
  }

  useEffect(() => {
    setSessionDeadline(new Date(session.expiresAt).getTime());
  }, [session.expiresAt]);

  useEffect(() => {
    const activityExtensionIntervalMs = 4 * 60 * 1000;

    const recordActivity = () => {
      const now = Date.now();

      if (
        !showSessionWarningRef.current &&
        now - lastSessionExtensionRef.current >= activityExtensionIntervalMs
      ) {
        void renewActiveSession();
      }
    };

    window.addEventListener("pointerdown", recordActivity, { passive: true });
    window.addEventListener("keydown", recordActivity);
    window.addEventListener("touchstart", recordActivity, { passive: true });

    return () => {
      window.removeEventListener("pointerdown", recordActivity);
      window.removeEventListener("keydown", recordActivity);
      window.removeEventListener("touchstart", recordActivity);
    };
  }, [renewActiveSession]);

  useEffect(() => {
    scheduleSessionWarning(sessionDeadline);

    return () => {
      clearSessionTimers();
    };
  }, [clearSessionTimers, scheduleSessionWarning, sessionDeadline]);

  useEffect(() => {
    const monitor = window.setInterval(() => {
      if (logoutRequestedRef.current || isExtendingSessionRef.current) {
        return;
      }

      const remainingMs = sessionDeadline - Date.now();
      if (remainingMs <= 0) {
        beginWarningCountdown(0);
        void logoutNow();
        return;
      }

      if (remainingMs <= 30_000 && !showSessionWarning) {
        scheduleSessionWarning(sessionDeadline);
      }
    }, 1000);

    const onVisibilityChange = () => {
      if (!document.hidden && !isExtendingSessionRef.current) {
        scheduleSessionWarning(sessionDeadline);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(monitor);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [beginWarningCountdown, logoutNow, scheduleSessionWarning, sessionDeadline, showSessionWarning]);

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
  const topLevelModules = session.modules
    .filter((m) => m.parentKey === null)
    .sort((a, b) => {
      const aPref = (preferredTopLevelOrder as number[]).indexOf(a.key);
      const bPref = (preferredTopLevelOrder as number[]).indexOf(b.key);
      if (aPref !== -1 || bPref !== -1) {
        if (aPref === -1) return 1;
        if (bPref === -1) return -1;
        return aPref - bPref;
      }
      return a.sortOrder - b.sortOrder;
    });
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

  function groupChildModules(parentKey: number, children: typeof session.modules) {
    const sortedChildren = [...children].sort((a, b) => a.sortOrder - b.sortOrder);
    if (parentKey !== MODULE_KEYS.administration) {
      return [{ label: null, modules: sortedChildren }];
    }

    const assignedKeys = new Set<number>();
    const groups = administrationMenuGroups
      .map((group) => {
        const modules = group.moduleKeys
          .map((key) => sortedChildren.find((module) => module.key === key))
          .filter((module): module is (typeof sortedChildren)[number] => Boolean(module));
        modules.forEach((module) => assignedKeys.add(module.key));
        return { label: group.label, modules };
      })
      .filter((group) => group.modules.length > 0);
    const unmatched = sortedChildren.filter((module) => !assignedKeys.has(module.key));

    return unmatched.length > 0
      ? [...groups, { label: "Other", modules: unmatched }]
      : groups;
  }

  const sidebarContent = (collapsed: boolean, closeMobileMenu?: () => void) => (
    <>
      <div className={`flex items-center pt-5 ${collapsed ? "justify-center" : "justify-between gap-3 px-2"}`}>
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-blue-700 text-white">
            <Compass className="h-5 w-5" />
          </span>
          {!collapsed ? (
            <div>
              <p className="text-base font-bold tracking-tight text-blue-700">Scout</p>
              <p className="mt-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">Control Panel</p>
            </div>
          ) : null}
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

      <nav
        className={`admin-sidebar-scroll min-h-0 flex-1 overflow-y-auto pb-4 pr-1 ${isSidebarScrolling ? "is-scrolling" : ""} ${
          collapsed ? "mt-4 flex flex-col items-center gap-1" : "mt-10 space-y-1"
        }`}
        onScroll={revealSidebarScrollbar}
      >
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
                      ? "bg-blue-700 text-white"
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
              <details key={module.key} className="group py-0.5" open>
                <summary className={`flex min-h-11 cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 font-mono text-sm font-medium transition marker:hidden ${
                  isActiveTree
                    ? "bg-blue-100 text-blue-700"
                    : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-950"
                }`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{module.name}</span>
                  <ChevronDown className="h-4 w-4 shrink-0 transition group-open:rotate-180" />
                </summary>
                <div className="mt-2 space-y-4 pl-4">
                  {groupChildModules(module.key, children).map((group) => (
                    <div className="space-y-1" key={group.label ?? "items"}>
                      {group.label ? (
                        <p className="px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {group.label}
                        </p>
                      ) : null}
                      <div className="space-y-1 border-l border-slate-300 pl-2">
                        {group.modules.map((child) => (
                          <NavLink active={active} activeHref={activeHref} inset key={child.key} module={child} onNavigate={closeMobileMenu} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            );
          }

          return <NavLink key={module.key} active={active} activeHref={activeHref} module={module} onNavigate={closeMobileMenu} />;
        })}
      </nav>

      <div className={`mt-auto shrink-0 border-t border-slate-300 ${collapsed ? "flex justify-center" : "px-1"}`}>
        <Link
          className={`flex min-h-11 items-center rounded-md font-mono text-sm font-medium text-slate-600 transition hover:bg-slate-200/70 hover:text-blue-700 ${
            collapsed ? "w-10 justify-center" : "gap-3 px-3"
          }`}
          href="/control-panel/support"
          onClick={closeMobileMenu}
          title="Support"
        >
          <CircleHelp className="h-4 w-4 shrink-0" />
          {collapsed ? <span className="sr-only">Support</span> : <span>Support</span>}
        </Link>
      </div>
    </>
  );

  return (
    <main className="min-h-screen bg-[#f7f9fb] text-slate-950">
      <div className="flex min-h-screen">
        <aside
          aria-label="Control Panel navigation"
          className={`sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-slate-300 bg-[#f2f4f6] transition-[width] duration-200 lg:flex ${isSidebarCollapsed ? "w-20 px-3" : "w-72 px-3"}`}
        >
          {sidebarContent(isSidebarCollapsed)}
        </aside>

        <section className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 min-h-16 border-b border-slate-300 bg-white px-4 sm:px-6 lg:px-8">
            <div className="mx-auto flex min-h-16 w-full max-w-[1440px] flex-col justify-center gap-3 py-3 md:flex-row md:items-center md:justify-between md:py-0">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  aria-label="Open navigation"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-blue-700 lg:hidden"
                  onClick={() => setIsMobileMenuOpen(true)}
                  type="button"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 font-mono text-sm">
                  <span className="truncate text-slate-500">{session.tenant.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  <h1 className="truncate font-semibold text-slate-950">{pageTitle}</h1>
                </nav>
              </div>
              <div className="flex flex-wrap items-center gap-3 md:border-l md:border-slate-300 md:pl-5">
                <CompanyContextSwitcher />
                <UserMenu name={session.user.name} />
              </div>
            </div>
          </header>

          <div className="admin-content flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-6">
            <div className="mx-auto w-full max-w-[1440px]">{children}</div>
          </div>
          <footer className="border-t border-slate-300 bg-white px-4 py-4 text-slate-600 sm:px-6 lg:px-8">
            <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.08em] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span>© 2026 Scout</span>
                <span>Control Panel</span>
                <span>Enterprise Console</span>
              </div>
              <span className="inline-flex items-center gap-2 font-semibold text-slate-800">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Connected
              </span>
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
            className="relative flex h-full w-72 max-w-[88vw] flex-col overflow-hidden border-r border-slate-300 bg-[#f2f4f6] px-3 shadow-xl"
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
      className={`flex items-center gap-3 rounded-md font-mono text-sm font-medium transition ${inset ? "min-h-10" : "min-h-11"} ${collapsed ? "w-10 justify-center px-0" : inset ? "px-3 py-2" : "px-3 py-2.5"} ${
        isActive
          ? "bg-blue-700 text-white"
          : "text-slate-600 hover:bg-slate-200/70 hover:text-blue-700"
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
