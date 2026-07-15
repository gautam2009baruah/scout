import { getPool } from "@/lib/db/pool";
import { getStorageProvider } from "@/lib/storage/provider";
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
  targetAppIds: string[];
  targetAppNames: string[];
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
  targetAppIds?: string[];
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
  targetAppIds?: string[];
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

async function validateTargetAppIds(companyId: string, targetAppIds: string[], session: AdminSession) {
  const uniqueIds = Array.from(new Set(targetAppIds));
  if (uniqueIds.length === 0) return uniqueIds;
  const result = await getPool().query<{ id: string }>(`
    SELECT app.id
    FROM guided_workflow_target_apps app
    WHERE app.company_id = $1
      AND app.id = ANY($2::uuid[])
      AND (
        $3::boolean = true
        OR NOT EXISTS (
          SELECT 1 FROM user_target_app_access scope
          INNER JOIN guided_workflow_target_apps scoped_app ON scoped_app.id = scope.target_app_id
          WHERE scope.user_id = $4 AND scope.deleted_at IS NULL AND scoped_app.company_id = $1
        )
        OR EXISTS (
          SELECT 1 FROM user_target_app_access allowed
          WHERE allowed.user_id = $4 AND allowed.target_app_id = app.id AND allowed.deleted_at IS NULL
        )
      )
  `, [companyId, uniqueIds, isAdmin(session), session.user.id]);
  if (result.rows.length !== uniqueIds.length) throw new TopicError("One or more selected target apps are unavailable.");
  return uniqueIds;
}

