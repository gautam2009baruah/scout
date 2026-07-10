import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Bot,
  CheckCircle2,
  FileText,
  FolderTree,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  Workflow
} from "lucide-react";
import { AdminShell } from "@/components/admin";
import { getUserDashboardSummary } from "@/lib/admin/dashboard";
import { MODULE_KEYS, hasModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Overview | Scout",
  description: "Scout control panel overview."
};

export default async function AdminDashboardPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  if (!hasModuleAccess(session, MODULE_KEYS.overview)) {
    redirect(session.modules[0]?.href ?? "/control-panel/login");
  }

  const summary = await getUserDashboardSummary(session);
  const cards = [
    summary.userManagement ? {
      detail: `${summary.userManagement.activeUsers} active users`,
      icon: UsersRound,
      label: "Users",
      tone: "bg-sky-600 text-white",
      value: summary.userManagement.totalUsers
    } : null,
    summary.contentStructure ? {
      detail: `${summary.contentStructure.documents} documents available`,
      icon: FolderTree,
      label: "Folders",
      tone: "bg-emerald-600 text-white",
      value: summary.contentStructure.folders
    } : null,
    summary.aiConfiguration ? {
      detail: summary.aiConfiguration.llmModel,
      icon: Bot,
      label: "Active AI provider",
      tone: "bg-violet-600 text-white",
      value: summary.aiConfiguration.llmProvider
    } : null,
    summary.guidedWorkflows ? {
      detail: `${summary.guidedWorkflows.publishedGuides} published guides`,
      icon: Workflow,
      label: "Guided workflows",
      tone: "bg-amber-600 text-white",
      value: summary.guidedWorkflows.trainingSessions
    } : null
  ].filter(Boolean) as Array<{
    detail: string;
    icon: typeof Building2;
    label: string;
    tone: string;
    value: number | string;
  }>;

  return (
    <AdminShell active={MODULE_KEYS.overview} session={session}>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" key={card.label}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-500">{card.label}</p>
              <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${card.tone}`}>
                <card.icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-normal text-slate-950">{card.value}</p>
            <p className="mt-2 text-sm text-slate-600">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-2">
        {summary.userManagement ? (
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                <UserRoundCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">User Status</h2>
                <p className="text-sm text-slate-500">Users visible in your workspace.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="Active" value={summary.userManagement.activeUsers} />
              <Metric label="Invited" value={summary.userManagement.invitedUsers} />
              <Metric label="Inactive" value={summary.userManagement.inactiveUsers} />
            </div>
          </article>
        ) : null}

        {summary.contentStructure ? (
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Documents</h2>
                <p className="text-sm text-slate-500">Files available in folders you can access.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label="Available" value={summary.contentStructure.uploadedDocuments} />
              <Metric label="Processing" value={summary.contentStructure.processingDocuments} />
              <Metric label="Failed" value={summary.contentStructure.failedDocuments} />
            </div>
          </article>
        ) : null}

        {summary.guidedWorkflows ? (
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-normal text-slate-950">Guided Workflows</h2>
                <p className="text-sm text-slate-500">Training setup, drafts, and guides ready for target apps.</p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              <Metric label="Target apps" value={summary.guidedWorkflows.targetApps} />
              <Metric label="Training sessions" value={summary.guidedWorkflows.trainingSessions} />
              <Metric label="Drafts" value={summary.guidedWorkflows.draftGuides} />
              <Metric label="Published" value={summary.guidedWorkflows.publishedGuides} />
            </div>
          </article>
        ) : null}

        {cards.length === 0 ? (
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <p className="text-sm font-medium text-slate-700">No overview summaries are available for your current module access.</p>
            </div>
          </article>
        ) : null}
      </section>
    </AdminShell>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-2 break-words text-xl font-semibold tracking-normal text-slate-950">{value}</p>
    </div>
  );
}
