import { getPool } from "@/lib/db/pool";
import type { Citation } from "@/lib/search/citation-engine";

export type ConversationStatus = "active" | "archived" | "deleted";
export type MessageSender = "user" | "assistant" | "system";

export type ConversationListItem = {
  id: string;
  title: string;
  status: ConversationStatus;
  message_count: number;
  last_message_at: Date | null;
  created_at: Date;
};

export type ConversationMessage = {
  id: string;
  sender: MessageSender;
  content: string;
  citations_json: CompactCitation[];
  metadata_json?: Record<string, unknown>;
  created_at: Date;
};

export type CompactCitation = {
  document_id: string;
  document_name: string;
  page_number: number;
  chunk_id: string;
  preview: string;
  folder_path?: string;
  section_title?: string;
  source_url?: string;
  download_available?: boolean;
};

export type ConversationLifecycleState = {
  id: string;
  status: ConversationStatus;
  created_at: Date;
  last_message_at: Date | null;
};

type PageInput = {
  page?: number;
  pageSize?: number;
};

export class ConversationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ConversationError";
    this.statusCode = statusCode;
  }
}

function normalizePage(input: PageInput) {
  const page = Math.max(1, Number(input.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize) || 20));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

function truncateTitle(question: string) {
  const compact = question.replace(/\s+/g, " ").trim();
  return compact.length <= 100 ? compact : `${compact.slice(0, 97).trim()}...`;
}

function truncatePreview(preview: string) {
  const compact = preview.replace(/\s+/g, " ").trim();
  return compact.length <= 300 ? compact : `${compact.slice(0, 297).trim()}...`;
}

function sanitizeCitations(citations: Citation[]): CompactCitation[] {
  return citations.map((citation) => ({
    document_id: citation.document_id,
    document_name: citation.document_name,
    page_number: citation.page_number,
    chunk_id: citation.chunk_id,
    preview: truncatePreview(citation.preview),
    folder_path: citation.folder_path || undefined,
    section_title: citation.section_title || undefined,
    source_url: citation.source_url || undefined,
    download_available: citation.download_available === true
  }));
}

function assertConversationStatus(status: string): asserts status is ConversationStatus {
  if (!["active", "archived", "deleted"].includes(status)) {
    throw new ConversationError("Invalid conversation status.");
  }
}

async function assertCompanyAndUser(companyId: string, userId: string) {
  if (!companyId || !userId) {
    throw new ConversationError("Company and user are required.");
  }

  const result = await getPool().query<{ id: string; status: string }>(
    `
      SELECT users.id, users.status
      FROM users
      INNER JOIN companies ON companies.id = $2
      INNER JOIN user_company_roles
        ON user_company_roles.user_id = users.id
       AND user_company_roles.company_id = companies.id
       AND user_company_roles.deleted_at IS NULL
       AND user_company_roles.status = 'active'
      WHERE users.id = $1
        AND companies.deleted_at IS NULL
        AND companies.status = 'active'
        AND users.deleted_at IS NULL
      LIMIT 1
    `,
    [userId, companyId]
  );

  const user = result.rows[0];

  if (!user) {
    throw new ConversationError("Company or user was not found.", 404);
  }

  if (user.status !== "active") {
    throw new ConversationError("User is not active.", 403);
  }
}

