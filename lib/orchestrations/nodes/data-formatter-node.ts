import type { DataFormatterNodeConfig } from "@/shared/orchestrationTypes";
import { resolveVariablePath, setVariablePath } from "../expression-evaluator";

function displayValue(value: unknown, nullText: string): string {
  if (value === null || value === undefined) return nullText;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function resolveCell(row: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[segment];
  }, row);
}

function normalizeRows(input: unknown, maxRows: number): Array<Record<string, unknown>> {
  const values = Array.isArray(input) ? input : input && typeof input === "object" ? [input] : [];
  return values
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    .slice(0, maxRows);
}

function resolveColumns(rows: Array<Record<string, unknown>>, configured?: string[]): string[] {
  const selected = (configured || []).map((value) => value.trim()).filter(Boolean);
  return selected.length > 0
    ? selected
    : Array.from(new Set(rows.slice(0, 25).flatMap((row) => Object.keys(row))));
}

function columnLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatHtmlTable(
  rows: Array<Record<string, unknown>>,
  columns: string[],
  nullText: string,
  emptyText: string
): string {
  if (rows.length === 0) return `<p>${escapeHtml(emptyText)}</p>`;
  const header = columns
    .map((column) => `<th style="border:1px solid #cbd5e1;padding:8px;text-align:left;background:#f1f5f9;">${escapeHtml(columnLabel(column))}</th>`)
    .join("");
  const body = rows.map((row) => (
    `<tr>${columns.map((column) => (
      `<td style="border:1px solid #cbd5e1;padding:8px;vertical-align:top;">${escapeHtml(displayValue(resolveCell(row, column), nullText))}</td>`
    )).join("")}</tr>`
  )).join("");
  return `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function formatPlainTextTable(
  rows: Array<Record<string, unknown>>,
  columns: string[],
  nullText: string,
  emptyText: string
): string {
  if (rows.length === 0) return emptyText;
  const matrix = [
    columns.map(columnLabel),
    ...rows.map((row) => columns.map((column) => displayValue(resolveCell(row, column), nullText))),
  ];
  const widths = columns.map((_, index) => Math.min(60, Math.max(...matrix.map((row) => row[index]?.length || 0))));
  const render = (row: string[]) => row.map((value, index) => value.slice(0, widths[index]).padEnd(widths[index])).join(" | ");
  return [
    render(matrix[0]),
    widths.map((width) => "-".repeat(width)).join("-+-"),
    ...matrix.slice(1).map(render),
  ].join("\n");
}

function formatCsv(
  rows: Array<Record<string, unknown>>,
  columns: string[],
  nullText: string,
  emptyText: string
): string {
  if (rows.length === 0) return emptyText;
  return [
    columns.map((column) => escapeCsv(columnLabel(column))).join(","),
    ...rows.map((row) => columns
      .map((column) => escapeCsv(displayValue(resolveCell(row, column), nullText)))
      .join(",")),
  ].join("\r\n");
}

export async function executeDataFormatterNode(
  config: DataFormatterNodeConfig,
  context: Record<string, unknown>
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
  try {
    const inputPath = String(config.inputVariablePath || "").trim();
    const outputVariable = String(config.outputVariable || "formattedData").trim();
    if (!inputPath) throw new Error("Data Formatter input variable path is required");
    if (!outputVariable) throw new Error("Data Formatter output variable is required");

    const input = resolveVariablePath(inputPath, context);
    const emptyText = config.emptyText ?? "No data available.";
    const nullText = config.nullText ?? "";
    const maxRows = Math.max(1, Math.min(1000, Math.floor(Number(config.maxRows) || 100)));
    const rows = normalizeRows(input, maxRows);
    const columns = resolveColumns(rows, config.columns);
    let formatted: string;

    switch (config.format || "pretty_json") {
      case "html_table":
        formatted = formatHtmlTable(rows, columns, nullText, emptyText);
        break;
      case "plain_text_table":
        formatted = formatPlainTextTable(rows, columns, nullText, emptyText);
        break;
      case "csv":
        formatted = formatCsv(rows, columns, nullText, emptyText);
        break;
      case "key_value": {
        const record = rows[0];
        formatted = record
          ? Object.entries(record).map(([key, value]) => `${columnLabel(key)}: ${displayValue(value, nullText)}`).join("\n")
          : emptyText;
        break;
      }
      case "custom_template": {
        const template = String(config.customTemplate || "{{json}}");
        formatted = template
          .replaceAll("{{json}}", JSON.stringify(input ?? null, null, 2))
          .replaceAll("{{value}}", displayValue(input, nullText))
          .replaceAll("{{rowCount}}", String(rows.length));
        break;
      }
      case "pretty_json":
      default:
        formatted = input === undefined || input === null
          ? emptyText
          : JSON.stringify(input, null, 2);
        break;
    }

    const output: Record<string, unknown> = {};
    setVariablePath(outputVariable, formatted, output);
    setVariablePath(`${outputVariable}Meta`, {
      format: config.format || "pretty_json",
      inputVariablePath: inputPath,
      rowCount: rows.length,
      columns,
      truncated: Array.isArray(input) && input.length > maxRows,
    }, output);
    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to format data",
    };
  }
}
