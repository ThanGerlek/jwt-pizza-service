// Mock database and JWT before importing app
jest.mock("../src/database/database.js", () => ({
  Role: { Diner: "diner", Franchisee: "franchisee", Admin: "admin" },
  DB: {
    getFranchises: jest.fn(),
    getUserFranchises: jest.fn(),
    createFranchise: jest.fn(),
    deleteFranchise: jest.fn(),
    getFranchise: jest.fn(),
    createStore: jest.fn(),
    deleteStore: jest.fn(),
    isLoggedIn: jest.fn(),
  },
}));

jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "tok.sig.sgn"),
  verify: jest.fn(),
}));

const request = require("supertest");
const app = require("../src/service");
const { DB } = require("../src/database/database.js");
const jwt = require("jsonwebtoken");

describe("Franchise Router Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ====================================================================
  // GET /api/franchise - List all franchises
  // ====================================================================
  describe("GET /api/franchise", () => {
    test("returns franchises with pagination", async () => {
      const mockFranchises = [
        { id: 1, name: "pizzaPocket", stores: [{ id: 1, name: "SLC" }] },
        { id: 2, name: "pizzaHut", stores: [{ id: 2, name: "NYC" }] },
      ];
      DB.getFranchises.mockResolvedValueOnce([mockFranchises, false]);

      const res = await request(app).get("/api/franchise");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ franchises: mockFranchises, more: false });
    });

    test("handles query params", async () => {
      const mockFranchises = [{ id: 1, name: "pizzaPocket", stores: [] }];
      DB.getFranchises.mockResolvedValueOnce([mockFranchises, true]);

      const res = await request(app).get(
        "/api/franchise?page=1&limit=5&name=pizza",
      );

      expect(res.status).toBe(200);
      expect(res.body.more).toBe(true);
    });
  });

  // ====================================================================
  // GET /api/franchise/:userId - Get user's franchises
  // ====================================================================
  describe("GET /api/franchise/:userId", () => {
    test("user can view their own franchises", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 5,
        name: "Test User",
        email: "test@test.com",
        roles: [{ role: "franchisee" }],
      });

      const mockFranchises = [
        { id: 1, name: "pizzaPocket", stores: [], admins: [] },
      ];
      DB.getUserFranchises.mockResolvedValueOnce(mockFranchises);

      const res = await request(app)
        .get("/api/franchise/5")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockFranchises);
    });

    test("admin can view any user's franchises", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 1,
        name: "Admin",
        email: "admin@test.com",
        roles: [{ role: "admin" }],
      });

      const mockFranchises = [
        { id: 2, name: "pizzaHut", stores: [], admins: [] },
      ];
      DB.getUserFranchises.mockResolvedValueOnce(mockFranchises);

      const res = await request(app)
        .get("/api/franchise/10")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockFranchises);
    });

    test("returns empty array when not authorized", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 5,
        name: "Test User",
        email: "test@test.com",
        roles: [{ role: "diner" }],
      });

      const res = await request(app)
        .get("/api/franchise/10")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/franchise/5");

      expect(res.status).toBe(401);
    });
  });

  // ====================================================================
  // POST /api/franchise - Create new franchise
  // ====================================================================
  describe("POST /api/franchise", () => {
    test("admin creates franchise successfully", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 1,
        name: "Admin",
        email: "admin@test.com",
        roles: [{ role: "admin" }],
      });

      const newFranchise = {
        name: "pizzaPocket",
        admins: [{ email: "f@test.com" }],
      };
      const createdFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, email: "f@test.com", name: "Franchisee" }],
      };

      DB.createFranchise.mockResolvedValueOnce(createdFranchise);

      const res = await request(app)
        .post("/api/franchise")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newFranchise);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdFranchise);
    });

    test("returns 403 for non-admin", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 5,
        name: "Diner",
        email: "diner@test.com",
        roles: [{ role: "diner" }],
      });

      const res = await request(app)
        .post("/api/franchise")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send({ name: "pizzaPocket", admins: [] });

      expect(res.status).toBe(403);
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app)
        .post("/api/franchise")
        .send({ name: "pizzaPocket", admins: [] });

      expect(res.status).toBe(401);
    });
  });

  // ====================================================================
  // DELETE /api/franchise/:franchiseId - Delete franchise
  // ====================================================================
  describe("DELETE /api/franchise/:franchiseId", () => {
    test("deletes franchise successfully (no auth check in code)", async () => {
      DB.deleteFranchise.mockResolvedValueOnce();

      const res = await request(app).delete("/api/franchise/5");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("franchise deleted");
    });
  });

  // ====================================================================
  // POST /api/franchise/:franchiseId/store - Create store
  // ====================================================================
  describe("POST /api/franchise/:franchiseId/store", () => {
    test("admin creates store successfully", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 1,
        name: "Admin",
        email: "admin@test.com",
        roles: [{ role: "admin" }],
      });

      const mockFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, name: "Franchisee", email: "f@test.com" }],
      };
      const newStore = { name: "SLC" };
      const createdStore = { id: 1, franchiseId: 5, name: "SLC" };

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.createStore.mockResolvedValueOnce(createdStore);

      const res = await request(app)
        .post("/api/franchise/5/store")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newStore);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdStore);
    });

    test("franchisee creates store for their franchise", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 10,
        name: "Franchisee",
        email: "f@test.com",
        roles: [{ role: "franchisee", objectId: 5 }],
      });

      const mockFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, name: "Franchisee", email: "f@test.com" }],
      };
      const newStore = { name: "NYC" };
      const createdStore = { id: 2, franchiseId: 5, name: "NYC" };

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.createStore.mockResolvedValueOnce(createdStore);

      const res = await request(app)
        .post("/api/franchise/5/store")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newStore);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdStore);
    });

    test("returns 403 when not admin or franchise owner", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 20,
        name: "Other User",
        email: "other@test.com",
        roles: [{ role: "diner" }],
      });

      const mockFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, name: "Franchisee", email: "f@test.com" }],
      };

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);

      const res = await request(app)
        .post("/api/franchise/5/store")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send({ name: "Store" });

      expect(res.status).toBe(403);
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app)
        .post("/api/franchise/5/store")
        .send({ name: "Store" });

      expect(res.status).toBe(401);
    });
  });

  // ====================================================================
  // DELETE /api/franchise/:franchiseId/store/:storeId - Delete store
  // ====================================================================
  describe("DELETE /api/franchise/:franchiseId/store/:storeId", () => {
    test("admin deletes store successfully", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 1,
        name: "Admin",
        email: "admin@test.com",
        roles: [{ role: "admin" }],
      });

      const mockFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, name: "Franchisee", email: "f@test.com" }],
      };

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.deleteStore.mockResolvedValueOnce();

      const res = await request(app)
        .delete("/api/franchise/5/store/1")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("store deleted");
    });

    test("franchisee deletes store from their franchise", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 10,
        name: "Franchisee",
        email: "f@test.com",
        roles: [{ role: "franchisee", objectId: 5 }],
      });

      const mockFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, name: "Franchisee", email: "f@test.com" }],
      };

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.deleteStore.mockResolvedValueOnce();

      const res = await request(app)
        .delete("/api/franchise/5/store/2")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("store deleted");
    });

    test("returns 403 when not authorized", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 20,
        name: "Other User",
        email: "other@test.com",
        roles: [{ role: "diner" }],
      });

      const mockFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, name: "Franchisee", email: "f@test.com" }],
      };

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);

      const res = await request(app)
        .delete("/api/franchise/5/store/1")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(403);
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app).delete("/api/franchise/5/store/1");

      expect(res.status).toBe(401);
    });
  });
});
