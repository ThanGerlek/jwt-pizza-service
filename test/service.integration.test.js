// Mock database before importing app
jest.mock("../src/database/database.js", () => ({
  Role: { Diner: "diner", Admin: "admin" },
  DB: {
    isLoggedIn: jest.fn(),
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
  },
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "tok.sig.sgn"),
  verify: jest.fn(),
}));

const request = require("supertest");
const app = require("../src/service");
const { StatusCodeError } = require("../src/endpointHelper");

describe("Service Integration Tests - Edge Cases", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    test("includes all router docs", async () => {
      const res = await request(app).get("/api/docs");

      expect(res.status).toBe(200);
      expect(res.body.endpoints.length).toBeGreaterThan(0);

      // Check for some expected endpoints from different routers
      const paths = res.body.endpoints.map((e) => e.path);
      expect(paths).toContain("/api/auth");
      expect(paths.some((p) => p.startsWith("/api/franchise"))).toBe(true);
      expect(paths.some((p) => p.startsWith("/api/order"))).toBe(true);
    });

    test("includes config information", async () => {
      const res = await request(app).get("/api/docs");

      expect(res.status).toBe(200);
      expect(res.body.config).toHaveProperty("factory");
      expect(res.body.config).toHaveProperty("db");
    });

    test("returns version as string", async () => {
      const res = await request(app).get("/api/docs");

      expect(res.status).toBe(200);
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
    test("returns 404 for unknown GET routes", async () => {
      const res = await request(app).get("/api/unknown");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("unknown endpoint");
    });

    test("returns 404 for unknown POST routes", async () => {
      const res = await request(app).post("/api/nonexistent");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("unknown endpoint");
    });

    test("returns 404 for unknown PUT routes", async () => {
      const res = await request(app).put("/unknown/path");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("unknown endpoint");
    });

    test("returns 404 for unknown DELETE routes", async () => {
      const res = await request(app).delete("/api/something/else");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("unknown endpoint");
    });

    test("returns 404 for deeply nested unknown paths", async () => {
      const res = await request(app).get("/api/deep/nested/unknown/path");

      expect(res.status).toBe(404);
      expect(res.body.message).toBe("unknown endpoint");
    });

    test("returns JSON for unknown endpoints", async () => {
      const res = await request(app).get("/not/a/valid/endpoint");

      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toMatch(/json/);
    });
  });

  // ====================================================================
  // Error Handler - Global Error Handling
  // ====================================================================
  describe("Error handler", () => {
    test("returns error with status code from StatusCodeError", async () => {
      // Trigger an error by trying to access a protected endpoint without proper auth
      const { DB } = require("../src/database/database.js");
      DB.isLoggedIn.mockResolvedValueOnce(false);

      const res = await request(app).get("/api/order");

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty("message");
      expect(res.body.message).toBe("unauthorized");
    });

    test("includes error message in response", async () => {
      const { DB } = require("../src/database/database.js");
      DB.isLoggedIn.mockResolvedValueOnce(false);

      const res = await request(app).delete("/api/auth");

      expect(res.status).toBe(401);
      expect(res.body.message).toBeTruthy();
      expect(typeof res.body.message).toBe("string");
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
