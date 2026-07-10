# Scout Database Schema Summary

## 1. CORE ENTITIES

### Companies Table
```sql
CREATE TABLE companies (
  id uuid PRIMARY KEY
  name text NOT NULL
  slug text NOT NULL UNIQUE
  status text CHECK (status IN ('active', 'suspended', 'archived'))
  created_by uuid (references users)
  created_at timestamptz
  updated_at timestamptz
)
```
- **Purpose**: Multi-tenant container for all data
- **Status Values**: active, suspended, archived
- **Index**: Unique on slug

---

### Roles Table
```sql
CREATE TABLE roles (
  id uuid PRIMARY KEY
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE
  name text NOT NULL
  description text
  is_system boolean (default: false)
  is_admin_role boolean (default: false)
  created_by uuid (references users)
  created_at timestamptz
  updated_at timestamptz
  UNIQUE (company_id, name)
)
```
- **Key Features**:
  - Can be global (company_id = NULL for system roles) or company-specific
  - System roles: Owner, Admin, Operator, Auditor (created in migration 001)
  - Admin roles (Owner, Admin) have flag `is_admin_role = true`
- **Index**: Unique on (company_id, name) for company roles; unique on name WHERE company_id IS NULL for global roles
- **Relationships**: One role → many users, many-to-many with modules via role_module_permissions

---

### Users Table
```sql
CREATE TABLE users (
  id uuid PRIMARY KEY
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT
  name text NOT NULL
  email text NOT NULL
  password_hash text
  status text CHECK (status IN ('active', 'invited', 'disabled'))
  employee_code text (nullable, unique per company)
  phone text
  can_view_chatbot boolean (default: false)
  activated_at timestamptz
  invited_at timestamptz
  last_login_at timestamptz
  must_change_password boolean (default: false)
  created_by uuid (references users)
  deleted_at timestamptz (soft delete)
  created_at timestamptz
  updated_at timestamptz
  UNIQUE (company_id, email)
  UNIQUE (company_id, employee_code) WHERE employee_code IS NOT NULL
}
```
- **Key Features**:
  - **Primary company_id**: User's main company (in primary users row)
  - **Primary role_id**: User's role in their primary company
  - Soft delete support via deleted_at
  - Status: active, invited, disabled
- **Indices**: 
  - company_id, role_id, status, email, name
  - Composite: (company_id, status), (company_id, email), (company_id, name)

---

### User Sessions Table
```sql
CREATE TABLE user_sessions (
  id uuid PRIMARY KEY
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE
  token_hash text NOT NULL UNIQUE
  expires_at timestamptz NOT NULL
  last_seen_at timestamptz
  revoked_at timestamptz (nullable)
  created_at timestamptz
)
```
- **Key Features**:
  - Tracks active sessions with hashed tokens
  - Session lifetime: 15 minutes (ADMIN_SESSION_MINUTES), auto-extending on activity
  - Can be revoked via revoked_at
- **Indices**: user_id, expires_at for cleanup queries

---

## 2. MULTI-COMPANY ACCESS

### User Company Roles Table (Bridge Table)
```sql
CREATE TABLE user_company_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT
  created_by uuid (references users)
  updated_by uuid (references users)
  deleted_at timestamptz (soft delete)
  created_at timestamptz
  updated_at timestamptz
  PRIMARY KEY (user_id, company_id)
}
```
- **Purpose**: Allow single user to have roles in multiple companies
- **Relationship**: Many-to-many between users and company-specific roles
- **Key Feature**: If user has an admin_role here, they get all company permissions
- **Indices**: company_id, role_id, deleted_at

---

## 3. PERMISSIONS & ACCESS CONTROL

### Modules Table
```sql
CREATE TABLE modules (
  key integer PRIMARY KEY
  name text NOT NULL
  href text NOT NULL
  sort_order integer
  created_at timestamptz
)
```
- **System Modules** (key-based):
  - 1 = Overview (`/control-panel`)
  - 2 = Administration (`/control-panel/administration`)
  - 3 = User Management (`/control-panel/user-management`)
  - (More can be added via migrations)

---

### Role Module Permissions Table
```sql
CREATE TABLE role_module_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE
  module_key integer NOT NULL REFERENCES modules(key) ON DELETE CASCADE
  created_by uuid (references users)
  updated_by uuid (references users)
  updated_at timestamptz
  deleted_at timestamptz (soft delete)
  created_at timestamptz
  PRIMARY KEY (role_id, module_key)
}
```
- **Purpose**: Define which modules each role can access
- **Assignment**: Admin roles (Owner, Admin) get all modules by default
- **Soft Delete**: Can disable module access without removing record
- **Indices**: module_key, deleted_at

---

