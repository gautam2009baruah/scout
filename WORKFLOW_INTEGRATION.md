# Workflow Integration - Implementation Guide

## ✅ Implementation Complete

Successfully integrated Scout Guided Workflows with the Orchestration Engine.

---

## 🏗️ Architecture Overview

### **Component Structure**

```
Orchestration Engine
  └── Workflow Node Executor (workflow-node.ts)
      └── Guided Workflow Executor (executor.ts)
          └── Guided Workflow System (guided-workflows.ts)
              └── Client-Side Player (adoptionPlayer.ts)
```

### **Execution Flow**

```
1. Orchestration Triggered
   ↓
2. Workflow Node Executed
   ↓
3. Executor Creates Execution Record
   ↓
4. Workflow Analytics Tracking Started
   ↓
5. Guide/Workflow Made Available
   ↓
6. [Optional] Wait for Completion via Polling
   ↓
7. Return Execution Result
```

---

## 📦 New Files Created

### **1. `lib/guided-workflows/executor.ts`**

**Purpose**: Server-side workflow execution manager for orchestrations

**Key Functions**:

- `executeGuidedWorkflow(options)` - Start a workflow execution
- `getWorkflowExecutionStatus(executionId)` - Check execution status
- `waitForWorkflowCompletion(executionId, timeout)` - Poll for completion
- `executeWorkflowBatch(workflows)` - Execute multiple workflows

**Features**:
- Creates execution records in workflow_analytics table
- Supports manual and auto execution modes
- Returns embed code for client-side execution
- Tracks execution via analytics events
- Supports timeout and polling

### **2. `lib/orchestrations/nodes/workflow-node.ts` (Updated)**

**Purpose**: Orchestration node executor for workflow nodes

**Key Features**:
- Evaluates dynamic expressions for workflow ID and parameters
- Supports input/output mapping with context variables
- Can wait for workflow completion or return immediately
- Handles errors with continueOnFailure option
- Maps workflow results to orchestration context

**Configuration Options**:
```typescript
{
  workflowId: "string or expression",
  executionMode: "manual | auto | scheduled",
  targetUrl: "optional URL expression",
  waitForCompletion: boolean,
  notifyUser: boolean,
  inputMapping: { contextVar: "expression" },
  outputMapping: { contextVar: "workflowOutputField" },
  continueOnFailure: boolean,
  timeout: number (ms)
}
```

### **3. `shared/orchestrationTypes.ts` (Updated)**

**New Fields Added to WorkflowNodeConfig**:
- `executionMode` - How to execute (manual, auto, scheduled)
- `targetUrl` - Target URL for workflow execution
- `waitForCompletion` - Whether to poll for completion
- `notifyUser` - Whether to notify user for manual mode

### **4. `app/api/admin/orchestrations/test-workflow/route.ts`**

**Purpose**: Test endpoint for workflow execution

**Endpoints**:
- `GET` - Usage documentation
- `POST` - Execute a workflow for testing

**Example Request**:
```bash
POST /api/admin/orchestrations/test-workflow
{
  "workflowId": "abc-123-def-456",
  "userId": "user@example.com",
  "executionMode": "auto",
  "parameters": {
    "customerId": "12345",
    "action": "create-order"
  },
  "targetUrl": "https://app.example.com/orders"
}
```

---

## 🎯 Execution Modes

### **1. Auto Mode (Default)**
- Workflow is initiated immediately
- Returns guide configuration and embed code
- Orchestration continues without waiting
- Best for: Non-blocking workflows, background tasks

### **2. Manual Mode**
- Creates execution record
- Can notify user to execute workflow
- Orchestration waits if `waitForCompletion: true`
- Best for: User-interactive workflows, approval flows

### **3. Scheduled Mode**
- Creates execution record for future execution
- Returns scheduling information
- Best for: Time-based workflows, recurring tasks

---

## 🔄 Execution Tracking

### **Analytics Integration**

All workflow executions are tracked in the `workflow_analytics` table:

**Events Recorded**:
- `workflow_start` - When execution begins
- `workflow_completed` - When execution succeeds
- `workflow_failed` - When execution fails
- `step_start` - Individual step tracking (via client player)
- `step_completed` - Step completion tracking

