# Workflow Node Input/Output Mapping Guide

## Overview

The **Workflow Node** executes pre-recorded guided workflows with dynamic data from orchestration context. This guide explains how to configure input and output mappings.

---

## 📥 Input Mapping (Context → Workflow)

Input mapping transforms orchestration context data into workflow parameters.

### Configuration UI

When you select a Workflow node in the orchestration designer:

1. Open **Node Properties Panel** (right sidebar)
2. Navigate to **📥 Input Mapping** section
3. Click **"Add Input Mapping"**
4. Fill in:
   - **Left field** (Workflow Parameter): The parameter name the workflow expects
   - **Right field** (Source Expression): Where to get the data from context

### Expression Syntax

Use `{{variable.path}}` to access context data:

| Expression | Description |
|------------|-------------|
| `{{trigger.input.fieldName}}` | Access trigger input fields |
| `{{trigger.startedBy}}` | User who triggered the orchestration |
| `{{variables.myVar}}` | Access variable node output |
| `{{workflow.PreviousWorkflow.result}}` | Access previous workflow output |
| `{{ai_extraction.ExtractNode.extractedData}}` | Access AI extraction output |

### Examples

#### Example 1: Create Invoice Workflow

**Trigger Input:**
```json
{
  "customerName": "Acme Corp",
  "invoiceAmount": 1500,
  "dueDate": "2026-08-01"
}
```

**Input Mapping:**
```
customer       ←  {{trigger.input.customerName}}
amount         ←  {{trigger.input.invoiceAmount}}
dueDate        ←  {{trigger.input.dueDate}}
createdBy      ←  {{trigger.startedBy}}
```

**Result:** Workflow receives:
```json
{
  "customer": "Acme Corp",
  "amount": 1500,
  "dueDate": "2026-08-01",
  "createdBy": "admin@company.com"
}
```

#### Example 2: Using Previous Node Outputs

**Scenario:** AI extraction extracted customer data, now create workflow with it

**Input Mapping:**
```
customerName   ←  {{ai_extraction.ExtractCustomer.name}}
customerEmail  ←  {{ai_extraction.ExtractCustomer.email}}
accountId      ←  {{workflow.CreateAccount.accountId}}
```

#### Example 3: Static Values

You can also use static values:

```
priority       ←  high
region         ←  US-WEST
```

---

## 📤 Output Mapping (Workflow → Context)

Output mapping saves workflow results into orchestration context for use by subsequent nodes.

### Configuration UI

1. Navigate to **📤 Output Mapping** section
2. Click **"Add Output Mapping"**
3. Fill in:
   - **Left field** (Variable Name): Name to store in context
   - **Right field** (Workflow Output): Field name from workflow result

### Available Workflow Outputs

Every workflow returns:

| Field | Description |
|-------|-------------|
| `executionId` | Unique execution ID |
| `workflowId` | Workflow identifier |
| `workflowTitle` | Workflow display name |
| `status` | Execution status (completed/failed) |
| `steps` | Number of steps executed |
| `duration` | Execution time in milliseconds |
| `output.*` | Custom output fields from workflow |

### Examples

#### Example 1: Save Invoice ID

**Workflow Output:**
```json
{
  "executionId": "exec-123",
  "status": "completed",
  "output": {
    "invoiceId": "INV-12345",
    "pdfUrl": "/files/invoice.pdf",
    "total": 1500
  }
}
```

**Output Mapping:**
```
invoiceId      ←  output.invoiceId
pdfPath        ←  output.pdfUrl
invoiceTotal   ←  output.total
```

**Result in Context:**
```json
{
  "invoiceId": "INV-12345",
  "pdfPath": "/files/invoice.pdf",
  "invoiceTotal": 1500
}
```

#### Example 2: Use in Subsequent Nodes

After output mapping, other nodes can access these variables:

**Notification Node:**
```
Message: "Invoice {{invoiceId}} created for {{trigger.input.customerName}}"
```

**AI Decision Node:**
```
Input: "Invoice total is {{invoiceTotal}}. Should we apply discount?"
```

---

## 🎯 Complete Example: End-to-End Flow

### Orchestration Setup

**1. Trigger Node (Manual)**
- Input Fields:
  - customerName (text)
  - orderAmount (number)
  - priority (dropdown)

