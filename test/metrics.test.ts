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
  let trackAuthAttempt: (success: boolean) => void;
  let trackPizzaCreationSuccess: (details: {
    pizzasCount: number;
    revenue: number;
    franchiseId?: number | string;
    storeId?: number | string;
    dinerId?: number | string;
  }) => void;
  let trackPizzaCreationFailure: (details: {
    franchiseId?: number | string;
    storeId?: number | string;
    dinerId?: number | string;
    reason?: string;
  }) => void;

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
    trackAuthAttempt = metrics.trackAuthAttempt;
    trackPizzaCreationSuccess = metrics.trackPizzaCreationSuccess;
    trackPizzaCreationFailure = metrics.trackPizzaCreationFailure;
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

  test("trackAuthAttempt(true) records auth_attempts_total with outcome success in flushed payload", () => {
    trackAuthAttempt(true);
    stopMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;

    const authMetric = metrics.find(
      (m: { name: string }) => m.name === "auth_attempts_total",
    );
    expect(authMetric).toBeDefined();
    const attributes = authMetric.sum?.dataPoints?.[0]?.attributes ?? [];
    const outcomeAttr = attributes.find(
      (a: { key: string }) => a.key === "outcome",
    );
    expect(outcomeAttr?.value?.stringValue).toBe("success");
  });

  test("trackAuthAttempt(false) records auth_attempts_total with outcome failure in flushed payload", () => {
    trackAuthAttempt(false);
    stopMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;

    const authMetric = metrics.find(
      (m: { name: string }) => m.name === "auth_attempts_total",
    );
    expect(authMetric).toBeDefined();
    const attributes = authMetric.sum?.dataPoints?.[0]?.attributes ?? [];
    const outcomeAttr = attributes.find(
      (a: { key: string }) => a.key === "outcome",
    );
    expect(outcomeAttr?.value?.stringValue).toBe("failure");
  });

  test("trackPizzaCreationSuccess records pizzas, revenue, and attributes", () => {
    trackPizzaCreationSuccess({
      pizzasCount: 2,
      revenue: 0.0075,
      franchiseId: 1,
      storeId: 3,
      dinerId: 42,
    });
    stopMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;

    const creationsMetric = metrics.find(
      (m: { name: string }) => m.name === "pizza_creations_total",
    );
    const revenueMetric = metrics.find(
      (m: { name: string }) => m.name === "pizza_revenue_total",
    );
    const pizzasSoldMetric = metrics.find(
      (m: { name: string }) => m.name === "pizzas_sold_total",
    );

    expect(creationsMetric).toBeDefined();
    expect(revenueMetric).toBeDefined();
    expect(pizzasSoldMetric).toBeDefined();

    const revenuePoint = revenueMetric.sum?.dataPoints?.[0];
    const pizzasPoint = pizzasSoldMetric.sum?.dataPoints?.[0];

    expect(revenuePoint?.asInt ?? revenuePoint?.asDouble).toBeCloseTo(0.0075);
    expect(pizzasPoint?.asInt ?? pizzasPoint?.asDouble).toBe(2);

    const attrs = creationsMetric.sum?.dataPoints?.[0]?.attributes ?? [];
    const franchiseAttr = attrs.find(
      (a: { key: string }) => a.key === "franchiseId",
    );
    const storeAttr = attrs.find((a: { key: string }) => a.key === "storeId");

    expect(franchiseAttr?.value?.stringValue).toBe("1");
    expect(storeAttr?.value?.stringValue).toBe("3");
  });

  test("trackPizzaCreationFailure records failure metric with attributes", () => {
    trackPizzaCreationFailure({
      franchiseId: 2,
      storeId: 4,
      dinerId: 99,
      reason: "factory_error",
    });
    stopMetrics();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(options.body);
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;

    const failureMetric = metrics.find(
      (m: { name: string }) => m.name === "pizza_creation_failures_total",
    );
    expect(failureMetric).toBeDefined();

    const attrs = failureMetric.sum?.dataPoints?.[0]?.attributes ?? [];
    const franchiseAttr = attrs.find(
      (a: { key: string }) => a.key === "franchiseId",
    );
    const storeAttr = attrs.find((a: { key: string }) => a.key === "storeId");
    const reasonAttr = attrs.find((a: { key: string }) => a.key === "reason");

    expect(franchiseAttr?.value?.stringValue).toBe("2");
    expect(storeAttr?.value?.stringValue).toBe("4");
    expect(reasonAttr?.value?.stringValue).toBe("factory_error");
  });
});
