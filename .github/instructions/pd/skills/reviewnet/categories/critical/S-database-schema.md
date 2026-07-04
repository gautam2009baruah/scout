# Category S: Database Schema & Migrations

## Priority: CRITICAL (Phase 1)
**Blocking Status:** YES - Schema changes affect production deployments and rollback strategies

## Overview
Validates database schema changes, migration scripts, and data migration logic to ensure zero-downtime deployments, rollback capability, and data integrity during schema evolution.

## Critical Checks

### 1. Migration Script Quality
- [ ] Migration scripts are idempotent (safe to run multiple times)
- [ ] Script includes existence checks (`IF NOT EXISTS`, `IF OBJECT_ID(...)`)
- [ ] No destructive operations without explicit safeguards (`DROP`, `TRUNCATE`)
- [ ] Script execution order is correct (dependencies resolved)
- [ ] Script tested on production-like dataset

### 2. Backward Compatibility
- [ ] New columns are nullable or have default values
- [ ] No `NOT NULL` columns added without default or backfill strategy
- [ ] Column additions don't break existing queries (`SELECT *` safe)
- [ ] No column renames without multi-phase deployment
- [ ] No table renames without multi-phase deployment
- [ ] Foreign key constraints added with `NOCHECK` first, validated separately

### 3. Index Management
- [ ] New foreign keys have corresponding indexes
- [ ] Index creation uses `ONLINE = ON` option (SQL Server 2012+)
- [ ] Large table indexes created during maintenance window
- [ ] Covering indexes reviewed for over-indexing
- [ ] Existing index impact assessed (write overhead)
- [ ] Statistics update strategy defined

### 4. Data Migration Logic
- [ ] Data backfill scripts included for new columns
- [ ] Batch processing used for large table updates (not single transaction)
- [ ] Migration progress tracked (resumable on failure)
- [ ] Data transformation logic validated on sample data
- [ ] No data loss in transformation
- [ ] Orphan record handling defined

### 5. Rollback Strategy
- [ ] Rollback script provided for all schema changes
- [ ] Rollback tested in staging environment
- [ ] Data migration rollback strategy defined
- [ ] Point-in-time recovery window documented
- [ ] Breaking changes flagged for coordination

### 6. Performance Impact
- [ ] Lock duration estimated (table locks, row locks)
- [ ] Migration runtime estimated on production-size data
- [ ] Maintenance window required (yes/no)
- [ ] Application downtime required (yes/no)
- [ ] Connection timeout impact assessed

### 7. Constraint Validation
- [ ] Check constraints don't reject existing data
- [ ] Unique constraints validated against current data
- [ ] Foreign key relationships preserve referential integrity
- [ ] Trigger logic validated for all DML operations
- [ ] No cascade deletes without explicit business justification

## Common Violations

### ❌ BAD: Non-idempotent migration script
```sql
-- Will fail on second execution
ALTER TABLE Reservations
ADD COLUMN GuestEmail NVARCHAR(255) NOT NULL;
```

### ✅ GOOD: Idempotent migration with existence check
```sql
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('Reservations') 
    AND name = 'GuestEmail'
)
BEGIN
    ALTER TABLE Reservations
    ADD GuestEmail NVARCHAR(255) NULL;
    
    -- Backfill from Guest table
    UPDATE r
    SET r.GuestEmail = g.Email
    FROM Reservations r
    INNER JOIN Guests g ON r.GuestId = g.GuestId
    WHERE r.GuestEmail IS NULL;
    
    -- Then make non-null after backfill
    ALTER TABLE Reservations
    ALTER COLUMN GuestEmail NVARCHAR(255) NOT NULL;
END
```

### ❌ BAD: Non-nullable column without default
```sql
ALTER TABLE Reservations
ADD COLUMN ConfirmationCode NVARCHAR(50) NOT NULL;
-- Fails if table has existing rows!
```

### ✅ GOOD: Nullable first, then backfill and constrain
```sql
-- Phase 1: Add nullable column
ALTER TABLE Reservations
ADD ConfirmationCode NVARCHAR(50) NULL;

-- Phase 2: Backfill in batches
DECLARE @BatchSize INT = 1000;
WHILE EXISTS (SELECT 1 FROM Reservations WHERE ConfirmationCode IS NULL)
BEGIN
    UPDATE TOP (@BatchSize) Reservations
    SET ConfirmationCode = 'RES-' + CAST(ReservationId AS NVARCHAR(20))
    WHERE ConfirmationCode IS NULL;
END

-- Phase 3: Make non-null
ALTER TABLE Reservations
ALTER COLUMN ConfirmationCode NVARCHAR(50) NOT NULL;
```

### ❌ BAD: Foreign key without index
```sql
ALTER TABLE Reservations
ADD CONSTRAINT FK_Reservations_Properties 
    FOREIGN KEY (PropertyId) REFERENCES Properties(PropertyId);
-- No index on PropertyId - slow joins!
```

