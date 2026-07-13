export type DocumentNodeType = "document" | "heading" | "section" | "paragraph" | "table" | "list" | "code" | "image" | "page" | "slide" | "sheet";

export type DocumentNode = {
  id: string;
  type: DocumentNodeType;
  text?: string;
  level?: number;
  pageNumber?: number;
  attributes?: Record<string, unknown>;
  children?: DocumentNode[];
};

export type UnifiedDocument = {
  id?: string;
  source: {
    connectorType: string;
    sourceId: string;
    sourceUrl?: string;
    parentSourceId?: string;
    version?: string;
  };
  contentType: string;
  title: string;
  text: string;
  metadata: {
    author?: string;
    createdAt?: string;
    modifiedAt?: string;
    language?: string;
    checksum?: string;
    custom: Record<string, unknown>;
  };
  nodes: DocumentNode[];
  warnings: Array<{ code: string; message: string; recoverable: boolean }>;
};

export type SourceItem = {
  id: string;
  name: string;
  mimeType?: string;
  url?: string;
  modifiedAt?: string;
  etag?: string;
  metadata?: Record<string, unknown>;
};

export interface SourceConnector<TConfig = Record<string, unknown>> {
  readonly type: string;
  validate(config: TConfig): Promise<void>;
  list(config: TConfig, cursor?: string): AsyncIterable<SourceItem>;
  fetch(item: SourceItem): Promise<{ bytes: Buffer; item: SourceItem }>;
}

export interface DocumentParserAdapter {
  readonly id: string;
  supports(input: { fileType: string; mimeType?: string }): boolean;
  parse(input: { bytes: Buffer; fileType: string; filename?: string; sourceUrl?: string }): Promise<UnifiedDocument>;
}
