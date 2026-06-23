import { getPool } from "@/lib/db/pool";
import { getAccessibleTopicIds } from "./content-structure";
import { MODULE_KEYS, hasModuleAccess } from "./permissions";
import type { AdminSession } from "./auth";

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

export type UserDashboardSummary = {
  administration?: {
    activeCompanies: number;
    roles: number;
  };
  userManagement?: {
    totalUsers: number;
    activeUsers: number;
    invitedUsers: number;
    disabledUsers: number;
  };
  contentStructure?: {
    folders: number;
    documents: number;
    uploadedDocuments: number;
    processingDocuments: number;
    failedDocuments: number;
  };
  aiConfiguration?: {
    llmProvider: string;
    llmModel: string;
    embeddingProvider: string;
    embeddingModel: string;
  };
};

export async function getUserDashboardSummary(session: AdminSession): Promise<UserDashboardSummary> {
  const summary: UserDashboardSummary = {};

  if (hasModuleAccess(session, MODULE_KEYS.administration)) {
    const result = await getPool().query<{
      active_companies: string;
      roles: string;
    }>(
      `
        SELECT
          COUNT(DISTINCT companies.id) AS active_companies,
          COUNT(DISTINCT roles.id) FILTER (WHERE roles.company_id IS NOT NULL) AS roles
        FROM companies
        LEFT JOIN roles ON roles.company_id = companies.id
          AND roles.deleted_at IS NULL
        WHERE companies.deleted_at IS NULL
          AND companies.status = 'active'
      `
    );
    const row = result.rows[0];
    summary.administration = {
      activeCompanies: Number(row?.active_companies ?? 0),
      roles: Number(row?.roles ?? 0)
    };
  }

  if (hasModuleAccess(session, MODULE_KEYS.userManagement)) {
    const result = await getPool().query<{
      total_users: string;
      active_users: string;
      invited_users: string;
      disabled_users: string;
    }>(
      `
        SELECT
          COUNT(*) AS total_users,
          COUNT(*) FILTER (WHERE status = 'active') AS active_users,
          COUNT(*) FILTER (WHERE status = 'invited') AS invited_users,
          COUNT(*) FILTER (WHERE status = 'disabled') AS disabled_users
        FROM users
        WHERE deleted_at IS NULL
      `
    );
    const row = result.rows[0];
    summary.userManagement = {
      totalUsers: Number(row?.total_users ?? 0),
      activeUsers: Number(row?.active_users ?? 0),
      invitedUsers: Number(row?.invited_users ?? 0),
      disabledUsers: Number(row?.disabled_users ?? 0)
    };
  }

  if (hasModuleAccess(session, MODULE_KEYS.contentStructure)) {
    const accessibleTopicIds = await getAccessibleTopicIds(session);
    const params: unknown[] = [];
    const topicFilter = accessibleTopicIds ? "AND topics.id = ANY($1::uuid[])" : "";
    const documentFilter = accessibleTopicIds ? "AND documents.folder_id = ANY($1::uuid[])" : "";

    if (accessibleTopicIds) {
      params.push(Array.from(accessibleTopicIds));
    }

    const [folderResult, documentResult] = await Promise.all([
      getPool().query<{ folders: string }>(
        `
          SELECT COUNT(*) AS folders
          FROM topics
          WHERE deleted_at IS NULL
            ${topicFilter}
        `,
        params
      ),
      getPool().query<{
        documents: string;
        uploaded_documents: string;
        processing_documents: string;
        failed_documents: string;
      }>(
        `
          SELECT
            COUNT(*) AS documents,
            COUNT(*) FILTER (WHERE status IN ('uploaded', 'parsed', 'chunked', 'embedded', 'indexed')) AS uploaded_documents,
            COUNT(*) FILTER (WHERE status IN ('queued', 'processing')) AS processing_documents,
            COUNT(*) FILTER (WHERE status = 'failed') AS failed_documents
          FROM documents
          WHERE status <> 'deleted'
            ${documentFilter}
        `,
        params
      )
    ]);
    const documents = documentResult.rows[0];
    summary.contentStructure = {
      folders: Number(folderResult.rows[0]?.folders ?? 0),
      documents: Number(documents?.documents ?? 0),
      uploadedDocuments: Number(documents?.uploaded_documents ?? 0),
      processingDocuments: Number(documents?.processing_documents ?? 0),
      failedDocuments: Number(documents?.failed_documents ?? 0)
    };
  }

  if (hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
    const result = await getPool().query<{
      llm_provider: string | null;
      llm_model: string | null;
      embedding_provider: string | null;
      embedding_model: string | null;
    }>(
      `
        SELECT
          (SELECT provider FROM ai_llm_provider_configs WHERE is_active = true LIMIT 1) AS llm_provider,
          (SELECT model FROM ai_llm_provider_configs WHERE is_active = true LIMIT 1) AS llm_model,
          (SELECT provider FROM ai_embedding_provider_configs WHERE is_active = true LIMIT 1) AS embedding_provider,
          (SELECT model FROM ai_embedding_provider_configs WHERE is_active = true LIMIT 1) AS embedding_model
      `
    );
    const row = result.rows[0];
    summary.aiConfiguration = {
      llmProvider: row?.llm_provider || "Not configured",
      llmModel: row?.llm_model || "Not configured",
      embeddingProvider: row?.embedding_provider || "Not configured",
      embeddingModel: row?.embedding_model || "Not configured"
    };
  }

  return summary;
}
