import type { ReactNode } from "react";
import Link from "next/link";
import { Activity, BarChart3, Bot, Building2, ChevronDown, FolderTree, GitBranch, LayoutDashboard, MapPinned, SlidersHorizontal, Sparkles, TableProperties, UsersRound } from "lucide-react";
import type { AdminSession } from "@/lib/admin/auth";
import { MODULE_KEYS, type AdminModuleKey } from "@/lib/admin/permissions";
import { ScoutChatbot } from "@/components/scout-chatbot";
import { UserMenu } from "./user-menu";
import { CompanyContextSwitcher } from "./company-context-switcher";
import { SessionBackGuard } from "./session-back-guard";

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
  [MODULE_KEYS.triggersMonitoring]: Activity
} as const;

const CRS_SCOUT_BASE_URL = "http://localhost:3000";
const CRS_TARGET_APP_ID = "6141a508-4fea-48c0-a92f-7a7064164209";

export function AdminShell({ active, activeHref, children, session, title }: AdminShellProps) {
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

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <SessionBackGuard />
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-200 bg-white px-4 py-5 lg:block">
          <div className="flex items-center gap-3 px-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
            <p className="text-base font-semibold text-slate-950">Control Panel</p>
          </div>

          <nav className="mt-8 space-y-1">
            {topLevelModules.map((module) => {
              const children = modulesByParent.get(module.key) || [];
              const hasChildren = children.length > 0;
              const isActiveTree = isModuleOrChildActive(module.key);

              if (hasChildren) {
                // Render as dropdown menu with children
                return (
                  <details key={module.key} className="group" open>
                    <summary className={`flex h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 text-sm font-medium transition marker:hidden ${
                      isActiveTree
                        ? "bg-slate-100 text-slate-950"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}>
                      {(() => {
                        const Icon = moduleIcons[module.key as keyof typeof moduleIcons] ?? LayoutDashboard;
                        return <Icon className="h-4 w-4" />;
                      })()}
                      <span className="flex-1">{module.name}</span>
                      <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                    </summary>
                    <div className="mt-1 space-y-1 border-l border-slate-200 pl-3">
                      {children.sort((a, b) => a.sortOrder - b.sortOrder).map((child) => (
                        <NavLink active={active} activeHref={activeHref} inset key={child.key} module={child} />
                      ))}
                    </div>
                  </details>
                );
              } else {
                // Render as regular link
                return <NavLink key={module.key} active={active} activeHref={activeHref} module={module} />;
              }
            })}
          </nav>
        </aside>

        <section className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-teal-700">{session.tenant.name}</p>
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950">{pageTitle}</h1>
              </div>
              <div className="flex items-center gap-2">
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
  inset,
  module
}: {
  active: AdminModuleKey;
  activeHref?: string;
  inset?: boolean;
  module: AdminSession["modules"][number];
}) {
  const Icon = moduleIcons[module.key as keyof typeof moduleIcons] ?? LayoutDashboard;
  const isActive = module.key === active && (!activeHref || module.href === activeHref);

  return (
    <Link
      className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
        isActive
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
      href={module.href}
    >
      <Icon className="h-4 w-4" />
      {module.name}
    </Link>
  );
}
