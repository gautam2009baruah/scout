ALTER TABLE topics
ADD COLUMN IF NOT EXISTS role_access_all boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS user_access_all boolean NOT NULL DEFAULT true;

WITH role_counts AS (
  SELECT
    topics.id,
    COUNT(DISTINCT roles.id) AS total_roles,
    COUNT(DISTINCT role_topic_permissions.role_id) AS granted_roles
  FROM topics
  LEFT JOIN roles ON roles.company_id = topics.company_id
    AND roles.deleted_at IS NULL
  LEFT JOIN role_topic_permissions ON role_topic_permissions.topic_id = topics.id
    AND role_topic_permissions.deleted_at IS NULL
  WHERE topics.deleted_at IS NULL
  GROUP BY topics.id
)
UPDATE topics
SET role_access_all = role_counts.granted_roles = 0 OR role_counts.granted_roles >= role_counts.total_roles
FROM role_counts
WHERE topics.id = role_counts.id;

WITH user_counts AS (
  SELECT
    topics.id,
    COUNT(DISTINCT users.id) AS total_users,
    COUNT(DISTINCT user_topic_permissions.user_id) AS granted_users
  FROM topics
  LEFT JOIN user_company_roles ON user_company_roles.company_id = topics.company_id
    AND user_company_roles.deleted_at IS NULL
  LEFT JOIN users ON users.deleted_at IS NULL
    AND users.status = 'active'
    AND (users.company_id = topics.company_id OR users.id = user_company_roles.user_id)
  LEFT JOIN user_topic_permissions ON user_topic_permissions.topic_id = topics.id
    AND user_topic_permissions.deleted_at IS NULL
  WHERE topics.deleted_at IS NULL
  GROUP BY topics.id
)
UPDATE topics
SET user_access_all = user_counts.granted_users = 0 OR user_counts.granted_users >= user_counts.total_users
FROM user_counts
WHERE topics.id = user_counts.id;