### ✅ GOOD: Index created before foreign key
```sql
-- Create index first
CREATE NONCLUSTERED INDEX IX_Reservations_PropertyId
ON Reservations(PropertyId);

-- Then add foreign key
ALTER TABLE Reservations
ADD CONSTRAINT FK_Reservations_Properties 
    FOREIGN KEY (PropertyId) REFERENCES Properties(PropertyId);
```

### ❌ BAD: Large table index created without ONLINE option
```sql
-- Locks table during index creation
CREATE INDEX IX_Reservations_CheckInDate
ON Reservations(CheckInDate);
```

### ✅ GOOD: Online index creation (SQL Server Enterprise)
```sql
CREATE INDEX IX_Reservations_CheckInDate
ON Reservations(CheckInDate)
WITH (ONLINE = ON);
```

### ❌ BAD: Column rename without compatibility layer
```sql
-- Breaks existing code immediately
EXEC sp_rename 'Reservations.GuestName', 'PrimaryGuestName', 'COLUMN';
```

### ✅ GOOD: Multi-phase column rename
```sql
-- Phase 1: Add new column and sync via trigger
ALTER TABLE Reservations
ADD PrimaryGuestName NVARCHAR(255) NULL;

UPDATE Reservations
SET PrimaryGuestName = GuestName;

CREATE TRIGGER trg_Reservations_SyncGuestName
ON Reservations
AFTER INSERT, UPDATE
AS
BEGIN
    UPDATE r
    SET r.PrimaryGuestName = i.GuestName
    FROM Reservations r
    INNER JOIN inserted i ON r.ReservationId = i.ReservationId;
END

-- Phase 2 (after all code updated): Drop old column
-- ALTER TABLE Reservations DROP COLUMN GuestName;
-- DROP TRIGGER trg_Reservations_SyncGuestName;
```

### ❌ BAD: No rollback script
```sql
-- What if we need to rollback this change?
ALTER TABLE Reservations
ADD COLUMN LoyaltyPoints INT NULL;
```

### ✅ GOOD: Forward and rollback scripts
```sql
-- Forward migration (V1_0_5__Add_LoyaltyPoints.sql)
ALTER TABLE Reservations
ADD LoyaltyPoints INT NULL DEFAULT 0;

-- Rollback script (V1_0_5__Rollback.sql)
ALTER TABLE Reservations
DROP COLUMN LoyaltyPoints;
```

## Severity Mapping

| Issue | Severity | Blocking? | Rationale |
|-------|----------|-----------|-----------|
| Non-idempotent script | 🔴 CRITICAL | ✅ YES | Breaks redeployment and rollback |
| NOT NULL without default | 🔴 CRITICAL | ✅ YES | Deployment fails on existing data |
| Foreign key without index | 🟠 MAJOR | ⚠️ PARTIAL | Performance degradation |
| No rollback script | 🟠 MAJOR | ⚠️ PARTIAL | Cannot safely rollback deployment |
| Index without ONLINE option | 🟡 WARNING | ❌ NO | May require maintenance window |
| Column rename without compat | 🔴 CRITICAL | ✅ YES | Breaking change |
| Cascade delete without justification | 🟠 MAJOR | ⚠️ PARTIAL | Data loss risk |
| Large batch update in single transaction | 🟡 WARNING | ❌ NO | Lock escalation risk |

## Remediation Patterns

### Pattern 1: Three-Phase Column Addition
```sql
-- Phase 1: Add nullable column
ALTER TABLE Reservations
ADD TotalRevenue DECIMAL(18,2) NULL;

-- Phase 2: Backfill data (can be done gradually)
UPDATE Reservations
SET TotalRevenue = RoomRevenue + TaxAmount + FeeAmount
WHERE TotalRevenue IS NULL;

-- Phase 3: Enforce constraint
ALTER TABLE Reservations
ALTER COLUMN TotalRevenue DECIMAL(18,2) NOT NULL;
```

### Pattern 2: Safe Column Removal
```sql
-- Phase 1: Make column nullable and stop writing to it (code change)
-- (Deploy code first)

-- Phase 2: Drop column (DB change after code deployed)
IF EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('Reservations') 
    AND name = 'ObsoleteColumn'
)
BEGIN
    ALTER TABLE Reservations
    DROP COLUMN ObsoleteColumn;
END
```

### Pattern 3: Batch Data Migration
```sql
-- Backfill in batches to avoid long-running transaction
DECLARE @BatchSize INT = 5000;
DECLARE @RowsAffected INT = 1;

WHILE @RowsAffected > 0
BEGIN
    UPDATE TOP (@BatchSize) Reservations
    SET NormalizedGuestEmail = LOWER(TRIM(GuestEmail))
    WHERE NormalizedGuestEmail IS NULL 
      AND GuestEmail IS NOT NULL;
    
    SET @RowsAffected = @@ROWCOUNT;
    
    -- Log progress
    PRINT 'Processed ' + CAST(@RowsAffected AS NVARCHAR(20)) + ' rows';
    
    -- Brief pause to reduce lock pressure
    WAITFOR DELAY '00:00:00.100';
END
```

