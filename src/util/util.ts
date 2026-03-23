export function safeSerialize(value: unknown): string {
  const maxChars = 12_000;
  const seen = new WeakSet();

  const serialized = JSON.stringify(value, (_key, currentValue) => {
    if (Buffer.isBuffer(currentValue)) {
      return `<Buffer length=${currentValue.length}>`;
    }

    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }

    if (currentValue !== null && typeof currentValue === "object") {
      if (seen.has(currentValue)) {
        return "[Circular]";
      }
      seen.add(currentValue);
    }

    return currentValue;
  });

  if (serialized === undefined) {
    return '"[Unserializable]"';
  }

  if (serialized.length > maxChars) {
    return `${serialized.slice(0, maxChars)}...[truncated]`;
  }

  return serialized;
}
