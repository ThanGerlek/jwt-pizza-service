import { safeSerialize } from "./util.ts";

const REDACTED = "*****";
const SENSITIVE_KEY_PATTERN =
  /pass|password|authorization|api[-_]?key|token|jwt|cookie|secret|session/i;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

function redactValueByKey(key: string, value: unknown): unknown {
  if (!isSensitiveKey(key)) {
    return value;
  }

  if (typeof value === "string" && key.toLowerCase() === "authorization") {
    const [scheme] = value.split(" ");
    return scheme ? `${scheme} ${REDACTED}` : REDACTED;
  }

  return REDACTED;
}

function sanitizeObjectForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeObjectForLog(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(record)) {
    const redacted = redactValueByKey(key, nestedValue);
    if (redacted === REDACTED || redacted === nestedValue) {
      sanitized[key] =
        redacted === REDACTED ? REDACTED : sanitizeObjectForLog(nestedValue);
    } else {
      sanitized[key] = redacted;
    }
  }

  return sanitized;
}

function sanitizeSerializedString(serialized: string): string {
  return serialized
    .replace(/"(authorization)"\s*:\s*"([^"]*)"/gi, (_match, key, value) => {
      const [scheme] = String(value).split(" ");
      return `"${key}":"${scheme ? `${scheme} ${REDACTED}` : REDACTED}"`;
    })
    .replace(
      /"(password|apiKey|api_key|token|jwt|cookie|secret|session)"\s*:\s*"[^"]*"/gi,
      (_match, key) => `"${key}":"${REDACTED}"`,
    );
}

export function sanitizeForLog(logData: unknown): string {
  const sanitized = sanitizeObjectForLog(logData);
  return sanitizeSerializedString(safeSerialize(sanitized));
}
