import type { ReactNode } from "react";
import Link from "next/link";
import { Bell, FolderTree, LayoutDashboard, Search, ShieldCheck, TableProperties, UserPlus, UsersRound } from "lucide-react";
import type { AdminSession } from "@/lib/admin/auth";
import { MODULE_KEYS, type AdminModuleKey } from "@/lib/admin/permissions";

type AdminShellProps = {
  active: AdminModuleKey;
  children: ReactNode;
  session: AdminSession;
  title: string;
};

const moduleIcons = {
  [MODULE_KEYS.overview]: LayoutDashboard,
  [MODULE_KEYS.administration]: TableProperties,
  [MODULE_KEYS.contentStructure]: FolderTree,
  [MODULE_KEYS.userManagement]: UsersRound
} as const;

export function AdminShell({ active, children, session, title }: AdminShellProps) {
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-950">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 border-r border-slate-200 bg-white px-4 py-5 lg:block">
          <div className="flex items-center gap-3 px-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Scout Admin</p>
              <p className="text-xs text-slate-500">Control plane</p>
            </div>
          </div>

          <nav className="mt-8 space-y-1">
            {session.modules.map((module) => {
              const Icon = moduleIcons[module.key as keyof typeof moduleIcons] ?? LayoutDashboard;

              return (
                <Link
                  className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${
                    module.key === active
                      ? "bg-slate-950 text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                  }`}
                  href={module.href}
                  key={module.key}
                >
                  <Icon className="h-4 w-4" />
                  {module.name}
                </Link>
              );
            })}
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
                <div className="hidden h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 shadow-sm sm:flex">
                  <Search className="h-4 w-4 text-slate-400" />
                  <input
                    className="w-48 border-0 bg-transparent text-sm outline-none placeholder:text-slate-400"
                    placeholder="Search admin"
                    type="search"
                  />
                </div>
                <button aria-label="Notifications" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-950">
                  <Bell className="h-4 w-4" />
                </button>
                <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                  <UserPlus className="h-4 w-4" />
                  {session.user.name}
                </button>
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
    </main>
  );
}