**2. Workflow Node (CreateOrder)**
- **Workflow ID:** `CreateOrderWorkflow`
- **Input Mapping:**
  ```
  customer       ←  {{trigger.input.customerName}}
  amount         ←  {{trigger.input.orderAmount}}
  priority       ←  {{trigger.input.priority}}
  createdBy      ←  {{trigger.startedBy}}
  ```
- **Output Mapping:**
  ```
  orderId        ←  output.orderId
  orderStatus    ←  output.status
  trackingUrl    ←  output.trackingUrl
  ```

**3. Notification Node**
- **Message:**
  ```
  Order {{orderId}} created for {{trigger.input.customerName}}
  Amount: ${{trigger.input.orderAmount}}
  Tracking: {{trackingUrl}}
  ```

### Execution Flow

**User Triggers with:**
```json
{
  "customerName": "Acme Corp",
  "orderAmount": 2500,
  "priority": "high"
}
```

**Workflow Node Executes:**
1. Loads `CreateOrderWorkflow`
2. Passes parameters:
   ```json
   {
     "customer": "Acme Corp",
     "amount": 2500,
     "priority": "high",
     "createdBy": "admin@company.com"
   }
   ```
3. Workflow runs (opens browser, fills forms, submits, extracts order ID)
4. Returns:
   ```json
   {
     "output": {
       "orderId": "ORD-98765",
       "status": "pending",
       "trackingUrl": "https://track.example.com/ORD-98765"
     }
   }
   ```
5. Output mapping saves to context:
   ```json
   {
     "orderId": "ORD-98765",
     "orderStatus": "pending",
     "trackingUrl": "https://track.example.com/ORD-98765"
   }
   ```

**Notification Node Sends:**
```
Order ORD-98765 created for Acme Corp
Amount: $2500
Tracking: https://track.example.com/ORD-98765
```

---

## 🔧 Advanced Usage

### Nested Object Access

```
customerAddress.city     ←  {{trigger.input.customer.address.city}}
metadata.tags[0]         ←  {{ai_extraction.Tags.firstTag}}
```

### Conditional Values (Using AI Decision)

```
discountRate   ←  {{ai_decision.CheckEligibility.discountPercent}}
approvalNeeded ←  {{ai_decision.CheckEligibility.requiresApproval}}
```

### Combining Multiple Sources

```
fullName       ←  {{trigger.input.firstName}} {{trigger.input.lastName}}
summary        ←  Order for {{trigger.input.customer}} - ${{orderTotal}}
```

---

## 🚨 Common Pitfalls

### ❌ Wrong: Missing Curly Braces
```
customer  ←  trigger.input.customerName  (Won't work!)
```

### ✅ Correct: Use Expression Syntax
```
customer  ←  {{trigger.input.customerName}}
```

### ❌ Wrong: Incorrect Path
```
orderId   ←  orderId  (Workflow output is nested under 'output')
```

### ✅ Correct: Use Proper Path
```
orderId   ←  output.orderId
```

### ❌ Wrong: Empty Mappings
Leaving key or value empty will be ignored. Remove unused mappings.

---

## 💡 Best Practices

1. **Use Descriptive Names**: `customerId` is better than `id`
2. **Validate Required Fields**: Use trigger field validation for required inputs
3. **Document Complex Mappings**: Add comments in orchestration description
4. **Test Incrementally**: Test each mapping individually
5. **Check Output Structure**: Inspect workflow output to know available fields
6. **Use Default Values**: For optional fields, provide defaults in workflow

---

## 🔍 Debugging

### View Context Data

In the orchestration execution logs, you can see:
- Input context before workflow execution
- Workflow parameters sent
- Workflow output received
- Final context after output mapping

### Test Individual Workflows

Before using in orchestrations:
1. Test the workflow standalone
2. Note what parameters it expects
3. Check what output fields it returns
4. Design mappings accordingly

---

## 📚 Related Documentation

- [Orchestration Designer Guide](./ORCHESTRATION_DESIGNER.md)
- [Expression Evaluator Reference](./lib/orchestrations/expression-evaluator.ts)
- [Guided Workflow Recording](./RECORDER_ENHANCEMENT.md)
- [Workflow Node Executor](./lib/orchestrations/nodes/workflow-node.ts)
