# Multi-Company Architecture Refactoring - Implementation Guide

## Overview
This refactoring changes how user-company-role relationships work:

**Before**: Users had single `company_id` and `role_id` directly in the `users` table
**After**: Users access multiple companies via `user_company_roles` junction table; system context is per-company

## Database Changes

### Migration: `069_refactor_user_company_roles.sql`
Located in `db/migrations/069_refactor_user_company_roles.sql`

**Changes**:
1. Add `is_primary` flag to `user_company_roles` (marks default company on login)
2. Add `company_id` to `roles` table with NOT NULL constraint (company-specific roles)
3. Remove `company_id` and `role_id` from `users` table
4. Create indices for fast lookups

**Before running**:
- Backup your database
- Review the migration SQL
- This is a one-way migration for development (company_id & role_id permanently moved)

## Backend Changes

### 1. Updated Type System (`lib/admin/auth.ts`)
```typescript
export type UserCompanyAccess = {
  companyId: string;
  companyName: string;
  companySlug: string;
  roleId: string;
  roleName: string;
  isPrimary: boolean;
};

export type AdminSession = {
  // ... existing fields ...
  availableCompanies: UserCompanyAccess[]; // NEW
};
```

### 2. Updated Session Handler (`lib/admin/session.ts`)
- `createAdminSession()`: Now fetches from `user_company_roles`, selects primary company
- `getCurrentAdminSession()`: Retrieves current company context from session
- `switchCompanyContext()`: New function to change current company (called by API)
- `getUserCompanyAccess()`: New helper to fetch all user's companies

### 3. New Session API Endpoints

**GET /api/session/available-companies**
```json
{
  "currentCompanyId": "uuid",
  "currentCompanyName": "string",
  "availableCompanies": [
    {
      "id": "uuid",
      "name": "string",
      "slug": "string",
      "roleId": "uuid",
      "roleName": "string",
      "isPrimary": boolean
    }
  ]
}
```

**POST /api/session/set-company**
```json
{
  "companyId": "uuid"
}
```
Response: `{ "success": true, "message": "..." }`
Full page refresh needed to load new company data

## Frontend Changes

### 1. New Hook (`lib/admin/hooks/use-company-context.ts`)
```typescript
const { currentCompanyId, availableCompanies, switchCompany } = useCompanyContext();
```

### 2. New Component (`components/admin/company-context-switcher.tsx`)
Add to your header layout to display company selector:
```tsx
<CompanyContextSwitcher />
```

### 3. Update Layout
Add company switcher to main layout/header:
```tsx
// app/control-panel/layout.tsx or your main header
import { CompanyContextSwitcher } from "@/components/admin/company-context-switcher";

export default function Layout({ children }) {
  return (
    <div>
      <header className="flex justify-between items-center p-4">
        <Logo />
        <nav>...</nav>
        <CompanyContextSwitcher />
        <UserMenu />
      </header>
      {children}
    </div>
  );
}
```

### 4. Remove Company Dropdowns from Pages
Search for and remove company selectors from these pages:
- `app/admin/employees/` - Remove company filter dropdown
- `app/admin/users/` - Remove company selection
- `app/admin/content-structure/` - Remove company dropdown
- `app/admin/master-data/` - Remove company selector
- Any other page with company-specific dropdown

Replace with direct use of `session.user.tenantId`:
```typescript
// OLD
const [selectedCompany, setSelectedCompany] = useState(companyId);
<select value={selectedCompany} onChange={...} />

// NEW
const session = await getCurrentAdminSession();
const companyId = session.user.tenantId; // Use directly
```

## API Endpoint Updates

### Pattern: Update all endpoints to use session company context

**Before**:
```typescript
// app/api/admin/users/route.ts
const { companyId } = req.query || req.body;
const users = await db.query(`
  SELECT * FROM users WHERE company_id = $1
`, [companyId]);
```

