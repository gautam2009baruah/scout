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
  const currentCompanyId = session.user.tenantId;
  const accessibleCompanyIds = new Set(session.availableCompanies.map((company) => company.companyId));
  const [{ companies, roles }, userPage, modules] = await Promise.all([
    getMasterData(),
    getEmployeePage({
      companyId: currentCompanyId,
      roleId: params.roleId,
      status: params.status,
      search: params.search,
      page: Number(params.page) || 1,
      pageSize: Number(params.pageSize) || 10
    }),
    getAllAdminModules()
  ]);

  const accessibleCompanies = companies.filter((company) => accessibleCompanyIds.has(company.id));
  const currentCompany = accessibleCompanies.find((c) => c.id === currentCompanyId);
  const accessibleRoles = roles.filter((r) => r.companyId && accessibleCompanyIds.has(r.companyId) && !r.isSystem);
  const companyRoles = accessibleRoles.filter((r) => r.companyId === currentCompanyId);

  return (
    <AdminShell active={MODULE_KEYS.userManagement} session={session}>
      <UserRegisterForm
        currentCompanyId={currentCompanyId}
        currentCompanyName={currentCompany?.name || ""}
        modules={modules}
        roles={companyRoles}
      />
      <UserList
        companies={accessibleCompanies}
        currentCompanyId={currentCompanyId}
        currentUserId={session.user.id}
        employees={userPage.employees}
        modules={modules}
        page={userPage.page}
        pageCount={userPage.pageCount}
        pageSize={userPage.pageSize}
        roles={accessibleRoles}
        total={userPage.total}
      />
    </AdminShell>
  );
}
