jest.mock("../src/metrics.ts", () => {
  const passThroughMiddleware = (req, res, next) => next();
  return {
    activeUserTracker: passThroughMiddleware,
    requestTracker: passThroughMiddleware,
    requestLatencyTracker: passThroughMiddleware,
    startMetrics: jest.fn(),
    stopMetrics: jest.fn(),
    recordCount: jest.fn(),
    recordValue: jest.fn(),
    trackPizzaCreationSuccess: jest.fn(),
    trackPizzaCreationFailure: jest.fn(),
    trackPizzaCreationLatency: jest.fn(),
  };
});

const {
  trackPizzaCreationSuccess,
  trackPizzaCreationFailure,
  trackPizzaCreationLatency,
  stopMetrics,
} = require("../src/metrics");

const { setupMocks } = require("./test_utils/mocked_imports");
const { request, app, DB, jwt } = setupMocks();

describe("order routes metrics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DB.isLoggedIn.mockResolvedValue(true);
    // Default JWT payload for authenticated diner
    jwt.verify.mockReturnValue({
      id: 10,
      name: "pizza diner",
      email: "d@jwt.com",
      roles: [{ role: "diner" }],
    });

    // Mock factory service fetch
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = undefined;
  });

  afterAll(() => {
    stopMetrics();
  });

  test("successful POST /api/order records pizza creation success metrics with revenue and attributes", async () => {
    // Arrange DB behavior
    DB.addDinerOrder.mockResolvedValueOnce({
      id: 1,
      franchiseId: 1,
      storeId: 2,
      items: [
        { menuId: 1, description: "Veggie", price: 0.05 },
        { menuId: 2, description: "Pepperoni", price: 0.1 },
      ],
    });

    const orderBody = {
      franchiseId: 1,
      storeId: 2,
      items: [
        { menuId: 1, description: "Veggie", price: 0.05 },
        { menuId: 2, description: "Pepperoni", price: 0.1 },
      ],
    };

    // Factory responds successfully
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reportUrl: "http://factory/report/1",
        jwt: "factory.jwt",
      }),
    });

    // Mock logger fetch call (to Grafana)
    global.fetch.mockResolvedValueOnce({
      ok: true,
    });

    // Act
    const res = await request(app)
      .post("/api/order")
      .set("Authorization", "Bearer tok.sig.sgn")
      .send(orderBody);

    // Assert HTTP behavior
    expect(res.status).toBe(200);
    expect(DB.addDinerOrder).toHaveBeenCalledTimes(1);

    // Assert metrics
    expect(trackPizzaCreationSuccess).toHaveBeenCalledTimes(1);
    expect(trackPizzaCreationLatency).toHaveBeenCalledTimes(1);
    expect(trackPizzaCreationFailure).not.toHaveBeenCalled();

    const successArgs = trackPizzaCreationSuccess.mock.calls[0][0];
    expect(successArgs.pizzasCount).toBe(2);
    expect(successArgs.revenue).toBeCloseTo(0.15);
    expect(successArgs.franchiseId).toBe(1);
    expect(successArgs.storeId).toBe(2);
    expect(successArgs.dinerId).toBe(10);

    const latencyArgs = trackPizzaCreationLatency.mock.calls[0];
    expect(latencyArgs[0]).toBe("success");
    // latencyArgs[1] is durationMs – just assert it is a positive number
    expect(typeof latencyArgs[1]).toBe("number");
    expect(latencyArgs[1]).toBeGreaterThanOrEqual(0);
    expect(latencyArgs[2]).toMatchObject({
      franchiseId: 1,
      storeId: 2,
      dinerId: 10,
    });
  });

  test("failed factory call records pizza creation failure metrics and failure latency", async () => {
    DB.addDinerOrder.mockResolvedValueOnce({
      id: 2,
      franchiseId: 3,
      storeId: 4,
      items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
    });

    const orderBody = {
      franchiseId: 3,
      storeId: 4,
      items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
    };

    // Factory responds with error
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ reportUrl: "http://factory/report/error" }),
    });

    // Mock logger fetch call (to Grafana)
    global.fetch.mockResolvedValueOnce({
      ok: true,
    });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", "Bearer tok.sig.sgn")
      .send(orderBody);

    expect(res.status).toBe(500);

    expect(trackPizzaCreationFailure).toHaveBeenCalledTimes(1);
    expect(trackPizzaCreationLatency).toHaveBeenCalledTimes(1);
    expect(trackPizzaCreationSuccess).not.toHaveBeenCalled();

    const failureArgs = trackPizzaCreationFailure.mock.calls[0][0];
    expect(failureArgs).toMatchObject({
      franchiseId: 3,
      storeId: 4,
      dinerId: 10,
      reason: "factory_error",
    });

    const latencyArgs = trackPizzaCreationLatency.mock.calls[0];
    expect(latencyArgs[0]).toBe("failure");
    expect(typeof latencyArgs[1]).toBe("number");
    expect(latencyArgs[1]).toBeGreaterThanOrEqual(0);
    expect(latencyArgs[2]).toMatchObject({
      franchiseId: 3,
      storeId: 4,
      dinerId: 10,
    });
  });
});