### User Module Overrides Table
```sql
CREATE TABLE user_module_overrides (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  module_key integer NOT NULL REFERENCES modules(key) ON DELETE CASCADE
  effect text NOT NULL CHECK (effect IN ('allow', 'deny'))
  created_by uuid (references users)
  PRIMARY KEY (user_id, module_key)
)
```
- **Purpose**: Per-user exceptions to role-based module permissions
- **Effect**: 'allow' or 'deny' (deny takes precedence)
- **Use Case**: Grant/restrict specific modules to individual users regardless of role
- **Query Logic**: Merged permissions = (role permissions) + (user overrides with deny precedence)

---

## 4. DOCUMENT & CONTENT ACCESS CONTROL

### Document Role Permissions
```sql
CREATE TABLE document_role_permissions (
  id uuid PRIMARY KEY
  company_id uuid NOT NULL REFERENCES companies(id)
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE
  created_by uuid (references users)
  updated_by uuid (references users)
  deleted_at timestamptz (soft delete)
  created_at timestamptz
  updated_at timestamptz
  UNIQUE (document_id, role_id)
)
```
- **Purpose**: Grant document access to specific roles
- **Indices**: document_id, role_id (WHERE deleted_at IS NULL)

---

### Document User Permissions
```sql
CREATE TABLE document_user_permissions (
  id uuid PRIMARY KEY
  company_id uuid NOT NULL REFERENCES companies(id)
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE
  created_by uuid (references users)
  updated_by uuid (references users)
  deleted_at timestamptz (soft delete)
  created_at timestamptz
  updated_at timestamptz
  UNIQUE (document_id, user_id)
)
```
- **Purpose**: Grant document access to specific individual users
- **Soft Delete**: Can revoke access without deleting record

---

### Folder/Topic Permissions (Similar Structure)
```sql
folder_document_role_permissions - folder_id, role_id, company_id
folder_document_user_permissions - folder_id, user_id, company_id
```

---

## 5. AUTHENTICATION & SESSION MANAGEMENT

### Flow: Login & Session Creation

**Step 1: Sign In** (lib/admin/session.ts: `createAdminSession()`)
```
Input: email + password
Query: 
  SELECT users.* FROM users
  INNER JOIN roles ON roles.id = users.role_id
  WHERE users.email = $1 AND users.deleted_at IS NULL
Returns: User with company_id, role_id, is_admin_role
Verify: Check password_hash against input password
```

**Step 2: Create Session Token**
```
Generate: Random 32-byte token
Hash: SHA256(token) → stored in DB as token_hash
Duration: Expires in 15 minutes
Store: user_sessions table with (user_id, company_id, token_hash, expires_at)
Return: Token to client (stored in scout_admin_session cookie)
```

**Step 3: Session Retrieval** (lib/admin/session.ts: `getCurrentAdminSession()`)
```
Input: Cookie token
Query:
  SELECT users.*, roles.is_admin_role FROM user_sessions
  INNER JOIN users, roles, companies
  WHERE token_hash = SHA256($1)
    AND expires_at > now()
    AND revoked_at IS NULL
    AND users.status = 'active'
Auto-extend: Update expires_at to +15 minutes
Returns: AdminSession object with user + tenant context
```

### Session Object (AdminSession Type)
```typescript
{
  user: {
    id: string,
    tenantId: string (= user.company_id),
    name: string,
    email: string,
    roleId: string (= user.role_id),
    isAdminRole: boolean,
    isActive: boolean,
    mustChangePassword: boolean
  },
  tenant: {
    tenantId: string,
    slug: string,
    name: string
  },
  modules: AdminModule[] (computed from role permissions),
  expiresAt: Date
}
```

---

## 6. HOW COMPANY_ID & ROLE_ID ARE USED

### In Users Table
- **company_id**: User's primary/main company
- **role_id**: User's role in their primary company
- Only 1 company_id per user record in users table

### In User Company Roles (Multi-Company)
- Additional company access via user_company_roles bridge table
- Can have different role in each company
- Example:
  ```
  users table:       user_id=123, company_id=A, role_id=ADMIN_in_A
  user_company_roles: (user_id=123, company_id=B, role_id=OPERATOR_in_B)
  user_company_roles: (user_id=123, company_id=C, role_id=VIEWER_in_C)
  ```

### In Queries
1. **User Management** (`lib/admin/user-management.ts`):
   - Filter by company_id: `users.company_id = $1 OR EXISTS (user_company_roles WHERE company_id = $1)`
   - Filter by role_id: `users.role_id = $2 OR user_company_roles.role_id = $2`

2. **Vector Search** (`lib/search/vector-search.ts`):
   ```sql
   -- Get user's role IDs for company
   SELECT roles.id FROM users
   INNER JOIN roles WHERE users.role_id = $1
   UNION
   SELECT roles.id FROM user_company_roles
   WHERE user_id = $1 AND company_id = $2
   
   -- If any role is_admin_role=true, get ALL roles for company
   -- Otherwise, return user's specific role IDs
   ```

