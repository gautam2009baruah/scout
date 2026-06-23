import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AIConfigurationForm, AdminShell } from "@/components/admin";
import { adminAIProviderConfig, getAdminAIProviderConfig } from "@/lib/ai/config";
import { MODULE_KEYS, requireModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const metadata: Metadata = {
  title: "AI Configuration | Scout",
  description: "Configure local and external AI providers for Scout."
};

const embeddingProviders = [
  { key: "local_bge", name: "Local Ollama Embeddings", default_model: "nomic-embed-text", default_dimension: 768, requires_api_key: false },
  { key: "openai", name: "OpenAI", default_model: "text-embedding-3-small", default_dimension: 1536, requires_api_key: true },
  { key: "gemini", name: "Gemini", default_model: "gemini-embedding-001", default_dimension: 768, requires_api_key: true },
  { key: "custom", name: "Custom", default_model: "", default_dimension: 384, requires_api_key: false }
];

const llmProviders = [
  { key: "ollama", name: "Ollama", default_model: "qwen3:0.6b", requires_api_key: false },
  { key: "openai", name: "OpenAI", default_model: "gpt-4.1-mini", requires_api_key: true },
  { key: "gemini", name: "Gemini", default_model: "gemini-2.5-flash", requires_api_key: true },
  { key: "anthropic", name: "Anthropic", default_model: "claude-3-5-haiku-latest", requires_api_key: true },
  { key: "custom", name: "Custom", default_model: "", requires_api_key: false },
  { key: "mock", name: "Mock", default_model: "mock", requires_api_key: false }
];

export default async function AIConfigurationPage() {
  const session = await getCurrentAdminSession();

  if (!session) {
    redirect("/control-panel/login");
  }

  requireModuleAccess(session, MODULE_KEYS.aiConfiguration);

  const config = adminAIProviderConfig(await getAdminAIProviderConfig());

  return (
    <AdminShell active={MODULE_KEYS.aiConfiguration} session={session} title="AI Configuration">
      <AIConfigurationForm config={config} embeddingProviders={embeddingProviders} llmProviders={llmProviders} />
    </AdminShell>
  );
}
