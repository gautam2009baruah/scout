export type SafeDatabaseError = {
  message: string;
  statusCode: 400 | 409;
};

function postgresCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return String(error.code || "");
}

export function mapDatabaseInputError(error: unknown): SafeDatabaseError | null {
  switch (postgresCode(error)) {
    case "22001":
      return { message: "One or more values exceed the allowed length.", statusCode: 400 };
    case "22003":
      return { message: "One or more numeric values are outside the allowed range.", statusCode: 400 };
    case "23514":
      return { message: "One or more values violate an input constraint.", statusCode: 400 };
    case "23505":
      return { message: "A record with these values already exists.", statusCode: 409 };
    default:
      return null;
  }
}
