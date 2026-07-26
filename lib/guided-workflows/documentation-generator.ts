import { getPool } from "@/lib/db/pool";
import { getGuidedWorkflowById } from "@/lib/admin/guided-workflows";
import {
  createDocument,
  updateDocument,
  getDocumentById,
  buildDocumentStoragePath,
  checksumBuffer,
  type DocumentRow
} from "@/lib/admin/documents";
import { createTopic } from "@/lib/admin/content-structure";
import { enqueueProcessingJob } from "@/lib/admin/processing-jobs";
import { getStorageProvider } from "@/lib/storage/provider";
import { getLLMProvider } from "@/lib/llm/providers";
import type { AdminSession } from "@/lib/admin/auth";
import type { GuideStep } from "@/shared/guideTypes";

const GENERATED_FOLDER_NAME = "Generated Workflow Guides";

export class GuideDocumentationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "GuideDocumentationError";
    this.statusCode = statusCode;
  }
}

function describeStep(step: GuideStep, index: number): string {
  const target = step.target ?? {};
  const targetDescription =
    target.fallbackText ||
    target.accessibleName ||
    target.text ||
    target.labelText ||
    target.ariaLabel ||
    target.nearbyHeading ||
    target.formTitle ||
    target.placeholder ||
    "the highlighted element";

  const actionWord =
    step.stepPurpose === "navigation"
      ? "Navigate to"
      : step.trigger === "change" || step.trigger === "input"
        ? "Enter a value in"
        : "Click";

  const lines = [`${index + 1}. ${step.title || `Step ${index + 1}`}`, `   Action: ${actionWord} ${targetDescription}`];

  if (step.message) {
    lines.push(`   Instruction: ${step.message}`);
  }

  return lines.join("\n");
}

function buildStepSummary(steps: GuideStep[]): string {
  return steps
    .filter((step) => step.enabled !== false)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(describeStep)
    .join("\n\n");
}

async function findOrCreateGeneratedFolder(companyId: string, session: AdminSession): Promise<string> {
  const existing = await getPool().query<{ id: string }>(
    `
      SELECT id FROM folders
      WHERE company_id = $1 AND parent_id IS NULL AND name = $2 AND deleted_at IS NULL
      LIMIT 1
    `,
    [companyId, GENERATED_FOLDER_NAME]
  );

  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  return createTopic({ companyId, name: GENERATED_FOLDER_NAME }, session);
}

const DOCUMENTATION_SYSTEM_PROMPT = [
  "You are a technical writer producing a step-by-step how-to article for end users of a business application.",
  "You will be given a numbered list of recorded UI interaction steps (what was clicked, typed, or navigated to).",
  "Write a clear, concise markdown article that explains how to complete this process: a one- or two-sentence",
  "introduction describing what the process accomplishes, followed by numbered instructions in plain language.",
  "Do not invent steps, fields, or outcomes that are not present in the provided steps."
].join(" ");

export async function generateGuideDocumentation(guideId: string, session: AdminSession): Promise<DocumentRow> {
  const guide = await getGuidedWorkflowById(guideId, session);

  const stepSummary = buildStepSummary(guide.steps ?? []);

  if (!stepSummary) {
    throw new GuideDocumentationError("This guide has no enabled steps to document.");
  }

  const provider = await getLLMProvider(guide.companyId);
  const userPrompt = `Guide title: ${guide.title}\nGuide description: ${guide.description || "(none provided)"}\n\nWrite the how-to article now.`;
  const markdown = await provider.generate_answer(DOCUMENTATION_SYSTEM_PROMPT, userPrompt, stepSummary);

  if (!markdown || !markdown.trim()) {
    throw new GuideDocumentationError("The AI provider did not return any documentation content.");
  }

  const folderId = await findOrCreateGeneratedFolder(guide.companyId, session);

  const buffer = Buffer.from(markdown, "utf8");
  const checksum = checksumBuffer(buffer);
  // Stable, guide-scoped filename: repeated generations for the same guide land on the
  // same (company, folder, filename) tuple, so createDocument()'s built-in version-tracking
  // updates the existing document in place instead of creating a duplicate.
  const originalFilename = `guide-${guide.id}.md`;

  const document = await createDocument(
    {
      companyId: guide.companyId,
      folderId,
      name: guide.title?.trim() || "Generated Workflow Guide",
      originalFilename,
      fileType: "md",
      mimeType: "text/markdown",
      fileSize: buffer.length,
      checksum,
      status: "queued",
      sourceGuideId: guide.id
    },
    session
  );

  const storage = getStorageProvider();
  const storagePath = buildDocumentStoragePath(guide.companyId, folderId, document.id, originalFilename);
  await storage.save_file(buffer, storagePath);

  const updatedDocument = await updateDocument(
    document.id,
    {
      storagePath,
      status: "uploaded",
      errorMessage: null
    },
    session
  );

  await enqueueProcessingJob({
    companyId: updatedDocument.companyId,
    documentId: updatedDocument.id,
    jobType: "parse_document",
    maxAttempts: 3
  });

  return updatedDocument;
}

export async function getGeneratedDocumentForGuide(guideId: string, session: AdminSession): Promise<DocumentRow | null> {
  const result = await getPool().query<{ id: string }>(
    `
      SELECT id FROM documents
      WHERE source_guide_id = $1 AND status <> 'deleted'
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [guideId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return getDocumentById(result.rows[0].id, session);
}
