// Database node executor
// Placeholder executor with no behavior yet.

import type { DatabaseNodeConfig } from "@/shared/orchestrationTypes";

export async function executeDatabaseNode(
  _config: DatabaseNodeConfig,
  _context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  return {
    success: true,
    output: {},
  };
}
