/**
 * Allow only https report URLs whose host matches the factory API host or an optional allowlist.
 */
export function sanitizeFactoryReportUrl(
  reportUrl: unknown,
  factoryBaseUrl: string,
  extraAllowlist: string,
): string | null {
  if (reportUrl == null || typeof reportUrl !== "string") {
    return null;
  }
  let factoryHost: string;
  try {
    factoryHost = new URL(factoryBaseUrl).hostname;
  } catch {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(reportUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") {
    return null;
  }
  const allowed = new Set<string>([factoryHost]);
  for (const h of extraAllowlist.split(",").map((s) => s.trim())) {
    if (h) {
      allowed.add(h);
    }
  }
  if (!allowed.has(parsed.hostname)) {
    return null;
  }
  return reportUrl;
}
