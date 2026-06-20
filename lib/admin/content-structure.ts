import { getPool } from "@/lib/db/pool";
import type { AdminSession } from "./auth";

export type TopicRow = {
  id: string;
  companyId: string;
  companyName: string;
  parentId: string | null;
  name: string;
  slug: string;
  description: string | null;
  roleAccessAll: boolean;
  userAccessAll: boolean;
  documentCount: number;
  createdAt: Date;
};

export type TopicTreeNode = TopicRow & {
  children: TopicTreeNode[];
};

export type TopicAccessGrant = {
  id: string;
  topicId: string;
  topicName: string;
  assigneeId: string;
  assigneeName: string;
  type: "role" | "user";
};

export type FolderDocumentAccess = {
  folderId: string;
  isCustom: boolean;
  roleIds: string[];
  userIds: string[];
};

export type TopicUserOption = {
  id: string;
  name: string;
  email: string;
  companyIds: string[];
  companyName: string;
};

export type TopicCompanyOption = {
  id: string;
  name: string;
};

export type CreateTopicInput = {
  allRoles?: boolean;
  allUsers?: boolean;
  companyId: string;
  parentId?: string | null;
  name: string;
  roleIds?: string[];
  userIds?: string[];
};

export type GrantTopicAccessInput = {
  topicId: string;
  roleIds?: string[];
  userIds?: string[];
};

export type UpdateTopicInput = {
  allRoles?: boolean;
  allUsers?: boolean;
  name: string;
  roleIds?: string[];
  userIds?: string[];
};

export class TopicError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TopicError";
  }
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isAdmin(session: AdminSession) {
  return session.user.isAdminRole;
}

function mapTopic(row: {
  id: string;
  company_id: string;
  company_name: string;
  parent_id: string | null;
  name: string;
  slug: string;
  description: string | null;
  role_access_all: boolean;
  user_access_all: boolean;
  document_count: string | number;
  created_at: Date;
}): TopicRow {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company_name,
    parentId: row.parent_id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    roleAccessAll: row.role_access_all,
    userAccessAll: row.user_access_all,
    documentCount: Number(row.document_count ?? 0),
    createdAt: row.created_at
  };
}

