const { makeTestApp } = require("./test_utils/mocked_imports");

const buildMocks = require("./test_utils/test_utils");

describe("Franchise Router Integration Tests", () => {
  let request;
  let app;
  let deps;
  let mockLoginAsAdmin;
  let mockLoginAsFranchisee;
  let mockLoginAsDiner;

  beforeEach(() => {
    ({ request, app, deps } = makeTestApp());
    ({ mockLoginAsAdmin, mockLoginAsFranchisee, mockLoginAsDiner } = buildMocks(
      deps.db,
      deps.jwt,
    ));
  });

  // ====================================================================
  // GET /api/franchise - List all franchises
  // ====================================================================
  describe("GET /api/franchise", () => {
    const mockFranchises = [
      { id: 11, name: "pizzaPocket", stores: [{ id: 101, name: "SLC" }] },
      { id: 12, name: "pizzaHut", stores: [{ id: 102, name: "NYC" }] },
    ];

    test("returns franchises with pagination", async () => {
      deps.db.getFranchises.mockResolvedValueOnce([mockFranchises, false]);

      const res = await request(app).get("/api/franchise");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ franchises: mockFranchises, more: false });
    });

    test("handles query params", async () => {
      deps.db.getFranchises.mockResolvedValueOnce([mockFranchises, true]);

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
    const mockFranchises = [
      { id: 11, name: "pizzaPocket", stores: [], admins: [] },
      { id: 12, name: "pizzaHut", stores: [], admins: [] },
    ];

    test("user can view their own franchises", async () => {
      const userData = mockLoginAsFranchisee();
      deps.db.getUserFranchises.mockResolvedValueOnce(mockFranchises);

      const res = await request(app)
        .get(`/api/franchise/${userData.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockFranchises);
    });

    test("admin can view any user's franchises", async () => {
      // TODO Is this identical to the above?
      const userData = mockLoginAsAdmin();
      deps.db.getUserFranchises.mockResolvedValueOnce(mockFranchises);

      const res = await request(app)
        .get(`/api/franchise/${userData.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockFranchises);
    });

    test("returns empty array when not authorized", async () => {
      const userData = mockLoginAsDiner();
      const wrongUserId = userData.id + 1;
      deps.db.getUserFranchises.mockResolvedValueOnce(mockFranchises); // Should not be returned

      const res = await request(app)
        .get(`/api/franchise/${wrongUserId}`)
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
      const userData = mockLoginAsAdmin();

      const newFranchise = {
        name: "pizzaPocket",
        admins: [{ email: userData.email }],
      };
      const createdFranchise = {
        id: 5,
        name: "pizzaPocket",
        admins: [{ id: 10, email: "f@test.com", name: "Franchisee" }],
      };

      deps.db.createFranchise.mockResolvedValueOnce(createdFranchise);

      const res = await request(app)
        .post("/api/franchise")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newFranchise);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdFranchise);
    });

    test("returns 403 for non-admin", async () => {
      mockLoginAsDiner();

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
    test("admin deletes franchise successfully", async () => {
      mockLoginAsAdmin();
      deps.db.deleteFranchise.mockResolvedValueOnce();

      const res = await request(app)
        .delete("/api/franchise/5")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("franchise deleted");
    });

    test("returns 403 for non-admin", async () => {
      mockLoginAsDiner();

      const res = await request(app)
        .delete("/api/franchise/5")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(403);
      expect(deps.db.deleteFranchise).not.toHaveBeenCalled();
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app).delete("/api/franchise/5");

      expect(res.status).toBe(401);
      expect(deps.db.deleteFranchise).not.toHaveBeenCalled();
    });
  });

  // ====================================================================
  // POST /api/franchise/:franchiseId/store - Create store
  // ====================================================================
  describe("POST /api/franchise/:franchiseId/store", () => {
    const buildMockFranchise = (adminId) => ({
      id: 11,
      name: "pizzaPocket",
      admins: [{ id: adminId }],
    });
    const newStore = { name: "SLC" };
    const createdStore = { id: 101, franchiseId: 11, name: "SLC" };

    test("admin creates store successfully", async () => {
      mockLoginAsAdmin();
      const mockFranchise = buildMockFranchise(1234);

      deps.db.getFranchise.mockResolvedValueOnce(mockFranchise);
      deps.db.createStore.mockResolvedValueOnce(createdStore);

      const res = await request(app)
        .post(`/api/franchise/${mockFranchise.id}/store`)
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newStore);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdStore);
    });

    test("franchisee creates store for their franchise", async () => {
      const userData = mockLoginAsFranchisee();
      const mockFranchise = buildMockFranchise(userData.id);

      deps.db.getFranchise.mockResolvedValueOnce(mockFranchise);
      deps.db.createStore.mockResolvedValueOnce(createdStore);

      const res = await request(app)
        .post(`/api/franchise/${mockFranchise.id}/store`)
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newStore);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdStore);
    });

    test("returns 403 when not admin or franchise owner", async () => {
      mockLoginAsDiner();
      const mockFranchise = buildMockFranchise(1234);

      deps.db.getFranchise.mockResolvedValueOnce(mockFranchise);

      const res = await request(app)
        .post(`/api/franchise/${mockFranchise.id}/store`)
        .set("Authorization", "Bearer tok.sig.sgn")
        .send({ name: "Store" });

      expect(res.status).toBe(403);
    });

    test("returns 403 when franchisee of a different franchise", async () => {
      const userData = mockLoginAsFranchisee();

      const otherMockFranchise = buildMockFranchise(userData.id + 1);
      deps.db.getFranchise.mockResolvedValueOnce(otherMockFranchise);

      const res = await request(app)
        .post(`/api/franchise/${otherMockFranchise.id}/store`)
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
    const buildMockFranchise = (adminId) => ({
      id: 11,
      name: "pizzaPocket",
      admins: [{ id: adminId }],
    });

    const mockStore = { id: 101 };

    test("admin deletes store successfully", async () => {
      mockLoginAsAdmin();
      const mockFranchise = buildMockFranchise(1234);

      deps.db.getFranchise.mockResolvedValueOnce(mockFranchise);
      deps.db.deleteStore.mockResolvedValueOnce();

      const res = await request(app)
        .delete(`/api/franchise/${mockFranchise.id}/store/${mockStore.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("store deleted");
    });

    test("franchisee deletes store from their franchise", async () => {
      const userData = mockLoginAsFranchisee();
      const mockFranchise = buildMockFranchise(userData.id);

      deps.db.getFranchise.mockResolvedValueOnce(mockFranchise);
      deps.db.deleteStore.mockResolvedValueOnce();

      const res = await request(app)
        .delete(`/api/franchise/${mockFranchise.id}/store/${mockStore.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("store deleted");
    });

    test("returns 403 when not authorized", async () => {
      mockLoginAsDiner();
      const mockFranchise = buildMockFranchise(1234);

      deps.db.getFranchise.mockResolvedValueOnce(mockFranchise);

      const res = await request(app)
        .delete(`/api/franchise/${mockFranchise.id}/store/${mockStore.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(403);
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app).delete(
        `/api/franchise/11/store/${mockStore.id}`,
      );

      expect(res.status).toBe(401);
    });
  });
});
