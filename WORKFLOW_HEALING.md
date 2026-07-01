# Workflow Self-Healing Implementation

## Overview

This implementation adds **Assisted Self-Healing** capabilities to workflow playback, allowing the system to automatically find and suggest replacements for controls that cannot be located during playback.

## Architecture

### 1. Database Schema

**Migration:** `db/migrations/048_workflow_healing_suggestions.sql`

Three new tables:
- `guided_workflow_healing_suggestions` - Stores healing suggestions with pending/approved/rejected status
- `guided_workflow_healing_audit` - Complete audit log of all healing attempts
- Adds versioning columns to `guided_workflow_guides` table

### 2. Control Matching System

#### Rule-Based Matcher (`player/ruleBasedMatcher.ts`)
- Scores elements based on metadata similarity (text, role, aria-label, labels, etc.)
- Weighted scoring algorithm with configurable thresholds
- Returns confidence score (0-100) and list of candidates
- Fast, deterministic, no external dependencies

#### AI Fallback Matcher (`player/aiMatcher.ts` + API route)
- Used when rule-based matching is uncertain or ambiguous
- Leverages existing active LLM provider (Ollama, OpenAI, Gemini, Anthropic)
- Receives recorded control metadata, current candidates, page context, and step intent
- Returns best match with confidence and reasoning
- Modular design allows provider replacement

### 3. Healing Resolver (`player/healingResolver.ts`)

**Main workflow:**
1. Try rule-based matching first
2. If confidence >= 95% and unambiguous, use immediately
3. If uncertain, escalate to AI-assisted matching
4. Build proposed selector candidates from matched element
5. Determine if auto-apply is safe (based on confidence + sensitivity)
6. Save healing suggestion to database

**Safety features:**
- Sensitive steps (submit, delete, payment, etc.) always require confirmation
- Auto-apply only for high confidence (>95%) non-sensitive steps
- All suggestions saved for trainer review

### 4. Playback Engine Integration (`player/adoptionPlayer.ts`)

**Modified methods:**
- `showMissing()` - Added "Try Self-Healing" button
- `attemptSelfHealing()` - Main healing orchestration
- `showHealingConfirmation()` - User confirmation UI
- `continueWithHealedElement()` - Resume playback with healed control

**User experience:**
- When control not found, user can click "Try Self-Healing"
- System searches for matches using rule-based + AI fallback
- Displays confidence, source, and reasoning
- For high-confidence non-sensitive steps, auto-continues
- For sensitive or lower-confidence steps, shows confirmation dialog
- User can Accept, Skip, or Stop

### 5. Admin Review UI

**Component:** `components/admin/healing-suggestion-reviewer.tsx`

**Features:**
- Lists all pending healing suggestions
- Shows confidence score, source (rule-based/AI), and reasoning
- Displays original and proposed selector candidates
- Actions: Approve, Reject, Edit

**Approve workflow:**
- Creates new workflow version with updated control metadata
- Original workflow remains unchanged
- Increments version number
- Adds version notes explaining the change
- Logs approval in audit table

**Reject workflow:**
- Marks suggestion as rejected
- Preserves suggestion for historical tracking
- Logs rejection with optional reason

**Edit workflow:**
- Opens modal to modify selector candidates before approval
- Can adjust confidence scores, values, or remove candidates
- Saves edited version as new workflow version

### 6. API Endpoints

**POST /api/guided-workflow-player/healing-suggestions**
- Saves new healing suggestion from player
- Updates existing pending suggestions with new attempts
- Logs attempt in audit table

**GET /api/guided-workflow-player/healing-suggestions**
- Retrieves suggestions by status (pending/approved/rejected)
- Can filter by workflow ID

**POST /api/guided-workflow-player/ai-match**
- AI-assisted control matching endpoint
- Receives control metadata and candidates
- Returns best match with confidence and reason

