import { sanitizeFactoryReportUrl } from "../src/util/factoryUrl.ts";

describe("sanitizeFactoryReportUrl", () => {
  const factoryUrl = "https://pizza-factory.example.com/api";

  test("allows https URL on factory host", () => {
    expect(
      sanitizeFactoryReportUrl(
        "https://pizza-factory.example.com/report/1",
        factoryUrl,
        "",
      ),
    ).toBe("https://pizza-factory.example.com/report/1");
  });

  test("rejects http", () => {
    expect(
      sanitizeFactoryReportUrl(
        "http://pizza-factory.example.com/x",
        factoryUrl,
        "",
      ),
    ).toBeNull();
  });

  test("rejects other hosts unless allowlisted", () => {
    expect(
      sanitizeFactoryReportUrl("https://evil.com/phish", factoryUrl, ""),
    ).toBeNull();
  });

  test("allows extra host from allowlist", () => {
    expect(
      sanitizeFactoryReportUrl(
        "https://reports.trusted.example/path",
        factoryUrl,
        "reports.trusted.example",
      ),
    ).toBe("https://reports.trusted.example/path");
  });

  test("rejects non-strings", () => {
    expect(sanitizeFactoryReportUrl(null, factoryUrl, "")).toBeNull();
  });
});