**Query Execution Status**:
```sql
SELECT 
  execution_id,
  workflow_id,
  user_id,
  event_type,
  status,
  created_at
FROM workflow_analytics
WHERE execution_id = 'your-execution-id'
ORDER BY created_at DESC;
```

---

## 📝 Usage Examples

### **Example 1: Simple Workflow Execution**

**Orchestration Configuration**:
```json
{
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "config": { "triggerType": "manual" }
    },
    {
      "id": "workflow-1",
      "type": "workflow",
      "config": {
        "workflowId": "abc-123-def-456",
        "executionMode": "auto",
        "waitForCompletion": false,
        "inputMapping": {},
        "outputMapping": {
          "executionId": "executionId",
          "workflowStatus": "status"
        },
        "continueOnFailure": false
      }
    },
    {
      "id": "end-1",
      "type": "end",
      "config": {}
    }
  ],
  "connections": [
    { "source": "trigger-1", "target": "workflow-1" },
    { "source": "workflow-1", "target": "end-1" }
  ]
}
```

**Result**:
- Workflow execution initiated
- Execution ID stored in context
- Orchestration proceeds to next node immediately

---

### **Example 2: Workflow with Dynamic Parameters**

**Orchestration Configuration**:
```json
{
  "nodes": [
    {
      "id": "variable-1",
      "type": "variable",
      "config": {
        "operation": "set",
        "variableName": "orderId",
        "value": "ORD-12345"
      }
    },
    {
      "id": "workflow-1",
      "type": "workflow",
      "config": {
        "workflowId": "create-order-workflow",
        "executionMode": "auto",
        "inputMapping": {
          "orderId": "{{orderId}}",
          "timestamp": "{{new Date().toISOString()}}"
        },
        "outputMapping": {
          "orderResult": "output"
        },
        "continueOnFailure": false
      }
    }
  ],
  "connections": [
    { "source": "variable-1", "target": "workflow-1" }
  ]
}
```

**Result**:
- Variable set in context
- Workflow receives orderId and timestamp as parameters
- Workflow output stored in `orderResult` context variable

---

### **Example 3: Wait for Workflow Completion**

**Orchestration Configuration**:
```json
{
  "nodes": [
    {
      "id": "workflow-1",
      "type": "workflow",
      "config": {
        "workflowId": "approval-workflow",
        "executionMode": "manual",
        "waitForCompletion": true,
        "timeout": 600000,
        "notifyUser": true,
        "inputMapping": {
          "userId": "{{userId}}",
          "requestId": "{{requestId}}"
        },
        "outputMapping": {
          "approved": "status",
          "approverComments": "comments"
        },
        "continueOnFailure": false
      }
    },
    {
      "id": "condition-1",
      "type": "condition",
      "config": {
        "conditions": [
          {
            "variable": "approved",
            "operator": "equals",
            "value": "completed"
          }
        ]
      }
    }
  ],
  "connections": [
    { "source": "workflow-1", "target": "condition-1" }
  ]
}
```

**Result**:
- Workflow execution initiated
- User notified to complete workflow
- Orchestration pauses and polls for completion
- Once completed, orchestration proceeds with result
- Condition node checks approval status

---

## 🧪 Testing

### **Test Workflow Execution**

**Using Test API**:
```bash
curl -X POST http://localhost:3000/api/admin/orchestrations/test-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "your-workflow-id",
    "executionMode": "auto",
    "parameters": {
      "testParam": "value"
    }
  }'
```

**Expected Response**:
```json
{
  "success": true,
  "execution": {
    "executionId": "exec-uuid",
    "workflowId": "your-workflow-id",
    "workflowTitle": "My Workflow",
    "status": "initiated",
    "startedAt": "2026-07-02T...",
    "steps": 5,
    "output": {
      "guideId": "your-workflow-id",
      "title": "My Workflow",
      "description": "...",
      "embedCode": "<script ...>"
    }
  }
}
```

### **Test End-to-End Orchestration**

