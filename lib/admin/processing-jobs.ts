import { getPool } from "@/lib/db/pool";
import { getAccessibleTopicIds } from "./content-structure";
import type { AdminSession } from "./auth";

export const PROCESSING_JOB_TYPES = ["parse_document", "chunk_document", "embed_document", "index_document"] as const;
export const PROCESSING_JOB_STATUSES = ["pending", "running", "completed", "failed", "retrying"] as const;

export type ProcessingJobType = typeof PROCESSING_JOB_TYPES[number];
export type ProcessingJobStatus = typeof PROCESSING_JOB_STATUSES[number];

export type ProcessingJobRow = {
  id: string;
  companyId: string;
  documentId: string;
  documentName: string;
  jobType: ProcessingJobType;
  status: ProcessingJobStatus;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProcessingJobFilters = {
  status?: string;
  jobType?: string;
  page?: number;
  pageSize?: number;
};

export class ProcessingJobError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ProcessingJobError";
    this.statusCode = statusCode;
  }
}

function isJobType(value: string): value is ProcessingJobType {
  return PROCESSING_JOB_TYPES.includes(value as ProcessingJobType);
}

function isJobStatus(value: string): value is ProcessingJobStatus {
  return PROCESSING_JOB_STATUSES.includes(value as ProcessingJobStatus);
}

