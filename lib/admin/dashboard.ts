import { getPool } from "@/lib/db/pool";

export type DashboardMetrics = {
  activeCompanies: number;
  registeredUsers: number;
  invitedUsers: number;
  activeUsers: number;
  roles: number;
  queuedEmails: number;
};

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const result = await getPool().query<{
    active_companies: string;
    registered_users: string;
    invited_users: string;
    active_users: string;
    roles: string;
    queued_emails: string;
  }>(
    `
      SELECT
        (SELECT COUNT(*) FROM companies WHERE deleted_at IS NULL AND status = 'active') AS active_companies,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS registered_users,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND status = 'invited') AS invited_users,
        (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL AND status = 'active') AS active_users,
        (SELECT COUNT(*) FROM roles WHERE deleted_at IS NULL AND company_id IS NOT NULL) AS roles,
        (SELECT COUNT(*) FROM email_outbox WHERE status = 'queued') AS queued_emails
    `
  );

  const row = result.rows[0];

  return {
    activeCompanies: Number(row.active_companies),
    registeredUsers: Number(row.registered_users),
    invitedUsers: Number(row.invited_users),
    activeUsers: Number(row.active_users),
    roles: Number(row.roles),
    queuedEmails: Number(row.queued_emails)
  };
}