1. **Create Orchestration** with workflow node
2. **Save Draft** via designer
3. **Publish** orchestration
4. **Execute** via Run button
5. **Check Database** for execution records

**Verify in Database**:
```sql
-- Check orchestration execution
SELECT * FROM orchestration_executions ORDER BY started_at DESC LIMIT 1;

-- Check node executions
SELECT * FROM orchestration_node_executions 
WHERE execution_id = 'your-execution-id';

-- Check workflow analytics
SELECT * FROM workflow_analytics 
WHERE execution_id LIKE 'exec-%' 
ORDER BY created_at DESC;
```

---

## 🔧 Configuration Reference

### **WorkflowNodeConfig Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `workflowId` | string | Yes | GUID of the workflow to execute |
| `executionMode` | enum | No | manual \| auto \| scheduled (default: auto) |
| `targetUrl` | string | No | URL where workflow should run |
| `waitForCompletion` | boolean | No | Whether to wait for workflow to finish |
| `notifyUser` | boolean | No | Whether to notify user (manual mode) |
| `inputMapping` | object | No | Map context variables to workflow inputs |
| `outputMapping` | object | No | Map workflow outputs to context variables |
| `continueOnFailure` | boolean | No | Continue orchestration if workflow fails |
| `timeout` | number | No | Timeout in milliseconds (default: 300000) |

### **Output Variables**

When a workflow node executes, these variables are added to context:

| Variable | Type | Description |
|----------|------|-------------|
| `executionId` | string | Unique execution identifier |
| `workflowId` | string | Workflow GUID |
| `workflowTitle` | string | Workflow title |
| `status` | string | initiated \| completed \| failed \| timeout |
| `steps` | number | Number of steps in workflow |
| `duration` | number | Execution duration (if completed) |
| `guideId` | string | Guide identifier |
| `embedCode` | string | HTML embed code for client execution |

---

## 🚀 Next Steps

### **Enhancement Opportunities**

1. **Webhook Integration**
   - Add webhook callbacks for workflow completion
   - Eliminate polling for better performance

2. **Real-Time Notifications**
   - Integrate with notification node
   - Send emails/Teams/Slack messages for manual workflows

3. **Batch Execution**
   - Execute multiple workflows in parallel
   - Aggregate results

4. **Advanced Tracking**
   - Step-by-step execution monitoring
   - Real-time dashboard for workflow progress

5. **Error Recovery**
   - Automatic retry on failure
   - Fallback workflow execution

---

## 📊 Performance Considerations

### **Polling vs Webhooks**

**Current Implementation** (Polling):
- Polls every 2 seconds
- Default timeout: 5 minutes
- Works without additional infrastructure

**Future Enhancement** (Webhooks):
- Immediate notification on completion
- No polling overhead
- Requires webhook endpoint setup

### **Scalability**

- **Async Execution**: Use message queue for workflow dispatch
- **Caching**: Cache workflow definitions
- **Connection Pooling**: Use database connection pool
- **Rate Limiting**: Limit concurrent workflow executions

---

## 🐛 Troubleshooting

### **Workflow Not Found**

**Error**: `Workflow not found: abc-123-def-456`

**Solutions**:
- Verify workflow ID is correct
- Check workflow status (must be "published")
- Ensure user has access to workflow's company

### **Execution Timeout**

**Error**: `Workflow execution timeout`

**Solutions**:
- Increase `timeout` value in node config
- Check if workflow requires user interaction
- Set `waitForCompletion: false` for long-running workflows

### **Missing Analytics**

**Issue**: No execution records in workflow_analytics

**Solutions**:
- Verify workflow_analytics table exists
- Check database permissions
- Ensure analytics are enabled in workflow config

---

## 📚 Related Documentation

- `ORCHESTRATION_REACTFLOW_IMPLEMENTATION.md` - Visual designer details
- `ORCHESTRATION_TODO.md` - Implementation roadmap
- `db/migrations/052_orchestrations.sql` - Database schema
- `shared/orchestrationTypes.ts` - Type definitions

---

**Implementation Date**: July 2, 2026  
**Status**: ✅ Production Ready  
**Next Priority**: AI Integration (Priority 3)  
