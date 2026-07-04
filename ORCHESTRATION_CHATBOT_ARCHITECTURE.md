# Orchestration System - Chatbot Trigger Architecture

## Overview
This document explains how to implement chatbot-triggered orchestrations with Scout workflows, data capture, API calls, and notifications.

---

## Current System Capabilities

### ✅ **EXISTING Node Types** (Already Implemented)

| Node Type | Purpose | Status |
|-----------|---------|--------|
| **trigger** | Entry point for orchestration | ✅ Working |
| **workflow** | Execute Scout guided workflows | ✅ Working |
| **variable** | Create/transform variables | ✅ Working |
| **notification** | Send emails/Teams/Slack | ✅ Working |
| **ai_extraction** | Extract structured data using AI | ✅ Working |
| **ai_decision** | AI-powered decision branching | ✅ Working |
| **condition** | Logic-based branching | ✅ Working |
| **human_approval** | Pause for human approval | ✅ Working |
| **end** | Orchestration completion | ✅ Working |

### ❌ **MISSING Node Type** (Needs Implementation)

| Node Type | Purpose | Status |
|-----------|---------|--------|
| **api_call** | HTTP requests to external APIs | ❌ **NEEDS IMPLEMENTATION** |

---

## Your Use Cases - Implementation Guide

### **Use Case A: Scout Workflow → API Call → Email**

```
trigger (chatbot)
    ↓
workflow (Scout guided workflow)
    ↓
api_call (send captured data to API)
    ↓
notification (send email)
    ↓
end
```

#### Node Configuration Details

#### **1. Trigger Node (Chatbot)**
```json
{
  "type": "trigger",
  "triggerType": "chatbot",
  "config": {
    "intentName": "create_leave_request",
    "examplePhrases": [
      "I want to apply for leave",
      "Create a leave request",
      "I need time off"
    ]
  }
}
```

**How it works:**
- User asks: "I want to apply for leave"
- Chatbot matches phrase to trigger
- Bot responds: "I found a workflow that can help! It will guide you through the leave request form. Would you like me to start it?"
- If user confirms → trigger fires
- Orchestration starts with trigger data

**Output variables:**
```javascript
{
  "matchedPhrase": "I want to apply for leave",
  "matchedIntent": "create_leave_request",
  "userMessage": "I want to apply for leave",
  "userId": "user-email@company.com",
  "timestamp": "2026-07-04T10:30:00Z",
  // Also available under trigger.input.*
}
```

---

#### **2. Workflow Node (Scout Guided Workflow)**
```json
{
  "type": "workflow",
  "workflowId": "{{leaveRequestWorkflowId}}",
  "executionMode": "auto",
  "targetUrl": "https://yourapp.com/leave-requests/create",
  "waitForCompletion": true,
  "triggerPhrases": ["I want to apply for leave"],
  "inputMapping": {
    "employeeId": "{{userId}}",
    "requestedBy": "{{trigger.input.userId}}"
  },
  "outputMapping": {
    "leaveType": "capturedData.leaveType",
    "startDate": "capturedData.startDate",
    "endDate": "capturedData.endDate",
    "reason": "capturedData.reason",
    "totalDays": "capturedData.totalDays"
  },
  "continueOnFailure": false
}
```

**How it works:**
1. **Trigger Phrase Matching**: Only executes if matched phrase is "I want to apply for leave"
2. **Automated Execution**: Scout Player launches in browser, navigates to target URL
3. **Data Capture**: As user fills form fields:
   - Scout Player captures each field value
   - Stores in `capturedData` object
4. **Output Mapping**: Maps captured values to orchestration variables
5. **Completion**: When workflow completes, all captured data flows to next node

**Output variables:**
```javascript
{
  "leaveType": "Vacation",
  "startDate": "2026-08-01",
  "endDate": "2026-08-10",
  "reason": "Summer vacation",
  "totalDays": 10,
  "workflowExecutionId": "wf-exec-123",
  "completedAt": "2026-07-04T10:35:00Z"
}
```

**IMPORTANT**: The workflow node ALREADY has built-in data capture!
- It uses `outputMapping` to extract values from Scout Player's captured data
- No separate "capture node" needed - it's built into the workflow node

---

#### **3. API Call Node** ⚠️ **NEEDS IMPLEMENTATION**

```json
{
  "type": "api_call",
  "method": "POST",
  "url": "https://api.hris.com/leave-requests",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer {{apiToken}}"
  },
  "body": {
    "employeeId": "{{userId}}",
    "leaveType": "{{leaveType}}",
    "startDate": "{{startDate}}",
    "endDate": "{{endDate}}",
    "reason": "{{reason}}",
    "totalDays": "{{totalDays}}"
  },
  "timeout": 30000,
  "retryCount": 3,
  "continueOnFailure": false,
  "outputVariable": "apiResponse"
}
```

