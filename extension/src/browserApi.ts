declare const chrome: any;

type MessageHandler = (message: unknown, sender: unknown) => unknown;

const runtime = chrome?.runtime;
const storage = chrome?.storage;

export const browserApi = {
  sendMessage(message: unknown) {
    return runtime?.sendMessage?.(message);
  },

  onMessage(handler: MessageHandler) {
    runtime?.onMessage?.addListener?.((message: unknown, sender: unknown, sendResponse: (response?: unknown) => void) => {
      Promise.resolve(handler(message, sender))
        .then((result) => sendResponse(result))
        .catch(() => sendResponse(undefined));
      return true;
    });
  },

  async getStorage<T>(keys: string[] | Record<string, unknown>) {
    return new Promise<T>((resolve) => {
      storage?.local?.get?.(keys, (value: T) => resolve(value));
    });
  },

  async setStorage(value: Record<string, unknown>) {
    return new Promise<void>((resolve) => {
      storage?.local?.set?.(value, () => resolve());
    });
  },

  onStorageChanged(handler: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void) {
    storage?.onChanged?.addListener?.(handler);
  },

  offStorageChanged(handler: (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>) => void) {
    storage?.onChanged?.removeListener?.(handler);
  }
};
