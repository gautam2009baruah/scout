export const roles = ["Admin", "Procurement", "Finance", "Legal", "Risk", "Compliance", "Vendor", "Auditor", "Executive"];

export const modules = [
  ["dashboard", "Command Center", "overview"], ["vendors", "Vendor Registry", "vendor"],
  ["onboarding", "Vendor Onboarding", "vendor"], ["procurement", "Procurement Requests", "buying"],
  ["rfps", "RFP & Sourcing", "buying"], ["purchase-orders", "Purchase Orders", "buying"],
  ["contracts", "Contract Workspace", "legal"], ["risk", "Third-Party Risk", "risk"],
  ["compliance", "Compliance Reviews", "risk"], ["invoices", "Invoice Processing", "finance"],
  ["payments", "Payments & Banking", "finance"], ["documents", "Document Library", "records"],
  ["approvals", "Approval Center", "workflow"], ["audits", "Audit & Controls", "records"],
  ["administration", "Portal Administration", "settings"]
].map(([key, title, group]) => ({ key, title, group, path: key === "dashboard" ? "/" : `/${key}` }));

export const vendors = [
  ["VEN-10042", "Asteron Cloud Services", "Technology", "Strategic", "Approved", "Low", "$2,480,000", "Maya Chen"],
  ["VEN-10057", "Northbridge Facilities Group", "Facilities", "Preferred", "Conditional", "Medium", "$845,000", "Oliver Grant"],
  ["VEN-10063", "Meridian BioAnalytics", "Laboratory", "Critical", "Under Review", "High", "$1,920,000", "Priya Raman"],
  ["VEN-10071", "Cobalt Freight Systems", "Logistics", "Preferred", "Approved", "Medium", "$1,140,000", "Elena Ortiz"],
  ["VEN-10088", "Evergreen Office Products", "Office Supplies", "Standard", "Approved", "Low", "$318,400", "Jon Bell"]
].map(([id,name,category,tier,status,risk,spend,owner]) => ({ id,name,category,tier,status,risk,spend,owner }));

export const records = {
  procurement: [["PR-2026-0184","Cloud observability renewal","Asteron Cloud Services","$486,000","Pending Finance"],["PR-2026-0191","Clinical sample analyzers","Meridian BioAnalytics","$312,500","Risk Review"],["PR-2026-0197","Distribution lane expansion","Cobalt Freight Systems","$178,200","Draft"]],
  rfps: [["RFP-2026-031","Global IT service desk","Technology","Evaluation","2026-08-15"],["RFP-2026-036","EMEA facilities management","Facilities","Published","2026-08-28"],["RFP-2026-040","Cyber assurance services","Professional Services","Draft","2026-09-10"]],
  "purchase-orders": [["PO-45009318","Asteron Cloud Services","$486,000","Open","2026-07-01"],["PO-45009342","Cobalt Freight Systems","$178,200","Partially Received","2026-07-08"],["PO-45009377","Evergreen Office Products","$42,850","Pending Approval","2026-07-12"]],
  contracts: [["CTR-2025-0088","Enterprise Cloud Services MSA","Asteron Cloud Services","Active","2027-01-31"],["CTR-2026-0021","Cold Chain Logistics Agreement","Cobalt Freight Systems","Legal Review","2029-06-30"],["CTR-2026-0034","Laboratory Equipment Lease","Meridian BioAnalytics","Negotiation","2031-03-31"]],
  risk: [["RA-2026-104","Meridian BioAnalytics","High","Cybersecurity","Remediation"],["RA-2026-109","Northbridge Facilities Group","Medium","Operational","Monitoring"],["RA-2026-117","Asteron Cloud Services","Low","Data Privacy","Approved"]],
  compliance: [["CMP-2026-442","Asteron Cloud Services","SOC 2 Type II","Compliant","2027-04-15"],["CMP-2026-451","Meridian BioAnalytics","ISO 27001","Evidence Required","2026-08-01"],["CMP-2026-463","Cobalt Freight Systems","Modern Slavery","Compliant","2027-01-12"]],
  invoices: [["INV-908341","Asteron Cloud Services","PO-45009318","$40,500","3-way Match","2026-08-01"],["INV-908377","Cobalt Freight Systems","PO-45009342","$62,430","Exception","2026-07-29"],["INV-908402","Evergreen Office Products","PO-45009377","$14,280","Pending Approval","2026-08-10"]],
  payments: [["PAY-2026-7712","Asteron Cloud Services","$40,500","ACH","Scheduled"],["PAY-2026-7728","Evergreen Office Products","$14,280","Virtual Card","On Hold"],["PAY-2026-7741","Cobalt Freight Systems","$62,430","Wire","Compliance Check"]],
  approvals: [["APR-60281","Contract exception","CTR-2026-0021","Legal","Pending"],["APR-60304","Invoice exception","INV-908377","Finance","Escalated"],["APR-60319","Vendor activation","VEN-10063","Compliance","Pending"]],
  audits: [["AUD-2026-014","Third-party access review","ITGC","Fieldwork","2026-08-31"],["AUD-2026-019","Procure-to-pay controls","SOX","Planning","2026-10-15"],["AUD-2026-022","Vendor sanctions screening","Compliance","Complete","2026-06-30"]]
};