export async function getOrCreateConversation(input: {
  companyId: string;
  userId: string;
  conversationId?: string;
  firstQuestion: string;
}) {
  await assertCompanyAndUser(input.companyId, input.userId);

  if (input.conversationId) {
    const existing = await getPool().query<{ id: string; status: ConversationStatus }>(
      `
        SELECT id, status
        FROM conversations
        WHERE id = $1
          AND company_id = $2
          AND user_id = $3
        LIMIT 1
      `,
      [input.conversationId, input.companyId, input.userId]
    );

    const conversation = existing.rows[0];

    if (!conversation) {
      const created = await getPool().query<{ id: string }>(
        `
          INSERT INTO conversations (id, company_id, user_id, title)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [input.conversationId, input.companyId, input.userId, truncateTitle(input.firstQuestion)]
      );

      return created.rows[0].id;
    }

    if (conversation.status === "deleted") {
      throw new ConversationError("Conversation was not found.", 404);
    }

    if (conversation.status === "archived") {
      await getPool().query(
        "UPDATE conversations SET status = 'active', updated_at = now() WHERE id = $1",
        [conversation.id]
      );
    }

    return conversation.id;
  }

  const result = await getPool().query<{ id: string }>(
    `
      INSERT INTO conversations (company_id, user_id, title)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [input.companyId, input.userId, truncateTitle(input.firstQuestion)]
  );

  return result.rows[0].id;
}

export async function getConversationLifecycleState(input: {
  companyId: string;
  userId: string;
  conversationId: string;
}) {
  await assertCompanyAndUser(input.companyId, input.userId);

  const result = await getPool().query<ConversationLifecycleState>(
    `
      SELECT id, status, created_at, last_message_at
      FROM conversations
      WHERE id = $1
        AND company_id = $2
        AND user_id = $3
        AND status <> 'deleted'
      LIMIT 1
    `,
    [input.conversationId, input.companyId, input.userId]
  );

  return result.rows[0] ?? null;
}

export async function appendConversationExchange(input: {
  companyId: string;
  userId: string;
  conversationId: string;
  question: string;
  answer: string;
  citations: Citation[];
  metadata: Record<string, unknown>;
}) {
  const citations = sanitizeCitations(input.citations);
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const conversation = await client.query<{ id: string }>(
      `
        SELECT id
        FROM conversations
        WHERE id = $1
          AND company_id = $2
          AND user_id = $3
          AND status <> 'deleted'
        FOR UPDATE
      `,
      [input.conversationId, input.companyId, input.userId]
    );

    if (!conversation.rows[0]) {
      throw new ConversationError("Conversation was not found.", 404);
    }

    await client.query(
      `
        INSERT INTO conversation_messages (company_id, conversation_id, sender, content)
        VALUES ($1, $2, 'user', $3)
      `,
      [input.companyId, input.conversationId, input.question]
    );
    await client.query(
      `
        INSERT INTO conversation_messages (company_id, conversation_id, sender, content, citations_json, metadata_json)
        VALUES ($1, $2, 'assistant', $3, $4::jsonb, $5::jsonb)
      `,
      [
        input.companyId,
        input.conversationId,
        input.answer,
        JSON.stringify(citations),
        JSON.stringify(input.metadata)
      ]
    );
    await client.query(
      `
        UPDATE conversations
        SET
          status = 'active',
          message_count = message_count + 2,
          last_message_at = now(),
          updated_at = now()
        WHERE id = $1
      `,
      [input.conversationId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapConversation(row: {
  id: string;
  title: string;
  status: ConversationStatus;
  message_count: number;
  last_message_at: Date | null;
  created_at: Date;
}): ConversationListItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    message_count: row.message_count,
    last_message_at: row.last_message_at,
    created_at: row.created_at
  };
}

function mapMessage(row: {
  id: string;
  sender: MessageSender;
  content: string;
  citations_json: CompactCitation[];
  metadata_json?: Record<string, unknown>;
  created_at: Date;
}, includeMetadata = false): ConversationMessage {
  return {
    id: row.id,
    sender: row.sender,
    content: row.content,
    citations_json: row.citations_json ?? [],
    ...(includeMetadata ? { metadata_json: row.metadata_json ?? {} } : {}),
    created_at: row.created_at
  };
}

export async function listConversations(input: {
  companyId: string;
  userId: string;
  search?: string;
  status?: string;
} & PageInput) {
  await assertCompanyAndUser(input.companyId, input.userId);
  const { page, pageSize, offset } = normalizePage(input);
  const status = input.status?.trim() || "active";
  const search = input.search?.trim() || "";
  assertConversationStatus(status);

  if (status === "deleted") {
    throw new ConversationError("Deleted conversations are not returned in normal listings.");
  }

  const conditions = [
    "company_id = $1",
    "user_id = $2",
    "status = $3"
  ];
  const params: unknown[] = [input.companyId, input.userId, status];

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`(
      title ILIKE $${params.length}
      OR EXISTS (
        SELECT 1
        FROM conversation_messages
        WHERE conversation_messages.company_id = conversations.company_id
          AND conversation_messages.conversation_id = conversations.id
          AND conversation_messages.content ILIKE $${params.length}
      )
    )`);
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const dataParams = [...params, pageSize, offset];
  const [rows, count] = await Promise.all([
    getPool().query(
      `
        SELECT id, title, status, message_count, last_message_at, created_at
        FROM conversations
        ${whereClause}
        ORDER BY COALESCE(last_message_at, created_at) DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      dataParams
    ),
    getPool().query<{ total: string }>(
      `
        SELECT COUNT(*) AS total
        FROM conversations
        ${whereClause}
      `,
      params
    )
  ]);
  const total = Number(count.rows[0]?.total ?? 0);

  return {
    conversations: rows.rows.map(mapConversation),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total
  };
}

export async function getConversation(input: {
  companyId: string;
  userId: string;
  conversationId: string;
} & PageInput) {
  await assertCompanyAndUser(input.companyId, input.userId);
  const conversation = await getPool().query(
    `
      SELECT id, title, status, message_count, last_message_at, created_at
      FROM conversations
      WHERE id = $1
        AND company_id = $2
        AND user_id = $3
        AND status <> 'deleted'
    `,
    [input.conversationId, input.companyId, input.userId]
  );

  if (!conversation.rows[0]) {
    throw new ConversationError("Conversation was not found.", 404);
  }

  return {
    conversation: mapConversation(conversation.rows[0]),
    messages: await listConversationMessages(input)
  };
}

export async function listConversationMessages(input: {
  companyId: string;
  userId: string;
  conversationId: string;
  includeMetadata?: boolean;
} & PageInput) {
  await assertCompanyAndUser(input.companyId, input.userId);
  const { page, pageSize, offset } = normalizePage(input);
  const conversation = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM conversations
      WHERE id = $1
        AND company_id = $2
        AND user_id = $3
        AND status <> 'deleted'
    `,
    [input.conversationId, input.companyId, input.userId]
  );

  if (!conversation.rows[0]) {
    throw new ConversationError("Conversation was not found.", 404);
  }

  const [rows, count] = await Promise.all([
    getPool().query(
      `
        SELECT id, sender, content, citations_json, metadata_json, created_at
        FROM conversation_messages
        WHERE company_id = $1
          AND conversation_id = $2
        ORDER BY created_at ASC
        LIMIT $3 OFFSET $4
      `,
      [input.companyId, input.conversationId, pageSize, offset]
    ),
    getPool().query<{ total: string }>(
      `
        SELECT COUNT(*) AS total
        FROM conversation_messages
        WHERE company_id = $1
          AND conversation_id = $2
      `,
      [input.companyId, input.conversationId]
    )
  ]);
  const total = Number(count.rows[0]?.total ?? 0);

  return {
    messages: rows.rows.map((row) => mapMessage(row, input.includeMetadata === true)),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total
  };
}

export async function updateConversation(input: {
  companyId: string;
  userId: string;
  conversationId: string;
  title?: string;
  status?: string;
}) {
  await assertCompanyAndUser(input.companyId, input.userId);
  const fields: string[] = [];
  const params: unknown[] = [input.conversationId, input.companyId, input.userId];

  if (typeof input.title === "string") {
    const title = input.title.trim();

    if (!title) {
      throw new ConversationError("Conversation title is required.");
    }

    params.push(truncateTitle(title));
    fields.push(`title = $${params.length}`);
  }

  if (typeof input.status === "string") {
    if (!["active", "archived"].includes(input.status)) {
      throw new ConversationError("Only active and archived statuses can be set.");
    }

    params.push(input.status);
    fields.push(`status = $${params.length}`);
  }

  if (fields.length === 0) {
    throw new ConversationError("No conversation changes were provided.");
  }

  const result = await getPool().query(
    `
      UPDATE conversations
      SET ${fields.join(", ")}, updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND user_id = $3
        AND status <> 'deleted'
    `,
    params
  );

  if (result.rowCount !== 1) {
    throw new ConversationError("Conversation was not found.", 404);
  }
}

export async function softDeleteConversation(input: {
  companyId: string;
  userId: string;
  conversationId: string;
}) {
  await assertCompanyAndUser(input.companyId, input.userId);
  const result = await getPool().query(
    `
      UPDATE conversations
      SET status = 'deleted', updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND user_id = $3
        AND status <> 'deleted'
    `,
    [input.conversationId, input.companyId, input.userId]
  );

  if (result.rowCount !== 1) {
    throw new ConversationError("Conversation was not found.", 404);
  }
}

export async function searchConversations(input: {
  companyId: string;
  userId: string;
  query: string;
} & PageInput) {
  await assertCompanyAndUser(input.companyId, input.userId);
  const query = input.query.trim();

  if (!query) {
    throw new ConversationError("Search query is required.");
  }

  const { page, pageSize, offset } = normalizePage(input);
  const like = `%${query.toLowerCase()}%`;
  const params = [input.companyId, input.userId, like, pageSize, offset];
  const where = `
    conversations.company_id = $1
    AND conversations.user_id = $2
    AND conversations.status <> 'deleted'
    AND (
      lower(conversations.title) LIKE $3
      OR EXISTS (
        SELECT 1
        FROM conversation_messages
        WHERE conversation_messages.conversation_id = conversations.id
          AND conversation_messages.company_id = conversations.company_id
          AND lower(conversation_messages.content) LIKE $3
      )
    )
  `;

  const [rows, count] = await Promise.all([
    getPool().query(
      `
        SELECT id, title, status, message_count, last_message_at, created_at
        FROM conversations
        WHERE ${where}
        ORDER BY COALESCE(last_message_at, created_at) DESC
        LIMIT $4 OFFSET $5
      `,
      params
    ),
    getPool().query<{ total: string }>(
      `SELECT COUNT(*) AS total FROM conversations WHERE ${where}`,
      params.slice(0, 3)
    )
  ]);
  const total = Number(count.rows[0]?.total ?? 0);

  return {
    conversations: rows.rows.map(mapConversation),
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    total
  };
}
