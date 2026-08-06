// Application-level limits that mirror bounded database columns or establish
// safe operational bounds for otherwise-unbounded text fields.
export const INPUT_LIMITS = {
  companyName: 200,
  companySlug: 100,
  roleName: 200,
  roleDescription: 2000,
  targetApplicationName: 200,
  personName: 200,
  emailAddress: 320,
  employeeCode: 100,
  phoneNumber: 50,
  resourceName: 200,
  resourceTitle: 200,
  description: 5_000,
  shortDescription: 2_000,
  slug: 100,
  filename: 255,
  endpointUrl: 2_048,
  richText: 100_000,
  structuredItems: 1_000,
  structuredJsonBytes: 1024 * 1024,
  environmentName: 32,
  environmentUrl: 2048,
  chatbotEmbedUserId: 255,
  chatbotAssistantName: 255,
  chatbotExternalUserId: 255,
  chatbotMessage: 10_000,
  chatbotFeedbackReason: 2_000,
  chatbotHistoryItems: 12,
  chatbotMetadataBytes: 64 * 1024,
  internalNotificationTitle: 500,
  internalNotificationType: 50,
  internalNotificationActionLabel: 255,
} as const;

export class InputValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

export function exceedsCharacterLimit(value: string, maxCharacters: number): boolean {
  return Array.from(value).length > maxCharacters;
}

export function assertCharacterLimit(value: string, maxCharacters: number, fieldName: string): void {
  if (exceedsCharacterLimit(value, maxCharacters)) {
    throw new InputValidationError(`${fieldName} must be ${maxCharacters} characters or fewer.`);
  }
}

export function assertArrayLimit(value: readonly unknown[], maxItems: number, fieldName: string): void {
  if (value.length > maxItems) {
    throw new InputValidationError(`${fieldName} must contain ${maxItems} items or fewer.`);
  }
}

export function assertSerializedByteLimit(value: unknown, maxBytes: number, fieldName: string): void {
  const bytes = new TextEncoder().encode(JSON.stringify(value ?? null)).byteLength;
  if (bytes > maxBytes) {
    throw new InputValidationError(`${fieldName} must be ${maxBytes} bytes or fewer.`);
  }
}
