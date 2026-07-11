// Cron Utilities
// Schedule calculation and cron expression generation
// Shared between node-cron and Bull Queue implementations

import type { ScheduleTriggerConfig } from "@/shared/orchestrationTypes";

/**
 * Validate cron expression format
 * Format: minute hour day month weekday
 * Example: "0 9 * * 1" = Every Monday at 9:00 AM
 */
export function validateCronExpression(expression: string): { valid: boolean; error?: string } {
  const parts = expression.trim().split(/\s+/);
  
  if (parts.length !== 5) {
    return { valid: false, error: "Cron expression must have 5 parts: minute hour day month weekday" };
  }

  const [minute, hour, day, month, weekday] = parts;

  // Validate minute (0-59)
  if (!isValidCronField(minute, 0, 59)) {
    return { valid: false, error: "Invalid minute value (must be 0-59 or * or */n)" };
  }

  // Validate hour (0-23)
  if (!isValidCronField(hour, 0, 23)) {
    return { valid: false, error: "Invalid hour value (must be 0-23 or * or */n)" };
  }

  // Validate day (1-31)
  if (!isValidCronField(day, 1, 31)) {
    return { valid: false, error: "Invalid day value (must be 1-31 or * or */n)" };
  }

  // Validate month (1-12)
  if (!isValidCronField(month, 1, 12)) {
    return { valid: false, error: "Invalid month value (must be 1-12 or * or */n)" };
  }

  // Validate weekday (0-6)
  if (!isValidCronField(weekday, 0, 6)) {
    return { valid: false, error: "Invalid weekday value (must be 0-6 or * or */n)" };
  }

  return { valid: true };
}

function isValidCronField(field: string, min: number, max: number): boolean {
  // Allow * and */n patterns
  if (field === "*") return true;
  if (/^\*\/\d+$/.test(field)) {
    const step = parseInt(field.split("/")[1]);
    return step >= 1 && step <= max;
  }

  // Allow ranges (e.g., 1-5)
  if (field.includes("-")) {
    const [start, end] = field.split("-").map(Number);
    return start >= min && end <= max && start < end;
  }

  // Allow lists (e.g., 1,3,5)
  if (field.includes(",")) {
    const values = field.split(",").map(Number);
    return values.every((v) => v >= min && v <= max);
  }

  // Single number
  const num = parseInt(field);
  return !isNaN(num) && num >= min && num <= max;
}

/**
 * Convert ScheduleTriggerConfig to cron expression
 * Handles daily, weekly, monthly, one-time, and custom cron schedules
 */
export function configToCronExpression(config: ScheduleTriggerConfig): string {
  // If custom cron expression provided, use it
  if (config.scheduleType === "cron" && config.cronExpression) {
    return config.cronExpression;
  }

  // Parse time (default to midnight if not provided)
  const time = config.specificTimeUtc || config.specificTime || "00:00";
  const [hour, minute] = time.split(":").map(Number);

  switch (config.scheduleType) {
    case "daily":
      // Every day at specified time
      return `${minute} ${hour} * * *`;

    case "weekly":
      // Every week on specified day at specified time
      const dayOfWeek = config.dayOfWeek ?? 0; // Default to Sunday
      return `${minute} ${hour} * * ${dayOfWeek}`;

    case "monthly":
      // Every month on specified day at specified time
      const dayOfMonth = config.dayOfMonth ?? 1; // Default to 1st
      return `${minute} ${hour} ${dayOfMonth} * *`;

    case "one-time":
      // One-time schedules can't be represented as cron expressions
      // These need special handling in the scheduler
      throw new Error("One-time schedules cannot be converted to cron expressions");

    default:
      throw new Error(`Unknown schedule type: ${config.scheduleType}`);
  }
}

/**
 * Calculate next run time for a schedule
 * Returns ISO timestamp string
 */
export function calculateNextRunTime(config: ScheduleTriggerConfig, fromDate: Date = new Date()): string | null {
  // Handle one-time schedules
  if (config.scheduleType === "one-time") {
    if (!config.oneTimeDate) {
      return null;
    }
    const oneTimeDate = new Date(config.oneTimeDate);
    // Only return if it's in the future
    return oneTimeDate > fromDate ? oneTimeDate.toISOString() : null;
  }

  // For recurring schedules, use cron expression to calculate
  try {
    const cronExpression = configToCronExpression(config);
    return calculateNextCronRun(cronExpression, fromDate, config.timezone);
  } catch (error) {
    console.error("Error calculating next run time:", error);
    return null;
  }
}

/**
 * Calculate next run time from cron expression
 * This is a simplified implementation - node-cron handles this internally
 * For Bull Queue, we'd use a library like 'cron-parser'
 */
function calculateNextCronRun(cronExpression: string, fromDate: Date, timezone: string = "UTC"): string {
  // Parse cron expression
  const [minute, hour, day, month, weekday] = cronExpression.split(/\s+/);

  // Start from the next minute
  const next = new Date(fromDate);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  // Find next matching time (simplified - doesn't handle all cron features)
  // In production, use a library like 'cron-parser' for accurate calculation
  
  // For simple cases, calculate next occurrence
  if (minute !== "*" && hour !== "*") {
    const targetMinute = parseInt(minute);
    const targetHour = parseInt(hour);
    
    next.setMinutes(targetMinute);
    next.setHours(targetHour);
    
    // If we've passed today's time, move to tomorrow (simplified)
    if (next <= fromDate) {
      next.setDate(next.getDate() + 1);
    }
  }

  return next.toISOString();
}

/**
 * Check if schedule is currently active (within start/end date range)
 */
export function isScheduleActive(config: ScheduleTriggerConfig, now: Date = new Date()): boolean {
  // Check if schedule is enabled
  if (!config.enabled) {
    return false;
  }

  // Check start date
  if (config.startDate) {
    const startDate = new Date(config.startDate);
    if (now < startDate) {
      return false;
    }
  }

  // Check end date
  if (config.endDate) {
    const endDate = new Date(config.endDate);
    if (now > endDate) {
      return false;
    }
  }

  return true;
}

/**
 * Get human-readable description of schedule
 */
export function getScheduleDescription(config: ScheduleTriggerConfig): string {
  switch (config.scheduleType) {
    case "daily":
      return `Daily at ${config.specificTimeUtc || config.specificTime || "00:00"} UTC`;
    
    case "weekly":
      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayName = days[config.dayOfWeek ?? 0];
      return `Every ${dayName} at ${config.specificTimeUtc || config.specificTime || "00:00"} UTC`;
    
    case "monthly":
      const dayOfMonth = config.dayOfMonth ?? 1;
      const suffix = getDaySuffix(dayOfMonth);
      return `Monthly on ${dayOfMonth}${suffix} at ${config.specificTimeUtc || config.specificTime || "00:00"} UTC`;
    
    case "one-time":
      if (config.oneTimeDate) {
        const date = new Date(config.oneTimeDate);
        return `Once on ${date.toLocaleDateString()} at ${date.toLocaleTimeString()}`;
      }
      return "One-time (date not set)";
    
    case "cron":
      return `Custom: ${config.cronExpression || "not set"}`;
    
    default:
      return "Unknown schedule";
  }
}

function getDaySuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}
