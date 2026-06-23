import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { adminAIProviderConfig, getAdminAIProviderConfig, updateAIProviderConfig } from "@/lib/ai/config";
import { enqueueDocumentReembeddingJobs } from "@/lib/admin/processing-jobs";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
    return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
  }

  return NextResponse.json(adminAIProviderConfig(await getAdminAIProviderConfig()));
}

export async function PATCH(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
    return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Configuration payload is required." }, { status: 400 });
  }

  await updateAIProviderConfig(
    {
      embedding_provider: typeof body.embedding_provider === "string" ? body.embedding_provider : undefined,
      embedding_model: typeof body.embedding_model === "string" ? body.embedding_model : undefined,
      embedding_dimension: typeof body.embedding_dimension !== "undefined" ? Number(body.embedding_dimension) : undefined,
      embedding_endpoint: typeof body.embedding_endpoint === "string" ? body.embedding_endpoint : undefined,
      embedding_api_key: typeof body.embedding_api_key === "string" ? body.embedding_api_key : undefined,
      llm_provider: typeof body.llm_provider === "string" ? body.llm_provider : undefined,
      llm_model: typeof body.llm_model === "string" ? body.llm_model : undefined,
      llm_endpoint: typeof body.llm_endpoint === "string" ? body.llm_endpoint : undefined,
      llm_api_key: typeof body.llm_api_key === "string" ? body.llm_api_key : undefined
    },
    session.user.id
  );

  const config = adminAIProviderConfig(await getAdminAIProviderConfig());
  const reembedding = body.reembed_documents === true ? await enqueueDocumentReembeddingJobs() : null;

  return NextResponse.json({
    ...config,
    reembedding
  });
}
