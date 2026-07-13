import type { DocumentParserAdapter, SourceConnector } from "./types";

export class AdapterRegistry<T extends { readonly type?: string; readonly id?: string }> {
  private adapters = new Map<string, T>();

  register(adapter: T) {
    const key = adapter.type ?? adapter.id;
    if (!key) throw new Error("Adapter must expose a type or id.");
    if (this.adapters.has(key)) throw new Error(`Adapter already registered: ${key}`);
    this.adapters.set(key, adapter);
    return this;
  }

  get(key: string) { return this.adapters.get(key); }
  list() { return Array.from(this.adapters.values()); }
}

export const sourceConnectorRegistry = new AdapterRegistry<SourceConnector>();
export const documentParserRegistry = new AdapterRegistry<DocumentParserAdapter>();
