import { NextResponse } from "next/server";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";
import {
  createChatAttachment,
  enforceChatAttachmentRateLimit,
  ChatAttachmentError,
  MAX_CHAT_ATTACHMENT_SIZE_BYTES
} from "@/lib/chat/attachments";

export const runtime = "nodejs";

function handleError(error: unknown) {
  if (error instanceof ChatbotApiKeyAccessError || error instanceof ChatAttachmentError) {
    return NextResponse.json({ message: error.message }, { status: error.statusCode });
  }

  throw error;
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ message: "Expected multipart/form-data." }, { status: 400 });
  }

  const form = await request.formData();
  const companyIdentifier = String(form.get("companyId") || "").trim();
  const targetAppIdentifier = String(form.get("targetAppId") || "").trim();
  const userId = String(form.get("userId") || "").trim();
  const conversationId = String(form.get("conversationId") || "").trim() || undefined;
  const file = form.get("file");

  let companyId = "";
  let targetAppId = "";

  try {
    companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : "";
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Invalid scoped identifier." },
      { status: 400 }
    );
  }

  if (!(file && typeof file === "object" && "arrayBuffer" in file)) {
    return NextResponse.json({ message: "A file is required." }, { status: 400 });
  }

  try {
    await assertChatbotApiKeyAccess(request, { companyId, targetAppId, userId });
    await enforceChatAttachmentRateLimit(companyId, userId || "anonymous");

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await createChatAttachment({
      companyId,
      targetAppId: targetAppId || null,
      conversationId,
      uploadedByUserId: userId || null,
      originalFilename: file.name,
      mimeType: file.type || null,
      buffer
    });

    return NextResponse.json({
      id: attachment.id,
      name: attachment.originalFilename,
      size: attachment.fileSize,
      mimeType: attachment.mimeType,
      fileType: attachment.fileType
    });
  } catch (error) {
    return handleError(error);
  }
}

export function GET() {
  return NextResponse.json({ maxSizeBytes: MAX_CHAT_ATTACHMENT_SIZE_BYTES }, { status: 200 });
}