function buildTree(rows: TopicRow[]) {
  const nodeById = new Map<string, TopicTreeNode>();
  const roots: TopicTreeNode[] = [];

  for (const row of rows) {
    nodeById.set(row.id, { ...row, children: [] });
  }

  for (const node of Array.from(nodeById.values())) {
    if (node.parentId && nodeById.has(node.parentId)) {
      nodeById.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortNodes = (nodes: TopicTreeNode[]) => {
    nodes.sort((first, second) => first.name.localeCompare(second.name));
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  return roots;
}

export async function getAccessibleTopicIds(session: AdminSession) {
  if (isAdmin(session)) {
    return null;
  }

  const result = await getPool().query<{ id: string }>(
    `
      WITH RECURSIVE seed_topics AS (
        SELECT topic_id
        FROM role_topic_permissions
        WHERE role_id = $2 AND deleted_at IS NULL
        UNION
        SELECT topic_id
        FROM user_topic_permissions
        WHERE user_id = $1 AND deleted_at IS NULL
        UNION
        SELECT topics.id AS topic_id
        FROM topics
        LEFT JOIN user_company_roles ON user_company_roles.company_id = topics.company_id
          AND user_company_roles.user_id = $1
          AND user_company_roles.deleted_at IS NULL
        WHERE topics.deleted_at IS NULL
          AND (topics.role_access_all = true OR topics.user_access_all = true)
          AND (topics.company_id = $3 OR user_company_roles.user_id IS NOT NULL)
      ),
      visible_topics AS (
        SELECT topics.id
        FROM topics
        INNER JOIN seed_topics ON seed_topics.topic_id = topics.id
        WHERE topics.deleted_at IS NULL
        UNION
        SELECT child.id
        FROM topics child
        INNER JOIN visible_topics parent ON parent.id = child.parent_id
        WHERE child.deleted_at IS NULL
      )
      SELECT id FROM visible_topics
    `,
    [session.user.id, session.user.roleId, session.user.tenantId]
  );

  return new Set(result.rows.map((row) => row.id));
}

async function assertCanCreateUnder(parentId: string | null, session: AdminSession) {
  if (isAdmin(session)) {
    return;
  }

  if (!parentId) {
    throw new TopicError("You can create subfolders only under folders assigned to you.");
  }

  const accessibleTopicIds = await getAccessibleTopicIds(session);

  if (!accessibleTopicIds?.has(parentId)) {
    throw new TopicError("You can create subfolders only under folders assigned to you.");
  }
}

async function getRoleIdsForCompany(companyId: string) {
  const result = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM roles
      WHERE company_id = $1
        AND deleted_at IS NULL
    `,
    [companyId]
  );

  return result.rows.map((row) => row.id);
}

async function getUserIdsForCompany(companyId: string) {
  const result = await getPool().query<{ id: string }>(
    `
      SELECT DISTINCT users.id
      FROM users
      LEFT JOIN user_company_roles ON user_company_roles.user_id = users.id
        AND user_company_roles.company_id = $1
        AND user_company_roles.deleted_at IS NULL
      WHERE users.deleted_at IS NULL
        AND users.status = 'active'
        AND (users.company_id = $1 OR user_company_roles.user_id IS NOT NULL)
    `,
    [companyId]
  );

  return result.rows.map((row) => row.id);
}

export async function getTopicWorkspace(session: AdminSession) {
  const accessibleTopicIds = await getAccessibleTopicIds(session);
  const params: unknown[] = [];
  const visibleFilter = accessibleTopicIds ? "AND topics.id = ANY($1::uuid[])" : "";

  if (accessibleTopicIds) {
    params.push(Array.from(accessibleTopicIds));
  }

  const topicsResult = await getPool().query<{
    id: string;
    company_id: string;
    company_name: string;
    parent_id: string | null;
    name: string;
    slug: string;
    description: string | null;
    role_access_all: boolean;
    user_access_all: boolean;
    document_count: string | number;
    created_at: Date;
  }>(
    `
      SELECT
        topics.id,
        topics.company_id,
        companies.name AS company_name,
        topics.parent_id,
        topics.name,
        topics.slug,
        topics.description,
        topics.role_access_all,
        topics.user_access_all,
        (
          SELECT COUNT(*)
          FROM documents
          WHERE documents.folder_id = topics.id
            AND documents.status <> 'deleted'
        ) AS document_count,
        topics.created_at
      FROM topics
      INNER JOIN companies ON companies.id = topics.company_id
      WHERE topics.deleted_at IS NULL
        AND companies.deleted_at IS NULL
        ${visibleFilter}
      ORDER BY companies.name ASC, topics.name ASC
    `,
    params
  );

  const rows = topicsResult.rows.map(mapTopic);
  return {
    canManageAccess: isAdmin(session),
    topics: rows,
    tree: buildTree(rows)
  };
}

export async function getTopicCompanyOptions(session: AdminSession): Promise<TopicCompanyOption[]> {
  if (isAdmin(session)) {
    const result = await getPool().query<{ id: string; name: string }>(
      `
        SELECT id, name
        FROM companies
        WHERE deleted_at IS NULL
        ORDER BY name ASC
      `
    );

    return result.rows;
  }

  const result = await getPool().query<{ id: string; name: string }>(
    `
      SELECT DISTINCT companies.id, companies.name
      FROM companies
      LEFT JOIN user_company_roles ON user_company_roles.company_id = companies.id
        AND user_company_roles.user_id = $1
        AND user_company_roles.deleted_at IS NULL
      WHERE companies.deleted_at IS NULL
        AND (companies.id = $2 OR user_company_roles.user_id IS NOT NULL)
      ORDER BY companies.name ASC
    `,
    [session.user.id, session.user.tenantId]
  );

  return result.rows;
}

export async function getTopicAccessAdminData(session: AdminSession) {
  const accessibleTopicIds = await getAccessibleTopicIds(session);
  const grantParams: unknown[] = [];
  const grantFilter = accessibleTopicIds ? "AND topics.id = ANY($1::uuid[])" : "";

  if (accessibleTopicIds) {
    grantParams.push(Array.from(accessibleTopicIds));
  }

  const grantsResult = await getPool().query<{
      id: string;
      topic_id: string;
      topic_name: string;
      assignee_id: string;
      assignee_name: string;
      type: "role" | "user";
    }>(
      `
        SELECT
          role_topic_permissions.id,
          topics.id AS topic_id,
          topics.name AS topic_name,
          roles.id AS assignee_id,
          roles.name AS assignee_name,
          'role'::text AS type
        FROM role_topic_permissions
        INNER JOIN topics ON topics.id = role_topic_permissions.topic_id
        INNER JOIN roles ON roles.id = role_topic_permissions.role_id
        WHERE role_topic_permissions.deleted_at IS NULL
          AND topics.deleted_at IS NULL
          AND roles.deleted_at IS NULL
          ${grantFilter}
        UNION ALL
        SELECT
          user_topic_permissions.id,
          topics.id AS topic_id,
          topics.name AS topic_name,
          users.id AS assignee_id,
          users.name AS assignee_name,
          'user'::text AS type
        FROM user_topic_permissions
        INNER JOIN topics ON topics.id = user_topic_permissions.topic_id
        INNER JOIN users ON users.id = user_topic_permissions.user_id
        WHERE user_topic_permissions.deleted_at IS NULL
          AND topics.deleted_at IS NULL
          AND users.deleted_at IS NULL
          ${grantFilter}
        ORDER BY topic_name ASC, type ASC, assignee_name ASC
      `,
      grantParams
    );

  const usersResult = isAdmin(session)
    ? await getPool().query<{
      id: string;
      name: string;
      email: string;
      company_ids: string[];
      company_name: string;
    }>(
      `
        SELECT
          users.id,
          users.name,
          users.email,
          array_agg(DISTINCT member_companies.id) AS company_ids,
          companies.name AS company_name
        FROM users
        INNER JOIN companies ON companies.id = users.company_id
        LEFT JOIN user_company_roles ON user_company_roles.user_id = users.id
          AND user_company_roles.deleted_at IS NULL
        LEFT JOIN companies member_companies ON member_companies.id = COALESCE(user_company_roles.company_id, users.company_id)
          AND member_companies.deleted_at IS NULL
        WHERE users.deleted_at IS NULL
          AND users.status = 'active'
          AND companies.deleted_at IS NULL
        GROUP BY users.id, companies.name
        ORDER BY users.name ASC
      `
    )
    : { rows: [] as Array<{ id: string; name: string; email: string; company_ids: string[]; company_name: string }> };

  return {
    grants: grantsResult.rows.map((row): TopicAccessGrant => ({
      id: row.id,
      topicId: row.topic_id,
      topicName: row.topic_name,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_name,
      type: row.type
    })),
    users: usersResult.rows.map((row): TopicUserOption => ({
      id: row.id,
      name: row.name,
      email: row.email,
      companyIds: row.company_ids,
      companyName: row.company_name
    }))
  };
}

export async function createTopic(input: CreateTopicInput, session: AdminSession) {
  const name = input.name.trim();
  const parentId = input.parentId || null;
  const slug = normalizeSlug(input.name);

  if (!input.companyId || !name || !slug) {
    throw new TopicError("Company and topic name are required.");
  }

  await assertCanCreateUnder(parentId, session);

  if (parentId) {
    const parentResult = await getPool().query<{ company_id: string }>(
      "SELECT company_id FROM topics WHERE id = $1 AND deleted_at IS NULL",
      [parentId]
    );

    if (!parentResult.rows[0]) {
      throw new TopicError("Parent topic was not found.");
    }

    if (parentResult.rows[0].company_id !== input.companyId) {
      throw new TopicError("Subfolders must belong to the same company as their parent folder.");
    }
  }

  try {
    const allRoles = input.allRoles !== false;
    const allUsers = input.allUsers !== false;
    const result = await getPool().query<{ id: string }>(
      `
        INSERT INTO topics (
          company_id,
          parent_id,
          name,
          slug,
          role_access_all,
          user_access_all,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
        RETURNING id
      `,
      [input.companyId, parentId, name, slug, allRoles, allUsers, session.user.id]
    );

    if (isAdmin(session)) {
      await grantTopicAccess(
        {
          topicId: result.rows[0].id,
          roleIds: allRoles ? await getRoleIdsForCompany(input.companyId) : input.roleIds,
          userIds: allUsers ? await getUserIdsForCompany(input.companyId) : input.userIds
        },
        session
      );
    }

    return result.rows[0].id;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new TopicError("A folder with this name already exists at this level.");
    }

    throw error;
  }
}

export async function updateTopic(topicId: string, input: UpdateTopicInput, session: AdminSession) {
  const name = input.name.trim();
  const slug = normalizeSlug(input.name);

  if (!topicId || !name || !slug) {
    throw new TopicError("Topic name is required.");
  }

  if (!isAdmin(session)) {
    const accessibleTopicIds = await getAccessibleTopicIds(session);

    if (!accessibleTopicIds?.has(topicId)) {
      throw new TopicError("You do not have permission to edit this topic.");
    }
  }

  try {
    const allRoles = input.allRoles === true;
    const allUsers = input.allUsers === true;
    const result = isAdmin(session)
      ? await getPool().query(
        `
          UPDATE topics
          SET
            name = $2,
            slug = $3,
            role_access_all = $4,
            user_access_all = $5,
            updated_by = $6,
            updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [topicId, name, slug, allRoles, allUsers, session.user.id]
      )
      : await getPool().query(
        `
          UPDATE topics
          SET name = $2, slug = $3, updated_by = $4, updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [topicId, name, slug, session.user.id]
      );

    if (result.rowCount !== 1) {
      throw new TopicError("Topic was not found.");
    }

    if (isAdmin(session)) {
      await replaceTopicAccess(
        {
          topicId,
          roleIds: allRoles ? await getRoleIdsForTopicCompany(topicId) : input.roleIds,
          userIds: allUsers ? await getUserIdsForTopicCompany(topicId) : input.userIds
        },
        session
      );
    }
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new TopicError("A folder with this name already exists at this level.");
    }

    throw error;
  }
}

async function getTopicCompanyId(topicId: string) {
  const result = await getPool().query<{ company_id: string }>(
    "SELECT company_id FROM topics WHERE id = $1 AND deleted_at IS NULL",
    [topicId]
  );

  const companyId = result.rows[0]?.company_id;

  if (!companyId) {
    throw new TopicError("Topic was not found.");
  }

  return companyId;
}

async function assertCanManageFolderDocumentAccess(folderId: string, session: AdminSession) {
  const companyId = await getTopicCompanyId(folderId);

  if (isAdmin(session)) {
    return companyId;
  }

  const accessibleTopicIds = await getAccessibleTopicIds(session);

  if (!accessibleTopicIds?.has(folderId)) {
    throw new TopicError("You do not have access to this folder.");
  }

  return companyId;
}

async function getRoleIdsForTopicCompany(topicId: string) {
  return getRoleIdsForCompany(await getTopicCompanyId(topicId));
}

async function getUserIdsForTopicCompany(topicId: string) {
  return getUserIdsForCompany(await getTopicCompanyId(topicId));
}

export async function replaceTopicAccess(input: GrantTopicAccessInput, session: AdminSession) {
  if (!isAdmin(session)) {
    throw new TopicError("Only admin users can assign folder access.");
  }

  if (!input.topicId) {
    throw new TopicError("Topic is required.");
  }

  await getPool().query(
    "UPDATE role_topic_permissions SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE topic_id = $1 AND deleted_at IS NULL",
    [input.topicId, session.user.id]
  );
  await getPool().query(
    "UPDATE user_topic_permissions SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE topic_id = $1 AND deleted_at IS NULL",
    [input.topicId, session.user.id]
  );

  await grantTopicAccess(input, session);
}

export async function getFolderDocumentAccess(folderId: string, session: AdminSession): Promise<FolderDocumentAccess> {
  if (!folderId) {
    throw new TopicError("Folder is required.");
  }

  await assertCanManageFolderDocumentAccess(folderId, session);

  const [roles, users] = await Promise.all([
    getPool().query<{ role_id: string }>(
      "SELECT role_id FROM folder_document_role_permissions WHERE folder_id = $1 AND deleted_at IS NULL",
      [folderId]
    ),
    getPool().query<{ user_id: string }>(
      "SELECT user_id FROM folder_document_user_permissions WHERE folder_id = $1 AND deleted_at IS NULL",
      [folderId]
    )
  ]);

  return {
    folderId,
    isCustom: roles.rows.length > 0 || users.rows.length > 0,
    roleIds: roles.rows.map((row) => row.role_id),
    userIds: users.rows.map((row) => row.user_id)
  };
}

export async function replaceFolderDocumentAccess(
  folderId: string,
  input: { roleIds?: string[]; userIds?: string[] },
  session: AdminSession
) {
  if (!folderId) {
    throw new TopicError("Folder is required.");
  }

  const companyId = await assertCanManageFolderDocumentAccess(folderId, session);
  const roleIds = Array.from(new Set(input.roleIds ?? []));
  const userIds = Array.from(new Set(input.userIds ?? []));
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE folder_document_role_permissions SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE folder_id = $1 AND deleted_at IS NULL",
      [folderId, session.user.id]
    );
    await client.query(
      "UPDATE folder_document_user_permissions SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE folder_id = $1 AND deleted_at IS NULL",
      [folderId, session.user.id]
    );

    if (roleIds.length > 0) {
      await client.query(
        `
          INSERT INTO folder_document_role_permissions (company_id, folder_id, role_id, created_by, updated_by)
          SELECT $1, $2, role_id, $3, $3
          FROM unnest($4::uuid[]) AS role_id
          ON CONFLICT (folder_id, role_id)
          DO UPDATE SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
        `,
        [companyId, folderId, session.user.id, roleIds]
      );
    }

    if (userIds.length > 0) {
      await client.query(
        `
          INSERT INTO folder_document_user_permissions (company_id, folder_id, user_id, created_by, updated_by)
          SELECT $1, $2, user_id, $3, $3
          FROM unnest($4::uuid[]) AS user_id
          ON CONFLICT (folder_id, user_id)
          DO UPDATE SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
        `,
        [companyId, folderId, session.user.id, userIds]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getFolderDocumentAccess(folderId, session);
}

export async function deleteTopic(topicId: string, session: AdminSession) {
  if (!topicId) {
    throw new TopicError("Topic is required.");
  }

  if (!isAdmin(session)) {
    throw new TopicError("Only admin users can delete folders.");
  }

  const result = await getPool().query<{ deleted_count: string }>(
    `
      WITH RECURSIVE topic_branch AS (
        SELECT id
        FROM topics
        WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT child.id
        FROM topics child
        INNER JOIN topic_branch parent ON parent.id = child.parent_id
        WHERE child.deleted_at IS NULL
      ),
      deleted_topics AS (
        UPDATE topics
        SET deleted_at = now(), updated_by = $2, updated_at = now()
        WHERE id IN (SELECT id FROM topic_branch)
        RETURNING id
      ),
      deleted_role_access AS (
        UPDATE role_topic_permissions
        SET deleted_at = now(), updated_by = $2, updated_at = now()
        WHERE topic_id IN (SELECT id FROM deleted_topics)
          AND deleted_at IS NULL
        RETURNING id
      ),
      deleted_user_access AS (
        UPDATE user_topic_permissions
        SET deleted_at = now(), updated_by = $2, updated_at = now()
        WHERE topic_id IN (SELECT id FROM deleted_topics)
          AND deleted_at IS NULL
        RETURNING id
      )
      SELECT COUNT(*) AS deleted_count FROM deleted_topics
    `,
    [topicId, session.user.id]
  );

  if (Number(result.rows[0]?.deleted_count ?? 0) === 0) {
    throw new TopicError("Topic was not found.");
  }
}

export async function grantTopicAccess(input: GrantTopicAccessInput, session: AdminSession) {
  if (!isAdmin(session)) {
    throw new TopicError("Only admin users can assign folder access.");
  }

  if (!input.topicId) {
    throw new TopicError("Topic is required.");
  }

  const roleIds = Array.from(new Set(input.roleIds ?? []));
  const userIds = Array.from(new Set(input.userIds ?? []));

  if (roleIds.length > 0) {
    await getPool().query(
      `
        INSERT INTO role_topic_permissions (topic_id, role_id, created_by, updated_by)
        SELECT $1, role_id, $2, $2
        FROM unnest($3::uuid[]) AS role_id
        ON CONFLICT (role_id, topic_id) WHERE deleted_at IS NULL
        DO UPDATE SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      [input.topicId, session.user.id, roleIds]
    );
  }

  if (userIds.length > 0) {
    await getPool().query(
      `
        INSERT INTO user_topic_permissions (topic_id, user_id, created_by, updated_by)
        SELECT $1, user_id, $2, $2
        FROM unnest($3::uuid[]) AS user_id
        ON CONFLICT (user_id, topic_id) WHERE deleted_at IS NULL
        DO UPDATE SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
      `,
      [input.topicId, session.user.id, userIds]
    );
  }
}