async function replaceFolderTargetApps(folderId: string, companyId: string, targetAppIds: string[], session: AdminSession) {
  const ids = await validateTargetAppIds(companyId, targetAppIds, session);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`UPDATE folder_target_apps SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE folder_id = $1 AND deleted_at IS NULL`, [folderId, session.user.id]);
    if (ids.length > 0) {
      await client.query(`
        INSERT INTO folder_target_apps (company_id, folder_id, target_app_id, created_by, updated_by)
        SELECT $1, $2, target_app_id, $3, $3 FROM unnest($4::uuid[]) AS target_app_id
        ON CONFLICT (folder_id, target_app_id) DO UPDATE
        SET deleted_at = NULL, updated_by = EXCLUDED.updated_by, updated_at = now()
      `, [companyId, folderId, session.user.id, ids]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

async function assertFolderTargetAppAccess(folderId: string, companyId: string, session: AdminSession) {
  if (isAdmin(session)) return;
  const result = await getPool().query<{ target_app_id: string }>(
    "SELECT target_app_id FROM folder_target_apps WHERE folder_id = $1 AND deleted_at IS NULL",
    [folderId]
  );
  if (result.rows.length === 0) return;
  try {
    await validateTargetAppIds(companyId, result.rows.map((row) => row.target_app_id), session);
  } catch (error) {
    if (error instanceof TopicError) {
      throw new TopicError("You cannot modify this folder because you do not have access to one or more of its assigned target apps.");
    }
    throw error;
  }
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
  target_app_ids: string[];
  target_app_names: string[];
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
    targetAppIds: row.target_app_ids ?? [],
    targetAppNames: row.target_app_names ?? [],
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
        SELECT folders.id AS topic_id
        FROM folders
        LEFT JOIN user_company_roles ON user_company_roles.company_id = folders.company_id
          AND user_company_roles.user_id = $1
          AND user_company_roles.deleted_at IS NULL
        WHERE folders.deleted_at IS NULL
          AND (folders.role_access_all = true OR folders.user_access_all = true)
          AND (folders.company_id = $3 OR user_company_roles.user_id IS NOT NULL)
      ),
      visible_topics AS (
        SELECT folders.id
        FROM folders
        INNER JOIN seed_topics ON seed_topics.topic_id = folders.id
        WHERE folders.deleted_at IS NULL
        UNION
        SELECT child.id
        FROM folders child
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
        AND user_company_roles.status = 'active'
      WHERE users.deleted_at IS NULL
        AND users.status = 'active'
        AND user_company_roles.user_id IS NOT NULL
    `,
    [companyId]
  );

  return result.rows.map((row) => row.id);
}

export async function getTopicWorkspace(session: AdminSession) {
  const accessibleTopicIds = await getAccessibleTopicIds(session);
  const params: unknown[] = [];
  const visibleFilter = accessibleTopicIds ? "AND folders.id = ANY($1::uuid[])" : "";

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
    target_app_ids: string[];
    target_app_names: string[];
    created_at: Date;
  }>(
    `
      SELECT
        folders.id,
        folders.company_id,
        companies.name AS company_name,
        folders.parent_id,
        folders.name,
        folders.slug,
        folders.description,
        folders.role_access_all,
        folders.user_access_all,
        (
          SELECT COUNT(*)
          FROM documents
          WHERE documents.folder_id = folders.id
            AND documents.status <> 'deleted'
        ) AS document_count,
        COALESCE((
          SELECT array_agg(folder_target_apps.target_app_id ORDER BY folder_target_apps.target_app_id)
          FROM folder_target_apps
          WHERE folder_target_apps.folder_id = folders.id
            AND folder_target_apps.deleted_at IS NULL
        ), ARRAY[]::uuid[]) AS target_app_ids,
        COALESCE((
          SELECT array_agg(guided_workflow_target_apps.name ORDER BY guided_workflow_target_apps.name)
          FROM folder_target_apps
          INNER JOIN guided_workflow_target_apps ON guided_workflow_target_apps.id = folder_target_apps.target_app_id
          WHERE folder_target_apps.folder_id = folders.id
            AND folder_target_apps.deleted_at IS NULL
        ), ARRAY[]::text[]) AS target_app_names,
        folders.created_at
      FROM folders
      INNER JOIN companies ON companies.id = folders.company_id
      WHERE folders.deleted_at IS NULL
        AND companies.deleted_at IS NULL
        ${visibleFilter}
      ORDER BY companies.name ASC, folders.name ASC
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
  const grantFilter = accessibleTopicIds ? "AND folders.id = ANY($1::uuid[])" : "";

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
          folders.id AS topic_id,
          folders.name AS topic_name,
          roles.id AS assignee_id,
          roles.name AS assignee_name,
          'role'::text AS type
        FROM role_topic_permissions
        INNER JOIN folders ON folders.id = role_topic_permissions.topic_id
        INNER JOIN roles ON roles.id = role_topic_permissions.role_id
        WHERE role_topic_permissions.deleted_at IS NULL
          AND folders.deleted_at IS NULL
          AND roles.deleted_at IS NULL
          ${grantFilter}
        UNION ALL
        SELECT
          user_topic_permissions.id,
          folders.id AS topic_id,
          folders.name AS topic_name,
          users.id AS assignee_id,
          users.name AS assignee_name,
          'user'::text AS type
        FROM user_topic_permissions
        INNER JOIN folders ON folders.id = user_topic_permissions.topic_id
        INNER JOIN users ON users.id = user_topic_permissions.user_id
        WHERE user_topic_permissions.deleted_at IS NULL
          AND folders.deleted_at IS NULL
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
          min(member_companies.name) AS company_name
        FROM users
        INNER JOIN user_company_roles ON user_company_roles.user_id = users.id
          AND user_company_roles.deleted_at IS NULL
          AND user_company_roles.status = 'active'
        INNER JOIN companies member_companies ON member_companies.id = user_company_roles.company_id
          AND member_companies.deleted_at IS NULL
        WHERE users.deleted_at IS NULL
          AND users.status = 'active'
        GROUP BY users.id
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
    throw new TopicError("Company and folder name are required.");
  }

  await assertCanCreateUnder(parentId, session);

  if (parentId) {
    const parentResult = await getPool().query<{ company_id: string }>(
      "SELECT company_id FROM folders WHERE id = $1 AND deleted_at IS NULL",
      [parentId]
    );

    if (!parentResult.rows[0]) {
      throw new TopicError("Parent folder was not found.");
    }

    if (parentResult.rows[0].company_id !== input.companyId) {
      throw new TopicError("Subfolders must belong to the same company as their parent folder.");
    }
    await assertFolderTargetAppAccess(parentId, input.companyId, session);
  }

  try {
    const allRoles = input.allRoles !== false;
    const allUsers = input.allUsers !== false;
    const result = await getPool().query<{ id: string }>(
      `
        INSERT INTO folders (
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

    let targetAppIds = input.targetAppIds;
    if (typeof targetAppIds === "undefined" && parentId) {
      const inherited = await getPool().query<{ target_app_id: string }>("SELECT target_app_id FROM folder_target_apps WHERE folder_id = $1 AND deleted_at IS NULL", [parentId]);
      targetAppIds = inherited.rows.map((row) => row.target_app_id);
    }
    await replaceFolderTargetApps(result.rows[0].id, input.companyId, targetAppIds ?? [], session);

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
    throw new TopicError("Folder name is required.");
  }

  if (!isAdmin(session)) {
    const accessibleTopicIds = await getAccessibleTopicIds(session);

    if (!accessibleTopicIds?.has(topicId)) {
      throw new TopicError("You do not have permission to edit this folder.");
    }
    await assertFolderTargetAppAccess(topicId, await getTopicCompanyId(topicId), session);
  }

  try {
    const allRoles = input.allRoles === true;
    const allUsers = input.allUsers === true;
    const result = isAdmin(session)
      ? await getPool().query(
        `
          UPDATE folders
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
          UPDATE folders
          SET name = $2, slug = $3, updated_by = $4, updated_at = now()
          WHERE id = $1 AND deleted_at IS NULL
        `,
        [topicId, name, slug, session.user.id]
      );

    if (result.rowCount !== 1) {
      throw new TopicError("Folder was not found.");
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
    const companyId = await getTopicCompanyId(topicId);
    await replaceFolderTargetApps(topicId, companyId, input.targetAppIds ?? [], session);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "23505") {
      throw new TopicError("A folder with this name already exists at this level.");
    }

    throw error;
  }
}

async function getTopicCompanyId(topicId: string) {
  const result = await getPool().query<{ company_id: string }>(
    "SELECT company_id FROM folders WHERE id = $1 AND deleted_at IS NULL",
    [topicId]
  );

  const companyId = result.rows[0]?.company_id;

  if (!companyId) {
    throw new TopicError("Folder was not found.");
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
    throw new TopicError("Folder is required.");
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
    throw new TopicError("Folder is required.");
  }

  if (!isAdmin(session)) {
    throw new TopicError("Only admin users can delete folders.");
  }

  const client = await getPool().connect();
  const storagePaths = new Set<string>();

  try {
    await client.query("BEGIN");
    const branchResult = await client.query<{ id: string }>(`
      WITH RECURSIVE topic_branch AS (
        SELECT id FROM folders WHERE id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT child.id FROM folders child
        INNER JOIN topic_branch parent ON parent.id = child.parent_id
        WHERE child.deleted_at IS NULL
      )
      SELECT id FROM topic_branch
    `, [topicId]);
    const topicIds = branchResult.rows.map((row) => row.id);
    if (topicIds.length === 0) throw new TopicError("Folder was not found.");

    const documentResult = await client.query<{ id: string; storage_path: string | null; parsed_file_path: string | null }>(`
      SELECT documents.id, documents.storage_path, document_parsed_contents.parsed_file_path
      FROM documents
      LEFT JOIN document_parsed_contents ON document_parsed_contents.document_id = documents.id
      WHERE documents.folder_id = ANY($1::uuid[])
    `, [topicIds]);
    const documentIds = documentResult.rows.map((row) => row.id);
    for (const row of documentResult.rows) {
      if (row.storage_path) storagePaths.add(row.storage_path);
      if (row.parsed_file_path) storagePaths.add(row.parsed_file_path);
    }

    // Sources and their sync runs/items are no longer valid once their folder is deleted.
    await client.query("DELETE FROM ingestion_sources WHERE folder_id = ANY($1::uuid[])", [topicIds]);

    if (documentIds.length > 0) {
      // Delete RESTRICT-linked data from the leaves upward. CASCADE relations are
      // also named explicitly so the retention behavior remains obvious.
      await client.query("DELETE FROM chunk_embeddings WHERE document_id = ANY($1::uuid[])", [documentIds]);
      await client.query("DELETE FROM processing_jobs WHERE document_id = ANY($1::uuid[])", [documentIds]);
      await client.query("DELETE FROM document_pages WHERE document_id = ANY($1::uuid[])", [documentIds]);
      await client.query("DELETE FROM document_parsed_contents WHERE document_id = ANY($1::uuid[])", [documentIds]);
      await client.query("DELETE FROM document_chunks WHERE document_id = ANY($1::uuid[])", [documentIds]);
      await client.query("DELETE FROM document_role_permissions WHERE document_id = ANY($1::uuid[])", [documentIds]);
      await client.query("DELETE FROM document_user_permissions WHERE document_id = ANY($1::uuid[])", [documentIds]);
      await client.query("DELETE FROM documents WHERE id = ANY($1::uuid[])", [documentIds]);
    }

    // Only topic rows survive for audit. All auxiliary access data is disposable.
    await client.query("UPDATE folder_target_apps SET deleted_at = now(), updated_by = $2, updated_at = now() WHERE folder_id = ANY($1::uuid[]) AND deleted_at IS NULL", [topicIds, session.user.id]);
    await client.query("DELETE FROM folder_document_role_permissions WHERE folder_id = ANY($1::uuid[])", [topicIds]);
    await client.query("DELETE FROM folder_document_user_permissions WHERE folder_id = ANY($1::uuid[])", [topicIds]);
    await client.query("DELETE FROM role_topic_permissions WHERE topic_id = ANY($1::uuid[])", [topicIds]);
    await client.query("DELETE FROM user_topic_permissions WHERE topic_id = ANY($1::uuid[])", [topicIds]);
    await client.query(`
      UPDATE folders
      SET deleted_at = now(), updated_by = $2, updated_at = now()
      WHERE id = ANY($1::uuid[])
    `, [topicIds, session.user.id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const storage = getStorageProvider();
  const failures: string[] = [];
  await Promise.all(Array.from(storagePaths).map(async (storagePath) => {
    try { await storage.delete_file(storagePath); } catch { failures.push(storagePath); }
  }));
  if (failures.length > 0) {
    console.error("Folder data was deleted but some stored files could not be removed", { topicId, failures });
  }
}

export async function grantTopicAccess(input: GrantTopicAccessInput, session: AdminSession) {
  if (!isAdmin(session)) {
    throw new TopicError("Only admin users can assign folder access.");
  }

  if (!input.topicId) {
    throw new TopicError("Folder is required.");
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