**How it works:**
1. Evaluates all `{{variables}}` from context
2. Makes HTTP request to external API
3. Stores response in `apiResponse` variable
4. On failure: retries or fails orchestration

**Output variables:**
```javascript
{
  "apiResponse": {
    "requestId": "lr-456",
    "status": "pending_approval",
    "approver": "manager@company.com",
    "createdAt": "2026-07-04T10:35:30Z"
  }
}
```

---

#### **4. Notification Node (Email)**
```json
{
  "type": "notification",
  "channel": "email",
  "recipient": "{{apiResponse.approver}}",
  "subject": "New Leave Request: {{leaveType}}",
  "message": "A new leave request has been submitted:\n\nEmployee: {{userId}}\nLeave Type: {{leaveType}}\nDates: {{startDate}} to {{endDate}}\nReason: {{reason}}\n\nRequest ID: {{apiResponse.requestId}}\n\nPlease review and approve."
}
```

**How it works:**
- Evaluates all `{{variables}}` from context
- Sends email using configured SMTP
- Supports Teams, Slack, internal notifications

---

### **Use Case B: Scout Workflow → Another Scout Workflow → Email**

```
trigger (chatbot)
    ↓
workflow (capture expense details)
    ↓
workflow (submit expense in ERP system)
    ↓
notification (send confirmation email)
    ↓
end
```

#### Node Configuration Details

#### **1. Trigger Node**
Same as Use Case A

---

#### **2. First Workflow Node (Capture Expense Details)**
```json
{
  "type": "workflow",
  "workflowId": "{{expenseCaptureWorkflowId}}",
  "executionMode": "auto",
  "targetUrl": "https://yourapp.com/expenses/draft",
  "waitForCompletion": true,
  "triggerPhrases": ["Submit expense report"],
  "inputMapping": {
    "employeeId": "{{userId}}"
  },
  "outputMapping": {
    "expenseType": "capturedData.expenseType",
    "amount": "capturedData.amount",
    "date": "capturedData.date",
    "merchant": "capturedData.merchant",
    "category": "capturedData.category",
    "receiptUrl": "capturedData.receiptUrl"
  },
  "continueOnFailure": false
}
```

**Output variables:**
```javascript
{
  "expenseType": "Business Meal",
  "amount": 150.75,
  "date": "2026-07-03",
  "merchant": "Restaurant ABC",
  "category": "Meals & Entertainment",
  "receiptUrl": "https://storage.com/receipt-123.pdf"
}
```

---

#### **3. Second Workflow Node (Submit to ERP)**
```json
{
  "type": "workflow",
  "workflowId": "{{erpSubmissionWorkflowId}}",
  "executionMode": "auto",
  "targetUrl": "https://erp.company.com/expense-submission",
  "waitForCompletion": true,
  "inputMapping": {
    "expenseType": "{{expenseType}}",
    "amount": "{{amount}}",
    "date": "{{date}}",
    "merchant": "{{merchant}}",
    "category": "{{category}}",
    "receiptUrl": "{{receiptUrl}}"
  },
  "outputMapping": {
    "submissionId": "capturedData.confirmationNumber",
    "approvalStatus": "capturedData.status"
  },
  "continueOnFailure": false
}
```

**How it works:**
1. Takes captured data from previous workflow
2. Navigates to ERP system
3. Scout Player fills form fields automatically using `inputMapping` values
4. Clicks submit
5. Captures confirmation number and status

**Output variables:**
```javascript
{
  "submissionId": "EXP-2026-789",
  "approvalStatus": "pending"
}
```

---

#### **4. Notification Node**
```json
{
  "type": "notification",
  "channel": "email",
  "recipient": "{{userId}}",
  "subject": "Expense Submitted: {{submissionId}}",
  "message": "Your expense report has been successfully submitted!\n\nSubmission ID: {{submissionId}}\nAmount: ${{amount}}\nStatus: {{approvalStatus}}\n\nYou'll receive a notification when it's approved."
}
```

---

## Data Flow Architecture

### How Variables Flow Between Nodes

```
┌─────────────────┐
│  Trigger Node   │
│  (chatbot)      │
└────────┬────────┘
         │
         │ Outputs: matchedPhrase, userId, timestamp
         ▼
┌─────────────────┐
│ Workflow Node 1 │
│ (Scout Player)  │
└────────┬────────┘
         │
         │ Outputs: leaveType, startDate, endDate, reason
         ▼
┌─────────────────┐
│  API Call Node  │ ← Takes ALL previous outputs
└────────┬────────┘
         │
         │ Outputs: apiResponse (entire API response)
         ▼
┌─────────────────┐
│Notification Node│ ← Can use ANY variable from any previous node
└─────────────────┘
```

### Context Object Structure

At any point in the orchestration, the context contains ALL outputs from previous nodes:

```javascript
{
  // From trigger node
  "matchedPhrase": "I want to apply for leave",
  "userId": "user@company.com",
  "timestamp": "2026-07-04T10:30:00Z",
  
  // From workflow node
  "leaveType": "Vacation",
  "startDate": "2026-08-01",
  "endDate": "2026-08-10",
  "reason": "Summer vacation",
  
  // From API call node
  "apiResponse": {
    "requestId": "lr-456",
    "status": "pending_approval",
    "approver": "manager@company.com"
  },
  
  // System metadata
  "_system": {
    "executionId": "exec-789",
    "startedAt": "2026-07-04T10:30:00Z"
  }
}
```

**Any node can reference any variable using `{{variableName}}` or `{{nested.path}}`**

---

## Implementation Checklist

### ✅ **Already Working**

- [x] Chatbot trigger matching
- [x] Scout workflow execution
- [x] Automated browser execution with Scout Player
- [x] Data capture from workflow execution (via `outputMapping`)
- [x] Data passing between nodes (via context)
- [x] Email notifications
- [x] Multiple workflows in sequence
- [x] Variable transformations
- [x] Expression evaluation (`{{variableName}}`)

### ⚠️ **Needs Implementation**

- [ ] **API Call Node** - Create new node type for HTTP requests

---

## API Call Node - Implementation Guide

### File to Create: `lib/orchestrations/nodes/api-call-node.ts`

```typescript
// API Call node executor
// Makes HTTP requests to external APIs

import type { APICallNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";

export async function executeAPICallNode(
  config: APICallNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    // Evaluate URL (may contain variables)
    const url = String(evaluateExpression(config.url, context));
    
    // Evaluate headers
    const headers: Record<string, string> = {};
    if (config.headers) {
      for (const [key, value] of Object.entries(config.headers)) {
        headers[key] = String(evaluateExpression(value, context));
      }
    }
    
    // Evaluate body
    let body: string | undefined;
    if (config.body && (config.method === "POST" || config.method === "PUT" || config.method === "PATCH")) {
      const evaluatedBody: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(config.body)) {
        evaluatedBody[key] = evaluateExpression(value, context);
      }
      body = JSON.stringify(evaluatedBody);
    }
    
    // Make request with retry logic
    let lastError: Error | null = null;
    const maxRetries = config.retryCount || 1;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: config.method,
          headers,
          body,
          signal: AbortSignal.timeout(config.timeout || 30000),
        });
        
        // Parse response
        const contentType = response.headers.get("content-type");
        let responseData: unknown;
        
        if (contentType?.includes("application/json")) {
          responseData = await response.json();
        } else {
          responseData = await response.text();
        }
        
        // Check if successful
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
        }
        
        // Success - return response
        const output: Record<string, unknown> = {};
        if (config.outputVariable) {
          output[config.outputVariable] = {
            status: response.status,
            statusText: response.statusText,
            data: responseData,
            headers: Object.fromEntries(response.headers.entries()),
          };
        }
        
        return { success: true, output };
        
      } catch (error) {
        lastError = error as Error;
        console.log(`[APICallNode] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);
        
        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }
    
    // All retries failed
    if (config.continueOnFailure) {
      return {
        success: true,
        output: {
          [config.outputVariable || "apiResponse"]: {
            error: lastError?.message,
            failed: true,
          }
        }
      };
    }
    
    return { success: false, error: lastError?.message || "API call failed" };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}
```

### Add to `shared/orchestrationTypes.ts`

```typescript
export type NodeType =
  | "trigger"
  | "workflow"
  | "ai_extraction"
  | "ai_decision"
  | "condition"
  | "human_approval"
  | "notification"
  | "variable"
  | "api_call"  // ← ADD THIS
  | "end";

// Add new config type
export type APICallNodeConfig = {
  type: "api_call";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string; // Can contain {{variables}}
  headers?: Record<string, string>; // Can contain {{variables}}
  body?: Record<string, unknown>; // Can contain {{variables}}
  timeout?: number; // milliseconds, default 30000
  retryCount?: number; // default 1 (no retry)
  continueOnFailure?: boolean; // default false
  outputVariable?: string; // where to store response, default "apiResponse"
};

// Update NodeConfig union
export type NodeConfig =
  | TriggerNodeConfig
  | WorkflowNodeConfig
  | AIExtractionNodeConfig
  | AIDecisionNodeConfig
  | ConditionNodeConfig
  | HumanApprovalNodeConfig
  | NotificationNodeConfig
  | VariableNodeConfig
  | APICallNodeConfig  // ← ADD THIS
  | EndNodeConfig;
```

### Add to `lib/orchestrations/engine.ts`

In the `executeNodeByType` method, add:

```typescript
case "api_call":
  return await executeAPICallNode(config as APICallNodeConfig, this.context);