function mapJob(row: {
  id: string;
  company_id: string;
  document_id: string;
  document_name: string;
  job_type: ProcessingJobType;
  status: ProcessingJobStatus;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): ProcessingJobRow {
  return {
    id: row.id,
    companyId: row.company_id,
    documentId: row.document_id,
    documentName: row.document_name,
    jobType: row.job_type,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const jobSelect = `
  SELECT
    processing_jobs.id,
    processing_jobs.company_id,
    processing_jobs.document_id,
    documents.name AS document_name,
    processing_jobs.job_type,
    processing_jobs.status,
    processing_jobs.attempts,
    processing_jobs.max_attempts,
    processing_jobs.error_message,
    processing_jobs.started_at,
    processing_jobs.completed_at,
    processing_jobs.created_at,
    processing_jobs.updated_at
  FROM processing_jobs
  INNER JOIN documents ON documents.id = processing_jobs.document_id
`;

export async function enqueueProcessingJob(input: {
  companyId: string;
  documentId: string;
  jobType: ProcessingJobType;
  maxAttempts?: number;
}) {
  const maxAttempts = input.maxAttempts ?? 3;

  if (!input.companyId || !input.documentId) {
    throw new ProcessingJobError("Company and document are required.");
  }

  if (!isJobType(input.jobType)) {
    throw new ProcessingJobError("Invalid job type.");
  }

  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1) {
    throw new ProcessingJobError("Max attempts is invalid.");
  }

  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO processing_jobs (company_id, document_id, job_type, max_attempts)
      VALUES ($1, $2, $3::processing_job_type, $4)
      ON CONFLICT (document_id, job_type) WHERE status IN ('pending', 'running', 'retrying')
      DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [input.companyId, input.documentId, input.jobType, maxAttempts]
  );

  return result.rows[0].id;
}

export async function enqueueDocumentReembeddingJobs() {
  const result = await getPool().query<{ document_count: string; job_count: string }>(
    `
      WITH target_documents AS (
        SELECT documents.id, documents.company_id
        FROM documents
        WHERE documents.status <> 'deleted'
          AND EXISTS (
            SELECT 1
            FROM document_chunks
            WHERE document_chunks.document_id = documents.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM processing_jobs
            WHERE processing_jobs.document_id = documents.id
              AND processing_jobs.job_type IN ('parse_document', 'chunk_document', 'embed_document')
              AND processing_jobs.status = 'running'
          )
      ),
      updated_documents AS (
        UPDATE documents
        SET status = 'chunked',
            error_message = NULL,
            updated_at = now()
        WHERE documents.id IN (SELECT id FROM target_documents)
          AND documents.status <> 'deleted'
        RETURNING documents.id
      ),
      queued_jobs AS (
        INSERT INTO processing_jobs (
          company_id,
          document_id,
          job_type,
          status,
          attempts,
          max_attempts,
          error_message,
          started_at,
          completed_at,
          created_at,
          updated_at
        )
        SELECT
          target_documents.company_id,
          target_documents.id,
          'embed_document'::processing_job_type,
          'pending'::processing_job_status,
          0,
          3,
          NULL,
          NULL,
          NULL,
          now(),
          now()
        FROM target_documents
        ON CONFLICT (document_id, job_type) WHERE status IN ('pending', 'running', 'retrying')
        DO UPDATE
        SET status = 'pending',
            attempts = 0,
            max_attempts = EXCLUDED.max_attempts,
            error_message = NULL,
            started_at = NULL,
            completed_at = NULL,
            updated_at = now()
        WHERE processing_jobs.status <> 'running'
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*) FROM updated_documents) AS document_count,
        (SELECT COUNT(*) FROM queued_jobs) AS job_count
    `
  );
  const row = result.rows[0];

  return {
    documentCount: Number(row?.document_count ?? 0),
    jobCount: Number(row?.job_count ?? 0)
  };
}

async function accessibleJobCondition(session: AdminSession, params: unknown[]) {
  if (session.user.isAdminRole) {
    return "";
  }

  const accessibleTopicIds = await getAccessibleTopicIds(session);

  if (!accessibleTopicIds || accessibleTopicIds.size === 0) {
    params.push([]);
    return `AND documents.folder_id = ANY($${params.length}::uuid[])`;
  }

  params.push(Array.from(accessibleTopicIds));
  return `AND documents.folder_id = ANY($${params.length}::uuid[])`;
}

export async function listProcessingJobs(filters: ProcessingJobFilters, session: AdminSession) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 20));
  const offset = (page - 1) * pageSize;
  const conditions = ["documents.status <> 'deleted'"];
  const params: unknown[] = [];

  if (filters.status) {
    if (!isJobStatus(filters.status)) {
      throw new ProcessingJobError("Invalid job status.");
    }

    params.push(filters.status);
    conditions.push(`processing_jobs.status = $${params.length}::processing_job_status`);
  }

  if (filters.jobType) {
    if (!isJobType(filters.jobType)) {
      throw new ProcessingJobError("Invalid job type.");
    }

    params.push(filters.jobType);
    conditions.push(`processing_jobs.job_type = $${params.length}::processing_job_type`);
  }

  const accessCondition = await accessibleJobCondition(session, params);
  const whereClause = `WHERE ${conditions.join(" AND ")} ${accessCondition}`;
  const dataParams = [...params, pageSize, offset];
  const jobsResult = await getPool().query(
    `
      ${jobSelect}
      ${whereClause}
      ORDER BY processing_jobs.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    dataParams
  );
  const countResult = await getPool().query<{ total: string }>(
    `
      SELECT COUNT(*) AS total
      FROM processing_jobs
      INNER JOIN documents ON documents.id = processing_jobs.document_id
      ${whereClause}
    `,
    params
  );
  const total = Number(countResult.rows[0]?.total ?? 0);

  return {
    jobs: jobsResult.rows.map(mapJob),
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    total
  };
}

export async function getProcessingJobById(id: string, session: AdminSession) {
  if (!id) {
    throw new ProcessingJobError("Job is required.");
  }

  const params: unknown[] = [id];
  const accessCondition = await accessibleJobCondition(session, params);
  const result = await getPool().query(
    `
      ${jobSelect}
      WHERE processing_jobs.id = $1
        AND documents.status <> 'deleted'
        ${accessCondition}
    `,
    params
  );
  const row = result.rows[0];

  if (!row) {
    throw new ProcessingJobError("Job was not found.", 404);
  }

  return mapJob(row);
}
