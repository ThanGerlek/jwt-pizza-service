const { stopMetrics } = require("../src/metrics");
const { setupMocks } = require("./test_utils/mocked_imports");
const { request, app, DB, jwt } = setupMocks();

const buildMocks = require("./test_utils/test_utils");
const {
  mockLoginAsAdmin,
  mockLoginAsFranchisee,
  mockLoginAsDiner,
  mockUserFranchisee,
} = buildMocks(DB, jwt);


describe("Franchise Router Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopMetrics();
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
      DB.getFranchises.mockResolvedValueOnce([mockFranchises, false]);

      const res = await request(app).get("/api/franchise");

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ franchises: mockFranchises, more: false });
    });

    test("handles query params", async () => {
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

    const mockFranchises = [
      { id: 11, name: "pizzaPocket", stores: [], admins: [] },
      { id: 12, name: "pizzaHut", stores: [], admins: [] },
    ];

    test("user can view their own franchises", async () => {
      const userData = mockLoginAsFranchisee();
      DB.getUserFranchises.mockResolvedValueOnce(mockFranchises);

      const res = await request(app)
        .get(`/api/franchise/${userData.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockFranchises);
    });

    test("admin can view any user's franchises", async () => {
      // TODO Is this identical to the above?
      const userData = mockLoginAsAdmin();
      DB.getUserFranchises.mockResolvedValueOnce(mockFranchises);

      const res = await request(app)
        .get(`/api/franchise/${userData.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockFranchises);
    });

    test("returns empty array when not authorized", async () => {
      const userData = mockLoginAsDiner();
      const wrongUserId = userData.id + 1;
      DB.getUserFranchises.mockResolvedValueOnce(mockFranchises);  // Should not be returned
      
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

      DB.createFranchise.mockResolvedValueOnce(createdFranchise);

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

    // TODO Require auth? It currently doesn't.

    test("deletes franchise successfully", async () => {
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

    const mockFranchise = {
      id: 11,
      name: "pizzaPocket",
      admins: [mockUserFranchisee],
    };
    const newStore = { name: "SLC" };
    const createdStore = { id: 101, franchiseId: mockFranchise.id, name: "SLC" };

    test("admin creates store successfully", async () => {
      mockLoginAsAdmin();

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.createStore.mockResolvedValueOnce(createdStore);

      const res = await request(app)
        .post(`/api/franchise/${mockFranchise.id}/store`)
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newStore);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdStore);
    });

    test("franchisee creates store for their franchise", async () => {
      mockLoginAsFranchisee();

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.createStore.mockResolvedValueOnce(createdStore);

      const res = await request(app)
        .post(`/api/franchise/${mockFranchise.id}/store`)
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newStore);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(createdStore);
    });

    test("returns 403 when not admin or franchise owner", async () => {
      mockLoginAsDiner();

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);

      const res = await request(app)
        .post(`/api/franchise/${mockFranchise.id}/store`)
        .set("Authorization", "Bearer tok.sig.sgn")
        .send({ name: "Store" });

      expect(res.status).toBe(403);
    });

    test("returns 403 when franchisee of a different franchise", async () => {
      mockLoginAsFranchisee();

      const otherMockFranchise = {...mockFranchise, admins: []}
      DB.getFranchise.mockResolvedValueOnce(otherMockFranchise);

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

    const mockFranchise = {
      id: 11,
      name: "pizzaPocket",
      admins: [mockUserFranchisee],
    };

    const mockStore = {id: 101};

    test("admin deletes store successfully", async () => {
      mockLoginAsAdmin();

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.deleteStore.mockResolvedValueOnce();

      const res = await request(app)
        .delete(`/api/franchise/${mockFranchise.id}/store/${mockStore.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("store deleted");
    });

    test("franchisee deletes store from their franchise", async () => {
      mockLoginAsFranchisee();

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);
      DB.deleteStore.mockResolvedValueOnce();

      const res = await request(app)
        .delete(`/api/franchise/${mockFranchise.id}/store/${mockStore.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body.message).toBe("store deleted");
    });

    test("returns 403 when not authorized", async () => {
      mockLoginAsDiner();

      DB.getFranchise.mockResolvedValueOnce(mockFranchise);

      const res = await request(app)
        .delete(`/api/franchise/${mockFranchise.id}/store/${mockStore.id}`)
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(403);
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app).delete(`/api/franchise/${mockFranchise.id}/store/${mockStore.id}`);

      expect(res.status).toBe(401);
    });
  });
});
