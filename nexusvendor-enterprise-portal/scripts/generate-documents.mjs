import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = join(root, "public", "documents");
await mkdir(output, { recursive: true });

const organizations = [
  "Asteron Cloud Services", "Northbridge Facilities Group", "Meridian BioAnalytics", "Cobalt Freight Systems",
  "Evergreen Office Products", "BluePeak Cyber Advisory", "Helix Medical Logistics", "Redwood Data Systems",
  "Summit Industrial Controls", "Orion Workplace Solutions", "Clearwater Energy Partners", "Atlas Translation Services",
  "Beacon Legal Operations", "Crescent Payment Technologies", "Ironwood Records Management", "Luma Learning Systems",
  "NovaFleet Mobility", "Silverline Research Labs", "TerraNova Packaging", "Westhaven Consulting"
];
const types = [
  ["information-security-policy","Information Security Policy","Policy"], ["master-services-agreement","Master Services Agreement","Contract"],
  ["supplier-code-of-conduct","Supplier Code of Conduct","Policy"], ["invoice-processing-sop","Invoice Processing Standard Operating Procedure","SOP"],
  ["security-questionnaire","Third-Party Security Questionnaire","Questionnaire"], ["business-continuity-plan","Business Continuity Plan","Plan"],
  ["data-processing-addendum","Data Processing Addendum","Contract"], ["risk-assessment-report","Third-Party Risk Assessment Report","Report"],
  ["compliance-certificate","Compliance Attestation Certificate","Certificate"], ["audit-report","Independent Controls Audit Report","Audit"],
  ["meeting-minutes","Quarterly Vendor Governance Meeting Minutes","Minutes"], ["request-for-proposal","Request for Proposal","RFP"],
  ["purchase-order","Enterprise Purchase Order","Purchase Order"], ["service-level-agreement","Service Level Agreement","Contract"],
  ["incident-response-procedure","Supplier Incident Response Procedure","Procedure"]
];
const owners = ["Maya Chen", "Daniel Okafor", "Sofia Alvarez", "Oliver Grant", "Priya Raman", "Elena Ortiz"];
const index = [];

