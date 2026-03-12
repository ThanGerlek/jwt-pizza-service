import type { Config } from "jest";

jest.useFakeTimers();

jest.mock("../src/config.js", () => ({
  __esModule: true,
  default: {
    metrics: {
      endpointUrl: "http://metrics-endpoint",
      apiKey: "test-api-key",
      accountId: "test-account-id",
      flushIntervalMs: 1_000,
      maxBatchSize: 1_000,
    },
  },
}));

describe("metrics module", () => {
  let startMetrics: () => void;
  let stopMetrics: () => void;
  let requestTracker: (
    req: { method: string; path: string },
    res: unknown,
    next: () => void,
  ) => void;

  beforeEach(async () => {
    jest.resetModules();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });

    // Require after mocks so config and fetch are intercepted correctly.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const metrics =
      require("../src/metrics") as typeof import("../src/metrics");
    startMetrics = metrics.startMetrics;
    stopMetrics = metrics.stopMetrics;
    requestTracker = metrics.requestTracker;
  });

  afterEach(() => {
    stopMetrics();
    jest.clearAllTimers();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = undefined;
  });

  test("startMetrics schedules periodic trackers and flushes batches", () => {
    startMetrics();

    // Advance time enough for at least one flush interval.
    jest.advanceTimersByTime(1_100);

    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("push-style HTTP request metrics are batched and sent on stopMetrics", async () => {
    const next = jest.fn();

    requestTracker({ method: "GET", path: "/api/test" }, {}, next);
    expect(next).toHaveBeenCalled();

    // Stopping metrics should flush any queued metrics once.
    stopMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);

    const metricNames = body.resourceMetrics[0].scopeMetrics[0].metrics.map(
      (m: { name: string }) => m.name,
    );

    expect(metricNames).toContain("http_requests_total");
  });
});