### Pattern 4: Constraint Addition with NOCHECK
```sql
-- Add constraint without validating existing data (fast)
ALTER TABLE Reservations
WITH NOCHECK
ADD CONSTRAINT FK_Reservations_Properties 
    FOREIGN KEY (PropertyId) REFERENCES Properties(PropertyId);

-- Validate in separate step (can be done during maintenance)
ALTER TABLE Reservations
CHECK CONSTRAINT FK_Reservations_Properties;
```

### Pattern 5: NHibernate Mapping Update
```csharp
// Before: Column "GuestName"
[Property(Column = "GuestName", Length = 255, NotNull = true)]
public virtual string GuestName { get; set; }

// During transition: Read from new, write to both
[Property(Column = "PrimaryGuestName", Length = 255, NotNull = false)]
public virtual string PrimaryGuestName { get; set; }

[Property(Column = "GuestName", Length = 255, NotNull = false)]
[Obsolete("Use PrimaryGuestName instead")]
private string GuestNameLegacy
{
    get => PrimaryGuestName;
    set => PrimaryGuestName = value;
}

// After: Only new column
[Property(Column = "PrimaryGuestName", Length = 255, NotNull = true)]
public virtual string PrimaryGuestName { get; set; }
```

## Testing Requirements

### 1. Idempotency Test
```sql
-- Run migration script twice, should succeed both times
BEGIN TRANSACTION;
EXEC sp_executesql @MigrationScript;
ROLLBACK;

BEGIN TRANSACTION;
EXEC sp_executesql @MigrationScript;
ROLLBACK;
```

### 2. Rollback Test
```sql
-- Apply forward migration
BEGIN TRANSACTION;
EXEC sp_executesql @ForwardScript;

-- Apply rollback migration
EXEC sp_executesql @RollbackScript;

-- Verify schema matches pre-migration state
ROLLBACK;
```

### 3. Data Integrity Test
```csharp
[Test]
public void SchemaMigration_PreservesExistingData()
{
    // Arrange
    var recordCountBefore = _dbContext.Reservations.Count();
    var sampleRecordBefore = _dbContext.Reservations.First();
    
    // Act
    ExecuteMigrationScript("V1_0_5__Add_LoyaltyPoints.sql");
    
    // Assert
    var recordCountAfter = _dbContext.Reservations.Count();
    var sampleRecordAfter = _dbContext.Reservations.First(r => r.Id == sampleRecordBefore.Id);
    
    Assert.AreEqual(recordCountBefore, recordCountAfter, "Record count mismatch");
    Assert.AreEqual(sampleRecordBefore.GuestName, sampleRecordAfter.GuestName, 
        "Existing data corrupted");
}
```

### 4. Performance Test
```csharp
[Test]
public void IndexCreation_CompletesWithinThreshold()
{
    // Arrange
    var stopwatch = Stopwatch.StartNew();
    
    // Act
    ExecuteMigrationScript("V1_0_5__Add_Indexes.sql");
    
    // Assert
    stopwatch.Stop();
    Assert.Less(stopwatch.Elapsed.TotalSeconds, 60, 
        "Index creation took longer than 60 seconds - may require maintenance window");
}
```

## Review Output Format

```markdown
### Category S: Database Schema & Migrations

| File | Line | Issue | Severity | Recommendation |
|------|------|-------|----------|----------------|
| V1_0_5__Add_Email.sql | 3 | NOT NULL column without default | 🔴 CRITICAL | Add nullable first, backfill, then constrain |
| V1_0_6__Rename_Column.sql | 12 | Column rename without compat layer | 🔴 CRITICAL | Use multi-phase migration pattern |
| V1_0_7__Add_FK.sql | 8 | Foreign key without index | 🟠 MAJOR | Create index before FK constraint |
| V1_0_5__Add_Email.sql | - | No rollback script provided | 🟠 MAJOR | Create corresponding rollback script |

**Category Status:** ❌ FAIL (2 critical issues found)
**Blocking:** YES - Schema changes will fail on production deployment
**Recommendation:** Use three-phase migration pattern for column additions
```

## References
- [Zero-Downtime Migrations](https://www.braintreepayments.com/blog/safe-operations-for-high-volume-postgresql/)
- [Entity Framework Migrations](https://docs.microsoft.com/en-us/ef/core/managing-schemas/migrations/)
- [Flyway Migration Best Practices](https://flywaydb.org/documentation/concepts/migrations)
- [Online Index Operations](https://docs.microsoft.com/en-us/sql/relational-databases/indexes/perform-index-operations-online)
