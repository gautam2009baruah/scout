declare const chrome: any;

type MessageHandler = (message: unknown, sender: unknown) => void | Promise<void>;

const runtime = chrome?.runtime;
const storage = chrome?.storage;

export const browserApi = {
  sendMessage(message: unknown) {
    return runtime?.sendMessage?.(message);
  },

  onMessage(handler: MessageHandler) {
    runtime?.onMessage?.addListener?.((message: unknown, sender: unknown) => {
      void handler(message, sender);
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
  }
};
