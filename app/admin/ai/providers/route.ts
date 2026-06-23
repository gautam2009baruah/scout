import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
    return NextResponse.json({ message: "You do not have permission to manage AI providers." }, { status: 403 });
  }

  return NextResponse.json({
    embedding_providers: [
      { key: "local_bge", name: "Local Ollama Embeddings", default_model: "nomic-embed-text", default_dimension: 768, requires_api_key: false },
      { key: "openai", name: "OpenAI", default_model: "text-embedding-3-small", default_dimension: 1536, requires_api_key: true },
      { key: "gemini", name: "Gemini", default_model: "gemini-embedding-001", default_dimension: 768, requires_api_key: true },
      { key: "custom", name: "Custom", default_model: "", default_dimension: 384, requires_api_key: false }
    ],
    llm_providers: [
      { key: "ollama", name: "Ollama", default_model: "qwen3:0.6b", requires_api_key: false },
      { key: "openai", name: "OpenAI", default_model: "gpt-4.1-mini", requires_api_key: true },
      { key: "gemini", name: "Gemini", default_model: "gemini-2.5-flash", requires_api_key: true },
      { key: "anthropic", name: "Anthropic", default_model: "claude-3-5-haiku-latest", requires_api_key: true },
      { key: "custom", name: "Custom", default_model: "", requires_api_key: false },
      { key: "mock", name: "Mock", default_model: "mock", requires_api_key: false }
    ]
  });
}