3. **Document Access** (`lib/search/vector-search.ts: documentPermissionClause()`):
   ```sql
   EXISTS (
     SELECT 1 FROM document_role_permissions
     WHERE document_id = $X
     AND role_id = ANY($roleIds[])  -- user's role IDs
   )
   OR EXISTS (
     SELECT 1 FROM document_user_permissions
     WHERE document_id = $X
     AND user_id = $userId
   )
   ```

---

## 7. API ENDPOINTS USING COMPANY_ID / ROLE_ID

| Endpoint | Method | Purpose | Uses |
|----------|--------|---------|------|
| `/api/admin/user-management` | POST | Register new employee | companyId, roleId, companyIds |
| `/api/admin/user-management` | GET | List employees (paginated) | Filters: companyId, roleId, status |
| `/api/admin/user-management/[id]` | PUT | Update employee | companyIds, roleId, status |
| `/api/admin/user-management/[id]` | DELETE | Delete/soft-delete employee | User record |
| `/api/admin/user-companies` | GET | Get user's accessible companies | session.user.tenantId → user_company_roles |
| `/api/admin/search/vector` | POST | Vector search with permission check | company_id, user's role_ids |
| `/api/admin/search/keyword` | POST | Keyword search with permission check | company_id, user's role_ids |
| `/api/admin/retrieval/test` | POST | Test retrieval | company_id defaults to session.user.tenantId |
| `/api/admin/documents` | GET | List documents | Filtered by company_id |
| `/api/admin/email-credentials` | POST | Email provider setup | company_id |
| `/api/admin/guided-workflows` | POST | Create workflow | company_id |
| `/api/admin/orchestrations/triggers/monitoring` | GET | Monitor triggers | company_id + user_company_roles |

---

## 8. PERMISSION RESOLUTION LOGIC

### Module Access (getEffectiveUserModules)
1. Get user's role's module permissions
2. Get user's company role module permissions (if multi-company)
3. Merge with user module overrides (deny takes precedence)
4. Return: Array of accessible module keys

### Document Access (documentPermissionClause)
1. Check if document has any role/user permissions set
2. If yes: Check if user's role_ids OR user_id matches
3. If no role/user permissions exist: Only creator/admin can access
4. Return: Row-level filtering clause for SQL

### Admin Role Bypass
- If user has ANY `is_admin_role = true` role:
  - Gets access to all modules in that company
  - Gets access to all documents in that company
  - Queries return ALL company roles instead of specific role filtering

---

## 9. CURRENT SCHEMA PATTERNS

### Soft Delete Pattern
All main tables support soft delete:
- `users.deleted_at`
- `companies.deleted_at` 
- `roles.deleted_at`
- `user_company_roles.deleted_at`
- `role_module_permissions.deleted_at`
- `document_role_permissions.deleted_at`
- `document_user_permissions.deleted_at`
- `user_module_overrides.deleted_at` (via table existence)

Queries exclude soft-deleted records: `WHERE deleted_at IS NULL`

### Audit Trail Pattern
Tables track who made changes:
- `created_by: uuid` → references user who created
- `updated_by: uuid` → references user who last updated
- `created_at: timestamptz`
- `updated_at: timestamptz`

### Composite Keys
- `users`: UNIQUE (company_id, email)
- `roles`: UNIQUE (company_id, name)
- `user_company_roles`: PRIMARY KEY (user_id, company_id)
- `role_module_permissions`: PRIMARY KEY (role_id, module_key)
- `document_role_permissions`: UNIQUE (document_id, role_id)
- `document_user_permissions`: UNIQUE (document_id, user_id)

---

## 10. SUMMARY OF KEY RELATIONSHIPS

```
companies (1) ─── (many) users [primary company]
companies (1) ─── (many) roles
companies (1) ─── (many) user_company_roles

users (1) ─── (many) user_company_roles
users (many) ─── (many) companies [via user_company_roles]

roles (1) ─── (many) users [role_id]
roles (1) ─── (many) user_company_roles [role_id]
roles (many) ─── (many) modules [via role_module_permissions]

modules (1) ─── (many) role_module_permissions
modules (1) ─── (many) user_module_overrides

documents (1) ─── (many) document_role_permissions
documents (1) ─── (many) document_user_permissions

user_company_roles: Bridge for multi-company assignment
role_module_permissions: Controls module-level access
document_role_permissions: Controls document-level access
user_module_overrides: Exceptions to role-based module access
```

---

## 11. NOTES FOR ENHANCEMENT

### Current Limitations
1. A user can only have ONE primary role in users table
2. Multi-company roles are separate from primary company role
3. Role inheritance not implemented (flat role structure)
4. No time-based access restrictions (e.g., role active_from/active_to)
5. No role provisioning workflows

### Potential Improvements
1. Add `user_company_roles` as the primary structure (deprecate users.role_id)
2. Implement role hierarchies with parent_role_id
3. Add time-based access windows
4. Add role templates for bulk assignments
5. Add permission groups for granular access
6. Add session audit logs
7. Add role approval workflows
