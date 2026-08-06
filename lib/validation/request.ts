export const REQUEST_BODY_LIMITS = {
  chatbotJson: 256 * 1024,
  adminJson: 1024 * 1024,
} as const;

export class RequestValidationError extends Error {
  constructor(message: string, public readonly statusCode: 400 | 413) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestValidationError(`Request body must be ${maxBytes} bytes or fewer.`, 413);
  }

  if (!request.body) {
    throw new RequestValidationError("A JSON request body is required.", 400);
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestValidationError(`Request body must be ${maxBytes} bytes or fewer.`, 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as T;
  } catch {
    throw new RequestValidationError("Invalid JSON body.", 400);
  }
}
