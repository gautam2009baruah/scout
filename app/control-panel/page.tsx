import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  FileText,
  FolderTree,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  Workflow
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AdminShell } from "@/components/admin";
import { getCompanyAiConfigStatus } from "@/lib/ai/config";
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
  const aiStatus = await getCompanyAiConfigStatus(session.user.tenantId);
  const aiMissing: string[] = [
    ...(aiStatus.hasLlm ? [] : ["an LLM provider"]),
    ...(aiStatus.hasEmbedding ? [] : ["an embedding provider"])
  ];
  const canConfigureAi = hasModuleAccess(session, MODULE_KEYS.aiConfiguration);
  const aiConfigHref = session.modules.find((module) => module.key === MODULE_KEYS.aiConfiguration)?.href
    ?? "/control-panel/administration/ai-configuration";
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
    icon: LucideIcon;
    label: string;
    tone: string;
    value: number | string;
  }>;

  return (
    <AdminShell active={MODULE_KEYS.overview} session={session}>
      {aiMissing.length > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <div className="font-semibold text-amber-900">AI providers are not configured</div>
            <p className="mt-1 text-amber-800">
              This company has not set {aiMissing.join(" and ")}. Chatbot answers and document embedding will fail until{" "}
              {canConfigureAi ? "you configure" : "an administrator configures"} a provider under AI Configuration.
            </p>
            {canConfigureAi ? (
              <Link
                className="mt-2 inline-flex h-8 items-center rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700"
                href={aiConfigHref}
              >
                Configure AI providers
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
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
