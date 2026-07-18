import type { DatabaseType } from "./types.js";

export type AppConfig = {
  host: string;
  port: number;
  databaseType: DatabaseType;
  databaseName: string;
  databaseSchema: string;
  databaseUrl: string;
  dbHost: string;
  dbPort: number;
  dbUser: string;
  dbPassword: string;
  dbSsl: boolean;
  mysqlHost: string;
  mysqlPort: number;
  mysqlUser: string;
  mysqlPassword: string;
  mysqlDatabase: string;
  mssqlServer: string;
  mssqlPort: number;
  mssqlUser: string;
  mssqlPassword: string;
  mssqlDatabase: string;
  mssqlEncrypt: boolean;
};

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback = false) {
  if (value === undefined) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseDatabaseType(value: string | undefined): DatabaseType {
  const normalized = String(value || "postgresql").trim().toLowerCase();
  if (normalized === "mysql" || normalized === "sqlserver") return normalized;
  return "postgresql";
}

export function loadConfig(): AppConfig {
  const databaseType = parseDatabaseType(process.env.DB_TYPE);

  return {
    host: process.env.HOST?.trim() || "0.0.0.0",
    port: parseNumber(process.env.PORT, 4300),
    databaseType,
    databaseName: process.env.DB_NAME?.trim() || process.env.MYSQL_DATABASE?.trim() || process.env.MSSQL_DATABASE?.trim() || "database",
    databaseSchema: process.env.DB_SCHEMA?.trim() || (databaseType === "sqlserver" ? "dbo" : "public"),
    databaseUrl: process.env.DATABASE_URL?.trim() || "",
    dbHost: process.env.DB_HOST?.trim() || "localhost",
    dbPort: parseNumber(process.env.DB_PORT, 5432),
    dbUser: process.env.DB_USER?.trim() || "postgres",
    dbPassword: process.env.DB_PASSWORD?.trim() || "",
    dbSsl: parseBoolean(process.env.DB_SSL, false),
    mysqlHost: process.env.MYSQL_HOST?.trim() || "localhost",
    mysqlPort: parseNumber(process.env.MYSQL_PORT, 3306),
    mysqlUser: process.env.MYSQL_USER?.trim() || "root",
    mysqlPassword: process.env.MYSQL_PASSWORD?.trim() || "",
    mysqlDatabase: process.env.MYSQL_DATABASE?.trim() || "database",
    mssqlServer: process.env.MSSQL_SERVER?.trim() || "localhost",
    mssqlPort: parseNumber(process.env.MSSQL_PORT, 1433),
    mssqlUser: process.env.MSSQL_USER?.trim() || "sa",
    mssqlPassword: process.env.MSSQL_PASSWORD?.trim() || "",
    mssqlDatabase: process.env.MSSQL_DATABASE?.trim() || "master",
    mssqlEncrypt: parseBoolean(process.env.MSSQL_ENCRYPT, false),
  };
}

export function validateConfig(config: AppConfig) {
  if (config.databaseType === "postgresql") {
    if (config.databaseUrl) {
      let parsed: URL;
      try {
        parsed = new URL(config.databaseUrl);
      } catch {
        throw new Error("DATABASE_URL is invalid. Expected: postgresql://user:password@host:5432/database");
      }

      if (!["postgresql:", "postgres:"].includes(parsed.protocol)) {
        throw new Error("DATABASE_URL must start with postgresql:// or postgres://.");
      }
      if (!parsed.username || !parsed.password || !parsed.hostname || !parsed.pathname.slice(1)) {
        throw new Error("DATABASE_URL must include a user, password, host, and database name.");
      }
    } else if (!config.dbUser || !config.dbPassword || !config.databaseName) {
      throw new Error(
        "PostgreSQL configuration is incomplete. Set DATABASE_URL, or set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, and DB_NAME in .env.",
      );
    }
  }

  if (config.databaseType === "mysql" && (!config.mysqlHost || !config.mysqlUser || !config.mysqlDatabase)) {
    throw new Error("MySQL configuration is incomplete. Check the MYSQL_* values in .env.");
  }

  if (config.databaseType === "sqlserver" && (!config.mssqlServer || !config.mssqlUser || !config.mssqlDatabase)) {
    throw new Error("SQL Server configuration is incomplete. Check the MSSQL_* values in .env.");
  }
}
