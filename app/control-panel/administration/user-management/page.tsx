import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminShell, UserList, UserRegisterForm } from "@/components/admin";
import { getEmployeePage } from "@/lib/admin/user-management";
import { getMasterData } from "@/lib/admin/administration";
import { MODULE_KEYS, getAllAdminModules, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "User Management | Scout Admin",
  description: "Register users and manage activation and access."
};

type UsersPageProps = {
  searchParams: Promise<{
    companyId?: string;
    roleId?: string;
    status?: string;
    search?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function UsersPage({ searchParams }: UsersPageProps) {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  if (session.user.mustChangePassword) {
    redirect("/control-panel/change-password");
  }

  requireModuleAccess(session, MODULE_KEYS.userManagement);

  const params = await searchParams;
  const [{ companies, roles }, userPage, modules] = await Promise.all([
    getMasterData(),
    getEmployeePage({
      companyId: params.companyId,
      roleId: params.roleId,
      status: params.status,
      search: params.search,
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 10
    }),
    getAllAdminModules()
  ]);

  return (
    <AdminShell active={MODULE_KEYS.userManagement} session={session}>
      <UserRegisterForm companies={companies} modules={modules} roles={roles} />
      <UserList
        companies={companies}
        employees={userPage.employees}
        modules={modules}
        page={userPage.page}
        pageCount={userPage.pageCount}
        pageSize={userPage.pageSize}
        roles={roles}
        currentUserId={session.user.id}
        total={userPage.total}
      />
    </AdminShell>
  );
}
