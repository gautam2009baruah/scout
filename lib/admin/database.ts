import { getDatabaseConfig } from "@/lib/config/database";

export type TenantId = string;

export type DatabaseConnectionOptions = {
  url: string;
};

export type TenantContext = {
  tenantId: TenantId;
  slug: string;
  name: string;
};

export interface AdminDataSource {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}

export function getAdminDatabaseOptions(): DatabaseConnectionOptions {
  return {
    url: getDatabaseConfig().url
  };
}
