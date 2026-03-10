const { stopMetrics } = require("../src/metrics");
const { setupMocks } = require("./test_utils/mocked_imports");
const { request, app, DB, jwt } = setupMocks();
const nock = require('nock');

const buildMocks = require("./test_utils/test_utils");
const { mockLoginAsAdmin, mockLoginAsDiner, mockUserDiner } = buildMocks(DB, jwt);

describe("Order Router Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopMetrics();
  });

  // ====================================================================
  // GET /api/order/menu - Get menu
  // ====================================================================
  describe("GET /api/order/menu", () => {
    test("returns menu without requiring authentication", async () => {
      const mockMenu = [
        {
          id: 1,
          title: "Veggie",
          description: "A garden delight",
          image: "pizza1.png",
          price: 0.0038,
        },
        {
          id: 2,
          title: "Pepperoni",
          description: "Spicy goodness",
          image: "pizza2.png",
          price: 0.0042,
        },
      ];
      DB.getMenu.mockResolvedValueOnce(mockMenu);

      const res = await request(app).get("/api/order/menu");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockMenu);
      expect(DB.getMenu).toHaveBeenCalled();
      expect(DB.isLoggedIn).not.toHaveBeenCalled();
    });

    test("returns empty array when no menu items", async () => {
      DB.getMenu.mockResolvedValueOnce([]);

      const res = await request(app).get("/api/order/menu");

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  // ====================================================================
  // PUT /api/order/menu - Add menu item
  // ====================================================================
  describe("PUT /api/order/menu", () => {
    const newItem = {
      title: "Test",
      description: "Test",
      image: "test.png",
      price: 0.001,
    };

    test("admin adds menu item successfully", async () => {
      mockLoginAsAdmin();
      const updatedMenu = [newItem];

      DB.addMenuItem.mockResolvedValueOnce();
      DB.getMenu.mockResolvedValueOnce(updatedMenu);

      const res = await request(app)
        .put("/api/order/menu")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newItem);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(updatedMenu);
      expect(DB.addMenuItem).toHaveBeenCalledWith(newItem);
      expect(DB.getMenu).toHaveBeenCalled();
    });

    test("returns 403 for non-admin", async () => {
      mockLoginAsDiner();

      const res = await request(app)
        .put("/api/order/menu")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newItem);

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("unable to add menu item");
      expect(DB.addMenuItem).not.toHaveBeenCalled();
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app).put("/api/order/menu").send(newItem);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("unauthorized");
    });
  });

  // ====================================================================
  // GET /api/order - Get orders
  // ====================================================================
  describe("GET /api/order", () => {
    test("returns authenticated user's orders", async () => {
      const userData = mockLoginAsDiner();

      const mockOrders = {
        dinerId: userData.id,
        orders: [
          {
            id: 1,
            franchiseId: 1,
            storeId: 1,
            date: "2024-01-01",
            items: [{ id: 1, menuId: 1, description: "Veggie", price: 0.0038 }],
          },
        ],
        page: 1,
      };

      DB.getOrders.mockResolvedValueOnce(mockOrders);

      const res = await request(app)
        .get("/api/order")
        .set("Authorization", "Bearer tok.sig.sgn");

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockOrders);
      expect(DB.getOrders).toHaveBeenCalledWith(mockUserDiner, undefined);
    });

    test("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/order");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("unauthorized");
    });
  });

  // ====================================================================
  // POST /api/order - Create order
  // ====================================================================
  describe("POST /api/order", () => {
    test("returns success ", async () => {
      mockLoginAsDiner();

      const orderReq = {
        franchiseId: 11,
        storeId: 101,
        items: [{ menuId: 2, description: "Pepperoni", price: 0.0038 }],
      };
      const mockPizzaFactoryResponse = { order: {...orderReq, id: 5} };

      DB.addDinerOrder.mockResolvedValueOnce(mockPizzaFactoryResponse.order);
      nock('https://pizza-factory.cs329.click')
        .post('/api/order')
        .reply(200, mockPizzaFactoryResponse);

      const res = await request(app)
        .post("/api/order")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(orderReq);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject(mockPizzaFactoryResponse);
    });

    test("returns 401 without auth token", async () => {
      const orderReq = {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: "Veggie", price: 0.0038 }],
      };

      const res = await request(app).post("/api/order").send(orderReq);

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("unauthorized");
    });
  });
});
