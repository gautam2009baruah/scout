export type DatabaseType = "postgresql" | "mysql" | "sqlserver";

export type SchemaColumn = {
  name: string;
  type?: string;
  nullable?: boolean;
  description?: string;
  isExposed?: boolean;
};

export type SchemaForeignKey = {
  name?: string;
  column: string;
  referencesTable: string;
  referencesColumn: string;
};

export type SchemaTable = {
  name: string;
  description?: string;
  isExposed?: boolean;
  columns: SchemaColumn[];
  foreignKeys?: SchemaForeignKey[];
};

export type SchemaDocument = {
  tables: SchemaTable[];
};

export type DatabaseMetadata = {
  databaseType: DatabaseType;
  databaseName: string;
  capturedAt: string;
  summary: {
    tableCount: number;
    columnCount: number;
    foreignKeyCount: number;
  };
  schema: SchemaDocument;
};

export type ExecuteSqlRequest = {
  sql?: string;
};
