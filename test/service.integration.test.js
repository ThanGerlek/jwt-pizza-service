const { makeTestApp } = require("./test_utils/mocked_imports");

describe("Service Integration Tests - Edge Cases", () => {
  let request;
  let app;
  let deps;

  beforeEach(() => {
    ({ request, app, deps } = makeTestApp());
  });

  // ====================================================================
  // GET /api/docs - API Documentation
  // ====================================================================
  describe("GET /api/docs", () => {
    test("returns API documentation with version", async () => {
      const res = await request(app).get("/api/docs");

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("version");
      expect(res.body).toHaveProperty("endpoints");
      expect(res.body).toHaveProperty("config");
      expect(Array.isArray(res.body.endpoints)).toBe(true);
    });

    test("includes a random sample of router docs", async () => {
      const res = await request(app).get("/api/docs");

      expect(res.status).toBe(200);
      expect(res.body.endpoints.length).toBeGreaterThan(0);

      // Check for some expected endpoints from different routers
      const paths = res.body.endpoints.map((e) => e.path);
      expect(paths).toContain("/api/auth");
      expect(paths.some((p) => p.startsWith("/api/franchise"))).toBe(true);
      expect(paths.some((p) => p.startsWith("/api/order"))).toBe(true);
    });

    test("includes config and version info", async () => {
      const res = await request(app).get("/api/docs");

      expect(res.status).toBe(200);
      expect(res.body.config).toHaveProperty("factory");
      expect(res.body.config).toHaveProperty("db");
      expect(typeof res.body.version).toBe("string");
      expect(res.body.version.length).toBeGreaterThan(0);
    });
  });

  // ====================================================================
  // GET / - Welcome Message
  // ====================================================================
  describe("GET /", () => {
    test("returns welcome message with version", async () => {
      const res = await request(app).get("/");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        message: "welcome to JWT Pizza",
        version: expect.any(String),
      });
    });

    test("version matches docs version", async () => {
      const rootRes = await request(app).get("/");
      const docsRes = await request(app).get("/api/docs");

      expect(rootRes.body.version).toBe(docsRes.body.version);
    });

    test("returns JSON content type", async () => {
      const res = await request(app).get("/");

      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/json/);
    });
  });

  // ====================================================================
  // Unknown Endpoint - 404 Handler
  // ====================================================================

  describe("Unknown endpoint", () => {
    async function expect404Error(callFunc, endpoint) {
      const res = await callFunc(endpoint);
      expect(res.status).toBe(404);
      expect(res.body.message).toBe("unknown endpoint");
      expect(res.headers["content-type"]).toMatch(/json/);
    }

    const invalidEndpoints = [
      "/api/idonotexist",
      "/api/nonexistent/deeply/nested/path",
    ];

    test("returns 404 for all four methods and for short and long paths", async () => {
      const fetchFuncs = [
        request(app).get,
        request(app).post,
        request(app).put,
        request(app).delete,
      ];
      for (const fetchFunc of fetchFuncs) {
        for (const invalidEndpoint of invalidEndpoints) {
          await expect404Error(fetchFunc, invalidEndpoint);
        }
      }
    });
  });

  // ====================================================================
  // Error Handler - Global Error Handling
  // ====================================================================
  describe("Error handler", () => {
    test("returns and logs error when accessing a protected endpoint when logged out", async () => {
      // Trigger an error by trying to access a protected endpoint without proper auth
      deps.db.isLoggedIn.mockResolvedValueOnce(false);

      const res = await request(app)
        .get("/api/order")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send({ title: "x", description: "y", image: "z", price: 1 });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toBe("unauthorized");
      expect(deps.logger.log).toHaveBeenCalledWith(
        "warn",
        "auth-unauthorized",
        expect.objectContaining({
          method: "GET",
          path: "/api/order",
          statusCode: 401,
        }),
      );
    });

    test("returns and logs error when accessing an admin-only endpoint as a diner", async () => {
      // Trigger a route-level StatusCodeError in orderRouter by attempting to edit a menu as a diner
      deps.db.isLoggedIn.mockResolvedValueOnce(true);
      deps.jwt.verify.mockReturnValueOnce({
        id: 1,
        name: "diner",
        email: "d@jwt.com",
        roles: [{ role: "diner" }],
      });

      const res = await request(app)
        .put("/api/order/menu")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send({ title: "x", description: "y", image: "z", price: 1 });

      expect(res.status).toBe(403);
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toBe("unable to add menu item");
      expect(deps.logger.log).toHaveBeenCalledWith(
        "warn",
        "request-error",
        expect.objectContaining({
          method: "PUT",
          path: "/api/order/menu",
          statusCode: 403,
          error: expect.objectContaining({
            message: "unable to add menu item",
          }),
        }),
      );
      const requestErrorCall = deps.logger.log.mock.calls.find(
        (c) => c[1] === "request-error",
      );
      expect(requestErrorCall[2].error).not.toHaveProperty("stack");
    });

    test("includes error message in response", async () => {
      deps.db.isLoggedIn.mockResolvedValueOnce(false);

      const res = await request(app).delete("/api/auth");

      expect(res.status).toBe(401);
      expect(res.body.message).toBeTruthy();
      expect(typeof res.body.message).toBe("string");
    });

    test("logs request-error at error level with stack for 500 responses", async () => {
      deps.db.getMenu.mockRejectedValueOnce(new Error("db exploded"));

      const res = await request(app).get("/api/order/menu");

      expect(res.status).toBe(500);
      expect(deps.logger.log).toHaveBeenCalledWith(
        "error",
        "request-error",
        expect.objectContaining({
          method: "GET",
          path: "/api/order/menu",
          statusCode: 500,
          error: expect.objectContaining({
            message: "db exploded",
            stack: expect.any(String),
          }),
        }),
      );
    });
  });

  // ====================================================================
  // CORS Headers
  // ====================================================================
  describe("CORS headers", () => {
    test("sets CORS headers on requests", async () => {
      const res = await request(app)
        .get("/")
        .set("Origin", "http://localhost:3000");

      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
      expect(res.headers["access-control-allow-methods"]).toBe(
        "GET, POST, PUT, DELETE",
      );
      expect(res.headers["access-control-allow-headers"]).toBe(
        "Content-Type, Authorization",
      );
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });

    test("sets default origin to * when no origin header", async () => {
      const res = await request(app).get("/");

      expect(res.headers["access-control-allow-origin"]).toBe("*");
    });

    test("handles preflight OPTIONS requests", async () => {
      const res = await request(app)
        .options("/api/auth")
        .set("Origin", "http://localhost:3000");

      expect(res.headers["access-control-allow-origin"]).toBe(
        "http://localhost:3000",
      );
      expect(res.headers["access-control-allow-methods"]).toBe(
        "GET, POST, PUT, DELETE",
      );
    });
  });

  // ====================================================================
  // JSON Body Parsing
  // ====================================================================
  describe("JSON body parsing", () => {
    test("returns 400 for invalid JSON", async () => {
      const res = await request(app)
        .post("/api/auth")
        .set("Content-Type", "application/json")
        .send("invalid json{");

      expect(res.status).toBe(400);
    });
  });
});