**After**:
```typescript
// app/api/admin/users/route.ts
const session = await getCurrentAdminSession();
const companyId = session.user.tenantId; // Get from session
const users = await db.query(`
  SELECT u.* FROM users u
  JOIN user_company_roles ucr ON ucr.user_id = u.id
  WHERE ucr.company_id = $1 AND ucr.deleted_at IS NULL
`, [companyId]);
```

### Endpoints to Update
Priority order:

1. **User Management** (`app/api/admin/user-management`)
   - Query: Add JOIN to `user_company_roles`
   - Validate: Check `session.user.tenantId` matches requested company

2. **Content Structure** (`app/api/admin/content-structure`)
   - Query: Use `session.user.tenantId` for company filter
   - Remove: companyId parameter from request

3. **Documents** (`app/api/admin/documents`)
   - Query: Use `session.user.tenantId`
   - Validation: Already has permission checks

4. **Topics** (`app/api/admin/guided-workflow-topics`)
   - Query: Use `session.user.tenantId`

5. **Search** (`app/api/admin/search/*`)
   - Query: Use `session.user.tenantId`

6. **All other admin endpoints**: Follow same pattern

## Implementation Steps

### Phase 1: Database
- [ ] Review migration file
- [ ] Run migration in dev database: `npm run db:migrate` or similar
- [ ] Verify roles now have company_id
- [ ] Verify users table no longer has company_id/role_id

### Phase 2: Backend
- [ ] Auth types updated ✅ (done)
- [ ] Session logic updated ✅ (done)
- [ ] Session API endpoints created ✅ (done)
- [ ] Verify TypeScript compilation: `npm run build`

### Phase 3: Frontend
- [ ] Company context hook created ✅ (done)
- [ ] Company switcher component created ✅ (done)
- [ ] Add to layout/header
- [ ] Test switching companies (page should refresh)

### Phase 4: API Migration
- [ ] Identify all endpoints using companyId
- [ ] Update each to use `session.user.tenantId`
- [ ] Remove companyId from request params
- [ ] Test each endpoint with multi-company user

### Phase 5: UI Cleanup
- [ ] Remove company dropdowns from pages
- [ ] Test page load with different companies
- [ ] Verify data isolation (company A sees only company A data)

## Testing Checklist

- [ ] Create user with access to 2 companies
- [ ] Login - should load with primary company
- [ ] Switch company in header dropdown
- [ ] Page refreshes and shows new company data
- [ ] Employees list shows only employees from that company
- [ ] User has different role in different companies - verify permissions
- [ ] Logout and login again - should load with primary company
- [ ] Each company's data is isolated (no data leakage)

## Rollback Plan

If issues occur:
1. Keep database backup from before migration
2. Restore backup if needed
3. Revert session.ts and auth.ts to previous versions
4. The code is backwards-compatible with old schema temporarily

## Key Files Modified/Created

### New Files
- `db/migrations/069_refactor_user_company_roles.sql` - Database schema
- `lib/admin/auth.ts` - Updated types (UserCompanyAccess, AdminSession)
- `lib/admin/session.ts` - Refactored session management
- `app/api/session/available-companies/route.ts` - API endpoint
- `app/api/session/set-company/route.ts` - API endpoint
- `lib/admin/hooks/use-company-context.ts` - React hook
- `components/admin/company-context-switcher.tsx` - React component
- `MULTI_COMPANY_MIGRATION.md` - This guide

### Modified Files
- `lib/admin/auth.ts` - Type definitions
- `lib/admin/session.ts` - Session logic

## Next Steps

1. **Run database migration**
   ```bash
   # Your database migration command
   npm run db:migrate
   ```

2. **Verify compilation**
   ```bash
   npm run build
   ```

3. **Test locally**
   - Create test user with multi-company access
   - Test login and company switching
   - Test data isolation

4. **Update remaining API endpoints** (see checklist above)

5. **Update test suite** if you have integration tests

## Support

If you need to understand any specific part:
- Check `lib/admin/session.ts` for authentication flow
- Check `app/api/session/` for API implementation
- Check `components/admin/company-context-switcher.tsx` for UI
- Check migration file for database structure