**POST /api/guided-workflow-player/healing-suggestions/review?action=approve|reject**
- Approve: Creates new workflow version and updates suggestion status
- Reject: Marks suggestion as rejected with optional reason
- Both actions log to audit table

## Usage Flow

### During Playback

1. User runs workflow
2. Control not found → "Element not found" banner appears
3. User clicks "Try Self-Healing"
4. System attempts rule-based matching
5. If uncertain, escalates to AI matching
6. If match found:
   - High confidence + non-sensitive → Auto-continue (with notification)
   - Otherwise → Show confirmation dialog
7. Healing suggestion saved to database

### Trainer Review

1. Navigate to `/control-panel/guided-workflows/healing-suggestions`
2. View all pending suggestions with:
   - Workflow and step details
   - Confidence scores and sources
   - Proposed selector candidates
   - Page context
3. Actions:
   - **Approve**: Creates new workflow version with healed control
   - **Edit**: Modify selector candidates before approving
   - **Reject**: Discard suggestion without changes

## Key Design Decisions

### ✅ Do NOT Update Original Workflow
- Original metadata preserved
- Creates versioned workflow on approval
- Allows rollback and historical tracking

### ✅ Modular AI Integration
- AI matching is optional fallback
- Uses existing AI provider infrastructure
- Can be replaced or disabled without changing core logic

### ✅ Safety-First Auto-Apply
- Only auto-applies for high confidence (>95%) + non-sensitive steps
- Sensitive actions always require confirmation
- User always has control via confirmation dialog

### ✅ Complete Audit Trail
- All healing attempts logged
- Approvals and rejections tracked
- Links to specific users and timestamps

### ✅ Progressive Enhancement
- Works without AI provider (rule-based only)
- Gracefully degrades if AI fails
- Player continues to function if healing unavailable

## Configuration

No configuration files needed. The system automatically uses:
- Active LLM provider from AI configuration
- Default thresholds defined in code (can be adjusted)
- Existing authentication and authorization

## Testing

To test the implementation:

1. **Run database migration:**
   ```bash
   # Apply migration 048
   psql -d scout -f db/migrations/048_workflow_healing_suggestions.sql
   ```

2. **Create test workflow with intentionally incorrect selectors**

3. **Run workflow playback:**
   - Control should not be found
   - Click "Try Self-Healing"
   - Verify matching logic works
   - Check suggestion saved to database

4. **Review suggestions:**
   - Navigate to healing suggestions page
   - Verify all data displayed correctly
   - Test Approve/Reject/Edit actions
   - Verify new workflow version created

## Future Enhancements

- [ ] Add bulk approve/reject for multiple suggestions
- [ ] Show preview of workflow diff before approval
- [ ] Add machine learning model training from approved suggestions
- [ ] Support rollback to previous workflow versions
- [ ] Add healing confidence trends over time
- [ ] Auto-approve suggestions after N successful attempts
- [ ] Export healing suggestions for analysis
- [ ] Add notifications when new suggestions pending

## Files Created/Modified

**Created:**
- `db/migrations/048_workflow_healing_suggestions.sql`
- `player/ruleBasedMatcher.ts`
- `player/aiMatcher.ts`
- `player/healingResolver.ts`
- `app/api/guided-workflow-player/ai-match/route.ts`
- `app/api/guided-workflow-player/healing-suggestions/route.ts`
- `app/api/guided-workflow-player/healing-suggestions/review/route.ts`
- `components/admin/healing-suggestion-reviewer.tsx`
- `app/control-panel/guided-workflows/healing-suggestions/page.tsx`

**Modified:**
- `player/adoptionPlayer.ts` - Added self-healing integration
- `components/admin/index.ts` - Added exports

## Technical Notes

- TypeScript with strict typing throughout
- React Server Components for admin UI
- PostgreSQL with JSONB for flexible metadata storage
- Optimistic UI updates with loading states
- Error boundaries and graceful degradation
- Accessibility-compliant UI components
