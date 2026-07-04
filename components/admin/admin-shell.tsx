import type { ReactNode } from "react";
import Link from "next/link";
import { BarChart3, Bell, Bot, Building2, ChevronDown, FolderTree, GitBranch, LayoutDashboard, MapPinned, SlidersHorizontal, Sparkles, TableProperties, UsersRound } from "lucide-react";
import type { AdminSession } from "@/lib/admin/auth";
import { MODULE_KEYS, type AdminModuleKey } from "@/lib/admin/permissions";
import { ScoutChatbot } from "@/components/scout-chatbot";
import { UserMenu } from "./user-menu";

type AdminShellProps = {
  active: AdminModuleKey;
  activeHref?: string;
  children: ReactNode;
  session: AdminSession;
  title: string;
};

const moduleIcons = {
  [MODULE_KEYS.overview]: LayoutDashboard,
  [MODULE_KEYS.administration]: Building2,
  [MODULE_KEYS.contentStructure]: FolderTree,
  [MODULE_KEYS.userManagement]: UsersRound,
  [MODULE_KEYS.aiConfiguration]: Bot,
  [MODULE_KEYS.guidedWorkflows]: MapPinned
} as const;

const TRAINING_SETUP_HREF = "/control-panel/administration/training-setup";
const ORCHESTRATION_DESIGNER_HREF = "/control-panel/administration/orchestration-designer";
const SELF_HEALING_REVIEW_HREF = "/control-panel/administration/self-healing-review";
const WORKFLOW_ANALYTICS_HREF = "/control-panel/administration/workflow-analytics";
const CRS_SCOUT_BASE_URL = "http://localhost:3000";
const CRS_TARGET_APP_ID = "6141a508-4fea-48c0-a92f-7a7064164209";

export function AdminShell({ active, activeHref, children, session, title }: AdminShellProps) {
  const visibleModules = new Map(session.modules.map((module) => [module.key, module]));
  const overviewModule = visibleModules.get(MODULE_KEYS.overview);
  const contentStructureModule = visibleModules.get(MODULE_KEYS.contentStructure);
  const guidedWorkflowsModule = visibleModules.get(MODULE_KEYS.guidedWorkflows);
  const administrationModules = [
    visibleModules.get(MODULE_KEYS.administration),
    visibleModules.get(MODULE_KEYS.userManagement),
    visibleModules.get(MODULE_KEYS.aiConfiguration)
  ].filter(Boolean) as AdminSession["modules"];
  const isTrainingSetupActive = activeHref === TRAINING_SETUP_HREF;
  const isOrchestrationDesignerActive = activeHref === ORCHESTRATION_DESIGNER_HREF;
  const isSelfHealingReviewActive = activeHref === SELF_HEALING_REVIEW_HREF;
  const isWorkflowAnalyticsActive = activeHref === WORKFLOW_ANALYTICS_HREF;
  const isAdministrationActive = administrationModules.some((module) => module.key === active) || isTrainingSetupActive || isOrchestrationDesignerActive || isSelfHealingReviewActive || isWorkflowAnalyticsActive;

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-200 bg-white px-4 py-5 lg:block">
          <div className="flex items-center gap-3 px-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
              <SlidersHorizontal className="h-5 w-5" />
            </span>
            <p className="text-base font-semibold text-slate-950">Control Panel</p>
          </div>

          <nav className="mt-8 space-y-1">
            {overviewModule ? <NavLink active={active} activeHref={activeHref} module={overviewModule} /> : null}

            {administrationModules.length > 0 ? (
              <details className="group" open>
                <summary className={`flex h-11 cursor-pointer list-none items-center gap-3 rounded-lg px-3 text-sm font-medium transition marker:hidden ${
                  isAdministrationActive
                    ? "bg-slate-100 text-slate-950"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}>
                  <TableProperties className="h-4 w-4" />
                  <span className="flex-1">Administration</span>
                  <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                </summary>
                <div className="mt-1 space-y-1 border-l border-slate-200 pl-3">
                  {administrationModules.map((module) => (
                    <NavLink active={active} activeHref={activeHref} inset key={module.key} module={module} />
                  ))}
                  {guidedWorkflowsModule ? (
                    <>
                      <Link
                        className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                          isTrainingSetupActive
                            ? "bg-slate-950 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                        href={TRAINING_SETUP_HREF}
                      >
                        <MapPinned className="h-4 w-4" />
                        Training Setup
                      </Link>
                      <Link
                        className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                          isSelfHealingReviewActive
                            ? "bg-slate-950 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                        href={SELF_HEALING_REVIEW_HREF}
                      >
                        <Sparkles className="h-4 w-4" />
                        Self-Healing Review
                      </Link>
                      <Link
                        className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                          isWorkflowAnalyticsActive
                            ? "bg-slate-950 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                        }`}
                        href={WORKFLOW_ANALYTICS_HREF}
                      >
                        <BarChart3 className="h-4 w-4" />
                        Workflow Analytics
                      </Link>
                    </>
                  ) : null}
                </div>
              </details>
            ) : null}

            {contentStructureModule ? <NavLink active={active} activeHref={activeHref} module={contentStructureModule} /> : null}
            {guidedWorkflowsModule ? <NavLink active={active} activeHref={activeHref} module={guidedWorkflowsModule} /> : null}
            {guidedWorkflowsModule ? (
              <Link
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                  isOrchestrationDesignerActive
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
                href={ORCHESTRATION_DESIGNER_HREF}
              >
                <GitBranch className="h-4 w-4" />
                Orchestration Designer
              </Link>
            ) : null}
          </nav>
        </aside>

        <section className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-teal-700">{session.tenant.name}</p>
                <h1 className="text-2xl font-semibold tracking-normal text-slate-950">{title}</h1>
              </div>
              <div className="flex items-center gap-2">
                <button aria-label="Notifications" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-950">
                  <Bell className="h-4 w-4" />
                </button>
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