```

And import:

```typescript
import { executeAPICallNode } from "./nodes/api-call-node";
```

### Update Migration: `db/migrations/052_orchestrations.sql`

Change the node_type comment:

```sql
node_type text NOT NULL, -- trigger, workflow, ai_extraction, ai_decision, condition, human_approval, notification, variable, api_call, end
```

---

## Chatbot Integration Flow

### 1. User Interaction in Scout Chat

```
User: "I want to apply for leave"
  ↓
Scout RAG: [Searches knowledge base]
  ↓
Scout RAG: [Finds answer about leave policy]
  ↓
Scout Chatbot Trigger Matcher: [Checks orchestration_triggers table]
  ↓
Scout Chatbot Trigger Matcher: [Finds matching trigger]
  ↓
Scout: "Here's what I found about leave requests:
       [RAG answer about leave policy]
       
       💡 I also found a workflow that can help you submit 
       a leave request automatically. It will:
       1. Guide you through the leave request form
       2. Submit it to the HR system
       3. Notify your manager
       
       Would you like me to start this workflow?"
  ↓
User: "Yes, start it"
  ↓
Scout: [Triggers orchestration]
  ↓
Scout Player: [Opens in browser, starts automated workflow]
```

### 2. Trigger Detection Logic

Already implemented in: `lib/orchestrations/chatbot-trigger-matcher.ts`

```typescript
// This runs on every chatbot message
// Matches user message against orchestration_triggers
// Returns matched triggers to show as suggestions
```

---

## Testing Your Use Cases

### Test Use Case A

1. **Create orchestration in visual designer:**
   - Trigger node (chatbot): phrase "I want to apply for leave"
   - Workflow node: Leave request form workflow
   - API call node: POST to HRIS API
   - Notification node: Email to manager
   - End node

2. **Test in Scout Chat:**
   ```
   User: "I want to apply for leave"
   Bot: [Shows RAG answer + suggests workflow]
   User: "Yes, start it"
   Bot: [Launches Scout Player]
   Player: [Guides user through form]
   Player: [Captures data as user fills fields]
   Orchestration: [Sends data to API]
   Orchestration: [Sends email to manager]
   Bot: "✅ Leave request submitted! Request ID: LR-123"
   ```

### Test Use Case B

1. **Create orchestration:**
   - Trigger node (chatbot): phrase "Submit expense report"
   - Workflow node 1: Expense capture workflow
   - Workflow node 2: ERP submission workflow
   - Notification node: Email to user
   - End node

2. **Test in Scout Chat:**
   ```
   User: "Submit expense report"
   Bot: [Shows workflow suggestion]
   User: "Yes"
   Player: [Workflow 1 - capture expense details]
   Player: [Workflow 2 - submit to ERP]
   Orchestration: [Sends confirmation email]
   Bot: "✅ Expense submitted! Confirmation: EXP-789"
   ```

---

## Summary

### ✅ **What You Already Have**

1. **Chatbot trigger** - Phrase matching, intent detection
2. **Scout workflow node** - Automated execution, data capture (via outputMapping)
3. **Email notifications** - Teams, Slack support too
4. **Variable transformations** - Create, update, transform variables
5. **Data flow** - Context object flows between all nodes

### ❌ **What You Need to Build**

1. **API Call Node** - See implementation guide above (~150 lines of code)

### ✅ **Your Use Cases - Status**

**Use Case A**: ✅ 95% Ready (just need API call node)
**Use Case B**: ✅ 100% Ready (can build today!)

---

## Next Steps

1. **Implement API Call Node** (1-2 hours)
   - Create `lib/orchestrations/nodes/api-call-node.ts`
   - Update types in `shared/orchestrationTypes.ts`
   - Add case in `lib/orchestrations/engine.ts`
   - Update migration comment

2. **Test Use Case B** (can do now without API node)
   - Two workflows in sequence
   - Data passing between workflows
   - Email notification

3. **Test Use Case A** (after API node is built)
   - Workflow → API → Email
   - Full end-to-end validation

4. **Move to Other Trigger Types**
   - Schedule triggers (cron jobs)
   - Webhook triggers (external systems)
   - Email triggers (process incoming emails)
   - File upload triggers

---

## Questions?

**Q: How does data capture work in workflows?**
A: Built into workflow node via `outputMapping`. Scout Player automatically captures form field values.

**Q: Can I have conditional logic?**
A: Yes! Use "condition" or "ai_decision" nodes to create branches.

**Q: Can workflows fail gracefully?**
A: Yes! Set `continueOnFailure: true` on any node to continue even if it fails.

**Q: Can I chain many workflows?**
A: Yes! Each workflow node passes its captured data to the next node via context.

**Q: How do I debug orchestrations?**
A: Check `orchestration_executions` and `orchestration_node_executions` tables for detailed logs.