function body(org, title, category, sequence) {
  const ref = `NV-${category.toUpperCase().replace(/[^A-Z]/g,"").slice(0,4)}-${String(sequence).padStart(5,"0")}`;
  const effective = `2026-${String((sequence % 9)+1).padStart(2,"0")}-${String((sequence % 24)+1).padStart(2,"0")}`;
  const owner = owners[sequence % owners.length];
  return `---\ndocument_id: ${ref}\ntitle: ${title} — ${org}\ndocument_type: ${category}\norganization: ${org}\nowner: ${owner}\nstatus: Approved\neffective_date: ${effective}\nclassification: Internal\nretention: 7 years\n---\n\n# ${title}\n\n**Organization:** ${org}  \n**NexusVendor reference:** ${ref}  \n**Business owner:** ${owner}  \n**Effective date:** ${effective}  \n**Review frequency:** Annual\n\n## 1. Purpose and business context\n\nThis ${category.toLowerCase()} establishes the operational, commercial, security, and governance expectations between Nexus Global Holdings Inc. and ${org}. It supports controlled vendor lifecycle management and provides reviewable evidence for Procurement, Finance, Legal, Risk, Compliance, and Internal Audit. The record applies to services, personnel, systems, locations, and subcontractors used to deliver the contracted scope.\n\n## 2. Scope\n\nThe scope includes onboarding, due diligence, contracting, purchase authorization, service delivery, invoicing, payment, performance monitoring, information handling, regulatory cooperation, issue remediation, renewal, and offboarding. ${org} must maintain an accountable service owner and notify NexusVendor within five business days when material ownership, banking, control, location, or subcontractor information changes.\n\n## 3. Roles and responsibilities\n\n- **Business owner:** confirms business need, funding, service performance, and continued relevance.\n- **Procurement:** manages competition, commercial terms, purchase orders, and supplier performance.\n- **Legal:** approves contractual deviations, liability positions, privacy terms, and termination rights.\n- **Risk and Compliance:** assess control design, evidence, sanctions, privacy, resilience, and remediation.\n- **Finance:** validates tax, banking, invoice matching, approval, and payment controls.\n- **${org}:** supplies accurate evidence, performs agreed controls, and escalates exceptions promptly.\n\n## 4. Mandatory control requirements\n\n1. Access must be approved, least-privileged, attributable to an individual, and reviewed quarterly.\n2. Confidential information must be encrypted in transit and at rest using supported cryptographic standards.\n3. Security and privacy incidents must be reported within 24 hours of confirmation, with material facts updated daily.\n4. Business continuity capabilities must be tested annually against documented recovery objectives.\n5. Invoices must reference a valid purchase order, contracted rate, service period, tax treatment, and receiving evidence.\n6. Records must remain available for audit throughout the stated retention period and any active legal hold.\n7. Subcontractors require documented due diligence and equivalent confidentiality, security, and compliance obligations.\n\n## 5. Operating procedure\n\nThe record owner initiates the workflow in NexusVendor, confirms the legal entity and target application, and attaches current evidence. Reviewers record findings with an owner, severity, due date, and acceptance criteria. High-risk exceptions require Risk and Legal approval; financial exceptions require Finance approval. Final approval creates a dated audit event and schedules the next review. Expired evidence automatically returns the record to review status.\n\n## 6. Service and performance measures\n\n| Measure | Target | Escalation threshold | Evidence |\n|---|---:|---:|---|\n| Critical service availability | 99.90% monthly | Below 99.50% | Monitoring report |\n| Priority-one response | 30 minutes | Over 60 minutes | Incident timeline |\n| Invoice accuracy | 98.0% | Below 95.0% | Match exception report |\n| Control evidence freshness | 365 days | Any expired item | Compliance register |\n| Corrective action closure | 30 days | Over 45 days | Remediation plan |\n\n## 7. Risk, compliance, and evidence\n\nThe inherent risk rating considers service criticality, annual spend, data classification, system connectivity, geographic exposure, concentration, financial viability, and regulatory impact. Required evidence may include ISO 27001 certification, SOC 2 Type II reports, penetration-test summaries, insurance certificates, privacy schedules, continuity test results, beneficial-ownership records, sanctions screening, and audited financial statements. Evidence is assessed for scope, period, exceptions, management response, and continuing validity.\n\n## 8. Exceptions and escalation\n\nExceptions must identify the requirement, current condition, business impact, compensating control, accountable owner, target resolution date, and approval authority. Critical exceptions are escalated immediately to the Enterprise Risk Committee. Acceptance cannot exceed twelve months without reassessment. Repeated missed commitments may lead to payment hold, restricted access, suspension of new work, or termination.\n\n## 9. Approval and review history\n\n| Role | Approver | Decision | Date |\n|---|---|---|---|\n| Business owner | ${owner} | Approved | ${effective} |\n| Procurement | Oliver Grant | Approved | ${effective} |\n| Risk and Compliance | Daniel Okafor | Approved with monitoring | ${effective} |\n| Legal | Sofia Alvarez | Approved | ${effective} |\n\n## 10. Related records\n\nRelated records include the vendor master profile, executed agreement, current purchase order, risk assessment, security questionnaire, insurance certificate, invoice history, performance scorecard, remediation log, and audit trail. This fictional training document contains no real personal, banking, or confidential information.\n`;
}

let sequence = 1;
for (const org of organizations) {
  for (const [slug, title, category] of types) {
    const filename = `${String(sequence).padStart(4,"0")}-${org.toLowerCase().replace(/[^a-z0-9]+/g,"-")}-${slug}.md`;
    const content = body(org, title, category, sequence);
    await writeFile(join(output, filename), content, "utf8");
    index.push({ id: `DOC-${String(sequence).padStart(6,"0")}`, title: `${title} — ${org}`, category, organization: org, filename, word_count: content.split(/\s+/).length });
    sequence++;
  }
}
await writeFile(join(output, "index.json"), JSON.stringify({ generated_at: "2026-07-13T00:00:00Z", license: "CC0 fictional training content", count: index.length, documents: index }, null, 2), "utf8");
console.log(`Generated ${index.length} curated training documents in ${output}`);
