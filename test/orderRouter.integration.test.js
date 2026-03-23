const { makeTestApp } = require("./test_utils/mocked_imports");

describe("order routes metrics", () => {
  let request;
  let app;
  let deps;

  beforeEach(() => {
    ({ request, app, deps } = makeTestApp());
    deps.db.isLoggedIn.mockResolvedValue(true);
    // Default JWT payload for authenticated diner
    deps.jwt.verify.mockReturnValue({
      id: 10,
      name: "pizza diner",
      email: "d@jwt.com",
      roles: [{ role: "diner" }],
    });

    // Mock factory service fetch
    deps.fetchImpl.mockReset();
  });

  test("successful POST /api/order records pizza creation success metrics with revenue and attributes", async () => {
    // Arrange DB behavior
    deps.db.addDinerOrder.mockResolvedValueOnce({
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
    deps.fetchImpl.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        reportUrl: "http://factory/report/1",
        jwt: "factory.jwt",
      }),
    });

    // Act
    const res = await request(app)
      .post("/api/order")
      .set("Authorization", "Bearer tok.sig.sgn")
      .send(orderBody);

    // Assert HTTP behavior
    expect(res.status).toBe(200);
    expect(deps.db.addDinerOrder).toHaveBeenCalledTimes(1);
    expect(deps.logger.log).toHaveBeenCalledWith(
      "info",
      "factory-request",
      expect.objectContaining({
        factoryUrl: expect.stringContaining("/api/order"),
        factoryRequestBody: expect.objectContaining({
          diner: expect.objectContaining({ id: 10 }),
        }),
      }),
    );
    expect(deps.logger.log).toHaveBeenCalledWith(
      "info",
      "factory-response",
      expect.objectContaining({
        ok: true,
        factoryResponseBody: expect.objectContaining({
          reportUrl: "http://factory/report/1",
        }),
      }),
    );

    // Assert metrics
    expect(deps.metricsManager.trackPizzaCreationSuccess).toHaveBeenCalledTimes(
      1,
    );
    expect(deps.metricsManager.trackPizzaCreationLatency).toHaveBeenCalledTimes(
      1,
    );
    expect(
      deps.metricsManager.trackPizzaCreationFailure,
    ).not.toHaveBeenCalled();

    const successArgs =
      deps.metricsManager.trackPizzaCreationSuccess.mock.calls[0][0];
    expect(successArgs.pizzasCount).toBe(2);
    expect(successArgs.revenue).toBeCloseTo(0.15);
    expect(successArgs.franchiseId).toBe(1);
    expect(successArgs.storeId).toBe(2);
    expect(successArgs.dinerId).toBe(10);

    const latencyArgs =
      deps.metricsManager.trackPizzaCreationLatency.mock.calls[0];
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
    deps.db.addDinerOrder.mockResolvedValueOnce({
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
    deps.fetchImpl.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ reportUrl: "http://factory/report/error" }),
    });

    const res = await request(app)
      .post("/api/order")
      .set("Authorization", "Bearer tok.sig.sgn")
      .send(orderBody);

    expect(res.status).toBe(500);
    expect(deps.logger.log).toHaveBeenCalledWith(
      "info",
      "factory-request",
      expect.objectContaining({
        factoryUrl: expect.stringContaining("/api/order"),
      }),
    );
    expect(deps.logger.log).toHaveBeenCalledWith(
      "error",
      "factory-response",
      expect.objectContaining({
        ok: false,
        statusCode: 500,
      }),
    );

    expect(deps.metricsManager.trackPizzaCreationFailure).toHaveBeenCalledTimes(
      1,
    );
    expect(deps.metricsManager.trackPizzaCreationLatency).toHaveBeenCalledTimes(
      1,
    );
    expect(
      deps.metricsManager.trackPizzaCreationSuccess,
    ).not.toHaveBeenCalled();

    const failureArgs =
      deps.metricsManager.trackPizzaCreationFailure.mock.calls[0][0];
    expect(failureArgs).toMatchObject({
      franchiseId: 3,
      storeId: 4,
      dinerId: 10,
      reason: "factory_error",
    });

    const latencyArgs =
      deps.metricsManager.trackPizzaCreationLatency.mock.calls[0];
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
