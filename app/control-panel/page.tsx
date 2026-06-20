import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  Database,
  FileUp,
  LockKeyhole,
  UserPlus
} from "lucide-react";
import { AdminShell } from "@/components/admin";
import { getDashboardMetrics } from "@/lib/admin/dashboard";
import { MODULE_KEYS, hasModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "Admin Dashboard | Scout",
  description: "Scout multi-tenant admin dashboard."
};

const actions = [
  { icon: UserPlus, title: "Register user", description: "Invite admins, operators, and tenant users." },
  { icon: FileUp, title: "Upload files", description: "Queue tenant documents for validation and processing." },
  { icon: Database, title: "Configure data", description: "Attach PostgreSQL or client-provided database adapters." }
];

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

  const dashboard = await getDashboardMetrics();
  const metrics = [
    { label: "Active companies", value: dashboard.activeCompanies, detail: "Companies available for users" },
    { label: "Registered users", value: dashboard.registeredUsers, detail: `${dashboard.activeUsers} active` },
    { label: "Invited users", value: dashboard.invitedUsers, detail: "Awaiting account activation" },
    { label: "Company roles", value: dashboard.roles, detail: `${dashboard.queuedEmails} queued emails` }
  ];

  return (
    <AdminShell active={MODULE_KEYS.overview} session={session} title="Admin overview">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" key={metric.label}>
            <p className="text-sm font-medium text-slate-500">{metric.label}</p>
            <p className="mt-3 text-3xl font-semibold tracking-normal text-slate-950">{metric.value}</p>
            <p className="mt-2 text-sm text-teal-700">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-slate-950">Operational modules</h2>
              <p className="mt-1 text-sm text-slate-500">Initial admin workspace for the modules we will add next.</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              Ready for extension
            </span>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {actions.map((action) => (
              <article className="rounded-lg border border-slate-200 bg-[#f8fafc] p-4" key={action.title}>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white text-slate-950 shadow-sm">
                  <action.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-semibold text-slate-950">{action.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{action.description}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-normal text-slate-950">System status</h2>
            <Activity className="h-5 w-5 text-teal-600" />
          </div>
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-slate-700" />
                <div>
                  <p className="text-sm font-semibold text-slate-950">Database adapter</p>
                  <p className="text-sm text-slate-500">PostgreSQL target, provider-neutral contract</p>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-[#f8fafc] p-4">
              <div className="flex items-center gap-3">
                <LockKeyhole className="h-5 w-5 text-slate-700" />
                <div>
                  <p className="text-sm font-semibold text-slate-950">Authentication</p>
                  <p className="text-sm text-slate-500">15-minute database-backed sessions</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

    </AdminShell>
  );
}