export const baseFields = [
  ["record-title","Record title","text","Enterprise service record"], ["record-id","Record ID","text","NV-2026-00418"],
  ["description","Business description","textarea","Managed enterprise service supporting critical operations."], ["owner-email","Owner email","email","maya.chen@nexusvendor.example"],
  ["owner-phone","Owner phone","tel","+1 312 555 0184"], ["portal-url","Reference URL","url","https://portal.example/reference"],
  ["effective-date","Effective date","date","2026-07-13"], ["review-time","Review time","time","09:30"],
  ["review-datetime","Review meeting","datetime-local","2026-07-20T09:30"], ["estimated-value","Estimated value","number","250000"],
  ["confidence","Confidence percentage","range","78"], ["priority","Priority","select","Medium"],
  ["regions","Operating regions","multiselect","North America,EMEA"], ["category-search","Category search","search","Technology services"],
  ["confidential","Confidential record","checkbox","true"], ["renewal","Auto renewal","toggle","false"],
  ["decision","Recommended decision","radio","Approve"], ["attachment","Supporting files","file",""],
  ["approver-signature","Approver signature","signature","Maya Chen"], ["internal-notes","Internal notes","richtext","Review complete. Evidence retained according to policy."],
  ["access-code","Secure access code","password","Nexus!2026"], ["currency","Transaction currency","select","USD"],
  ["tax-rate","Tax rate (%)","number","8.25"], ["cost-center","Cost center","select","CC-4100 Technology"],
  ["legal-entity","Legal entity","select","Nexus Global Holdings Inc."], ["business-unit","Business unit","select","Corporate Services"],
  ["data-classification","Data classification","select","Internal"], ["retention-period","Retention period","select","7 years"]
].map(([key,label,type,value]) => ({ key,label,type,value }));

const moduleFields = {
  vendors: ["Legal name","Trading name","Tax identifier","DUNS number","Registration country","Headquarters address","Diversity status","Primary contact","Annual revenue","Employee count","Parent company","Sanctions result"],
  onboarding: ["Onboarding sponsor","Requested service","Business justification","Anticipated spend","Data access level","System access required","Subprocessors used","Insurance coverage","Bank verification","Beneficial owner","PEP result","Go-live target"],
  procurement: ["Requestor","Department","Commodity code","Required-by date","Budget available","Budget code","Sourcing method","Incumbent vendor","Sole-source reason","Quantity","Unit price","Delivery location"],
  rfps: ["Event title","Sourcing lead","Issue date","Response deadline","Question deadline","Bid currency","Evaluation model","Technical weight","Commercial weight","Risk weight","Invited suppliers","Award target"],
  "purchase-orders": ["PO number","Supplier","Ship-to","Bill-to","Buyer","Payment terms","Incoterms","Freight terms","Line quantity","Unit of measure","Unit price","Receipt tolerance"],
  contracts: ["Agreement type","Counterparty","Legal owner","Start date","End date","Notice period","Governing law","Liability cap","Indemnity","Termination right","Renewal terms","Signature status"],
  risk: ["Assessment type","Inherent risk","Residual risk","Risk owner","Service criticality","Data sensitivity","RTO hours","RPO hours","Control score","Finding count","Remediation due","Monitoring frequency"],
  compliance: ["Framework","Requirement","Control owner","Evidence owner","Evidence period","Test procedure","Sample size","Exception count","Control rating","Certificate issuer","Certificate expiry","Next review"],
  invoices: ["Invoice number","Supplier invoice date","PO number","Gross amount","Net amount","Tax amount","Payment terms","Due date","Matching status","Exception reason","GL account","Posting date"],
  payments: ["Payment reference","Beneficiary","Bank country","Payment method","Settlement date","Bank account ending","Routing code","Sanctions status","Fraud score","Release group","Hold reason","Remittance email"],
  documents: ["Document title","Document type","Document owner","Related record","Version","Language","Effective date","Expiry date","Confidentiality","Legal hold","Keywords","Review cycle"],
  approvals: ["Request type","Request reference","Submitted by","Submitted date","Current stage","Primary approver","Backup approver","SLA hours","Escalation date","Decision rationale","Delegation","Final outcome"],
  audits: ["Audit title","Audit type","Lead auditor","Business owner","Planning start","Fieldwork start","Report date","Scope","Materiality","Control population","Finding rating","Management response"],
  administration: ["Tenant name","Tenant code","Default locale","Time zone","Base currency","Fiscal year start","Password policy","Session timeout","MFA policy","Data residency","Retention policy","Support contact"],
  dashboard: ["Reporting period","Business unit filter","Region filter","Risk threshold","Spend threshold","Contract horizon","Invoice aging","Compliance framework","Owner filter","Currency display","Refresh interval","Executive view"]
};

export function fieldsFor(moduleKey) {
  return [...baseFields, ...(moduleFields[moduleKey] || moduleFields.dashboard).map((label, index) => ({
    key: label.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/(^-|-$)/g,""), label,
    type: index % 9 === 3 ? "date" : index % 9 === 5 ? "select" : index % 9 === 7 ? "number" : "text",
    value: index % 9 === 3 ? "2026-09-30" : index % 9 === 7 ? String(10 + index) : `${label} value`
  }))];
}
