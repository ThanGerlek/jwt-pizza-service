// Mock database and JWT before importing app
jest.mock("../src/database/database.js", () => ({
  Role: { Diner: "diner", Admin: "admin" },
  DB: {
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
    getOrders: jest.fn(),
    addDinerOrder: jest.fn(),
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

describe("Order Router Integration Tests", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clean up any previous fetch mocks
    if (global.fetch && global.fetch.mockRestore) {
      global.fetch.mockRestore();
    }
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

    test("returns array of menu items", async () => {
      const mockMenu = [
        {
          id: 1,
          title: "Margherita",
          description: "Classic",
          image: "pizza.png",
          price: 0.004,
        },
      ];
      DB.getMenu.mockResolvedValueOnce(mockMenu);

      const res = await request(app).get("/api/order/menu");

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0]).toHaveProperty("id");
      expect(res.body[0]).toHaveProperty("title");
      expect(res.body[0]).toHaveProperty("description");
      expect(res.body[0]).toHaveProperty("image");
      expect(res.body[0]).toHaveProperty("price");
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
    test("admin adds menu item successfully", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 1,
        name: "Admin",
        email: "admin@test.com",
        roles: [{ role: "admin" }],
      });

      const newItem = {
        title: "Student",
        description: "No topping, no sauce, just carbs",
        image: "pizza9.png",
        price: 0.0001,
      };

      const updatedMenu = [
        {
          id: 1,
          title: "Veggie",
          description: "A garden delight",
          image: "pizza1.png",
          price: 0.0038,
        },
        { id: 2, ...newItem },
      ];

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

    test("returns updated menu", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 1,
        name: "Admin",
        email: "admin@test.com",
        roles: [{ role: "admin" }],
      });

      const newItem = {
        title: "Test",
        description: "Test",
        image: "test.png",
        price: 0.001,
      };
      const mockMenu = [newItem];

      DB.addMenuItem.mockResolvedValueOnce();
      DB.getMenu.mockResolvedValueOnce(mockMenu);

      const res = await request(app)
        .put("/api/order/menu")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newItem);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test("returns 403 for non-admin", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce({
        id: 5,
        name: "Diner",
        email: "diner@test.com",
        roles: [{ role: "diner" }],
        isRole: () => false,
      });

      const newItem = {
        title: "Test",
        description: "Test",
        image: "test.png",
        price: 0.001,
      };

      const res = await request(app)
        .put("/api/order/menu")
        .set("Authorization", "Bearer tok.sig.sgn")
        .send(newItem);

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("unable to add menu item");
      expect(DB.addMenuItem).not.toHaveBeenCalled();
    });

    test("returns 401 without auth token", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(false);

      const newItem = {
        title: "Test",
        description: "Test",
        image: "test.png",
        price: 0.001,
      };

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
      const mockUser = {
        id: 5,
        name: "Test User",
        email: "test@test.com",
        roles: [{ role: "diner" }],
      };

      DB.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce(mockUser);

      const mockOrders = {
        dinerId: 5,
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
      expect(DB.getOrders).toHaveBeenCalledWith(mockUser, undefined);
    });

    test("returns 401 without auth token", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(false);

      const res = await request(app).get("/api/order");

      expect(res.status).toBe(401);
      expect(res.body.message).toBe("unauthorized");
    });
  });

  // ====================================================================
  // POST /api/order - Create order
  // ====================================================================
  describe("POST /api/order", () => {
    test("returns 401 without auth token", async () => {
      DB.isLoggedIn.mockResolvedValueOnce(false);

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
