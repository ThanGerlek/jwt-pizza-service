// Mock dependencies before importing anything
const mockConnection = {
  execute: jest.fn(),
  query: jest.fn(),
  end: jest.fn().mockResolvedValue(undefined),
  beginTransaction: jest.fn().mockResolvedValue(undefined),
  commit: jest.fn().mockResolvedValue(undefined),
  rollback: jest.fn().mockResolvedValue(undefined),
};

const mockMysql = {
  createConnection: jest.fn(() => Promise.resolve(mockConnection)),
};

const mockBcrypt = {
  hash: jest.fn(() => Promise.resolve("hashedPassword")),
  compare: jest.fn(() => Promise.resolve(true)),
};

const mockConfig = {
  db: {
    connection: {
      host: "localhost",
      user: "test",
      password: "test",
      database: "testdb",
      connectTimeout: 60000,
    },
    listPerPage: 10,
  },
};

jest.mock("mysql2/promise", () => mockMysql);
jest.mock("bcrypt", () => mockBcrypt);
jest.mock("../src/config.js", () => mockConfig);

// Import real DB class after mocking dependencies
const database = require("../src/database/database.js");
const { StatusCodeError } = require("../src/endpointHelper.js");
const { Role } = require("../src/model/model.js");

// Override the DB instance's initialized promise to avoid actual DB initialization
const originalDB = database.DB;

describe("Database Unit Tests", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Mock the initialization to avoid actual DB calls
    mockConnection.query.mockResolvedValue([[]]); // For USE database
    mockConnection.execute.mockResolvedValue([[]]); // For check database exists
    // Override the initialized promise
    originalDB.initialized = Promise.resolve();
  });

  // ====================================================================
  // MENU METHODS TESTS
  // ====================================================================
  describe("Menu Methods", () => {
    describe("getMenu", () => {
      test("returns menu items and closes connection", async () => {
        const mockMenuItems = [
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
        mockConnection.execute.mockResolvedValueOnce([mockMenuItems]);

        const result = await originalDB.getMenu();

        expect(result).toEqual(mockMenuItems);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT * FROM menu",
          undefined,
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection even on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        await expect(originalDB.getMenu()).rejects.toThrow("DB error");
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("addMenuItem", () => {
      test("adds menu item with all fields and returns item with insertId", async () => {
        const newItem = {
          title: "Margherita",
          description: "Classic Italian",
          image: "margherita.png",
          price: 0.0035,
        };
        mockConnection.execute.mockResolvedValueOnce([{ insertId: 5 }]);

        const result = await originalDB.addMenuItem(newItem);

        expect(result).toEqual({ ...newItem, id: 5 });
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)",
          [newItem.title, newItem.description, newItem.image, newItem.price],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        const newItem = {
          title: "Test",
          description: "Test",
          image: "test.png",
          price: 0.001,
        };
        mockConnection.execute.mockRejectedValueOnce(
          new Error("Insert failed"),
        );

        await expect(originalDB.addMenuItem(newItem)).rejects.toThrow(
          "Insert failed",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });
  });

  // ====================================================================
  // USER METHODS TESTS
  // ====================================================================
  describe("User Methods", () => {
    describe("addUser", () => {
      test("hashes password and creates diner user", async () => {
        const newUser = {
          name: "Test User",
          email: "test@test.com",
          password: "plainPassword",
          roles: [{ role: Role.Diner }],
        };
        mockConnection.execute
          .mockResolvedValueOnce([{ insertId: 10 }]) // INSERT user
          .mockResolvedValueOnce([{}]); // INSERT userRole

        const result = await originalDB.addUser(newUser);

        expect(mockBcrypt.hash).toHaveBeenCalledWith("plainPassword", 10);
        expect(result).toEqual({
          ...newUser,
          id: 10,
          password: undefined,
        });
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO user (name, email, password) VALUES (?, ?, ?)",
          ["Test User", "test@test.com", "hashedPassword"],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)",
          [10, Role.Diner, 0],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("creates franchisee user with objectId", async () => {
        const newUser = {
          name: "Franchisee",
          email: "franchisee@test.com",
          password: "password",
          roles: [{ role: Role.Franchisee, object: "pizzaPocket" }],
        };
        mockConnection.execute
          .mockResolvedValueOnce([{ insertId: 20 }]) // INSERT user
          .mockResolvedValueOnce([[{ id: 5 }]]) // getID for franchise
          .mockResolvedValueOnce([{}]); // INSERT userRole

        const result = await originalDB.addUser(newUser);

        expect(result.id).toBe(20);
        expect(result.password).toBeUndefined();
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT id FROM franchise WHERE name=?",
          ["pizzaPocket"],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)",
          [20, Role.Franchisee, 5],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("handles admin role", async () => {
        const newUser = {
          name: "Admin",
          email: "admin@test.com",
          password: "password",
          roles: [{ role: Role.Admin }],
        };
        mockConnection.execute
          .mockResolvedValueOnce([{ insertId: 1 }]) // INSERT user
          .mockResolvedValueOnce([{}]); // INSERT userRole

        const result = await originalDB.addUser(newUser);

        expect(result.id).toBe(1);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)",
          [1, Role.Admin, 0],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        const newUser = {
          name: "Error User",
          email: "error@test.com",
          password: "password",
          roles: [{ role: Role.Diner }],
        };
        mockConnection.execute.mockRejectedValueOnce(
          new Error("Insert failed"),
        );

        await expect(originalDB.addUser(newUser)).rejects.toThrow(
          "Insert failed",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("getUser", () => {
      test("returns user with roles and without password", async () => {
        const mockUser = {
          id: 1,
          name: "Test",
          email: "test@test.com",
          password: "hashedPassword",
        };
        const mockRoles = [{ userId: 1, role: "diner", objectId: 0 }];

        mockConnection.execute
          .mockResolvedValueOnce([[mockUser]]) // SELECT user
          .mockResolvedValueOnce([mockRoles]); // SELECT roles

        const result = await originalDB.getUser(
          "test@test.com",
          "plainPassword",
        );

        expect(mockBcrypt.compare).toHaveBeenCalledWith(
          "plainPassword",
          "hashedPassword",
        );
        expect(result).toEqual({
          id: 1,
          name: "Test",
          email: "test@test.com",
          password: undefined,
          roles: [{ role: "diner", objectId: undefined }],
        });
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("works without password parameter", async () => {
        const mockUser = {
          id: 1,
          name: "Test",
          email: "test@test.com",
          password: "hashedPassword",
        };
        const mockRoles = [{ userId: 1, role: "diner", objectId: 0 }];

        mockConnection.execute
          .mockResolvedValueOnce([[mockUser]])
          .mockResolvedValueOnce([mockRoles]);

        const result = await originalDB.getUser("test@test.com");

        expect(mockBcrypt.compare).not.toHaveBeenCalled();
        expect(result.id).toBe(1);
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("throws 404 when user not found", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]); // No user found

        await expect(
          originalDB.getUser("notfound@test.com", "password"),
        ).rejects.toThrow(new StatusCodeError("unknown user", 404));
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("throws 404 when password mismatch", async () => {
        const mockUser = {
          id: 1,
          name: "Test",
          email: "test@test.com",
          password: "hashedPassword",
        };
        mockConnection.execute.mockResolvedValueOnce([[mockUser]]);
        mockBcrypt.compare.mockResolvedValueOnce(false);

        await expect(
          originalDB.getUser("test@test.com", "wrongPassword"),
        ).rejects.toThrow(new StatusCodeError("unknown user", 404));
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("includes objectId in roles when present", async () => {
        const mockUser = {
          id: 2,
          name: "Franchisee",
          email: "f@test.com",
          password: "hash",
        };
        const mockRoles = [{ userId: 2, role: "franchisee", objectId: 5 }];

        mockConnection.execute
          .mockResolvedValueOnce([[mockUser]])
          .mockResolvedValueOnce([mockRoles]);

        const result = await originalDB.getUser("f@test.com");

        expect(result.roles).toEqual([{ role: "franchisee", objectId: 5 }]);
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        await expect(originalDB.getUser("test@test.com")).rejects.toThrow(
          "DB error",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("updateUser", () => {
      test("updates all fields together", async () => {
        const mockUser = {
          id: 1,
          name: "New Name",
          email: "new@test.com",
          password: "hash",
        };
        const mockRoles = [{ userId: 1, role: "diner", objectId: 0 }];

        mockConnection.execute
          .mockResolvedValueOnce([{}]) // UPDATE
          .mockResolvedValueOnce([[mockUser]]) // getUser
          .mockResolvedValueOnce([mockRoles]);

        await originalDB.updateUser(
          1,
          "New Name",
          "new@test.com",
          "newPassword",
        );

        expect(mockBcrypt.hash).toHaveBeenCalledWith("newPassword", 10);
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(
          new Error("Update failed"),
        );

        await expect(
          originalDB.updateUser(1, "Name", "email@test.com", "password"),
        ).rejects.toThrow("Update failed");
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });
  });

  // ====================================================================
  // AUTH METHODS TESTS
  // ====================================================================
  describe("Auth Methods", () => {
    describe("loginUser", () => {
      test("inserts token signature with ON DUPLICATE KEY UPDATE", async () => {
        mockConnection.execute.mockResolvedValueOnce([{}]);

        await originalDB.loginUser(5, "header.payload.signature");

        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO auth (token, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE token=token",
          ["signature", 5],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("extracts signature from token", async () => {
        mockConnection.execute.mockResolvedValueOnce([{}]);

        await originalDB.loginUser(10, "a.b.c");

        expect(mockConnection.execute).toHaveBeenCalledWith(
          expect.any(String),
          ["c", 10],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(
          new Error("Insert failed"),
        );

        await expect(originalDB.loginUser(1, "tok.en.sig")).rejects.toThrow(
          "Insert failed",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("isLoggedIn", () => {
      test("returns true when token exists", async () => {
        mockConnection.execute.mockResolvedValueOnce([[{ userId: 1 }]]);

        const result = await originalDB.isLoggedIn("header.payload.signature");

        expect(result).toBe(true);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT userId FROM auth WHERE token=?",
          ["signature"],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("returns false when token does not exist", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]);

        const result = await originalDB.isLoggedIn("header.payload.signature");

        expect(result).toBe(false);
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("extracts signature correctly", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]);

        await originalDB.isLoggedIn("a.b.c");

        expect(mockConnection.execute).toHaveBeenCalledWith(
          expect.any(String),
          ["c"],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        await expect(originalDB.isLoggedIn("tok.en.sig")).rejects.toThrow(
          "DB error",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("logoutUser", () => {
      test("deletes token and extracts signature", async () => {
        mockConnection.execute.mockResolvedValueOnce([{}]);

        await originalDB.logoutUser("header.payload.signature");

        expect(mockConnection.execute).toHaveBeenCalledWith(
          "DELETE FROM auth WHERE token=?",
          ["signature"],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("extracts signature from token", async () => {
        mockConnection.execute.mockResolvedValueOnce([{}]);

        await originalDB.logoutUser("a.b.c");

        expect(mockConnection.execute).toHaveBeenCalledWith(
          expect.any(String),
          ["c"],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(
          new Error("Delete failed"),
        );

        await expect(originalDB.logoutUser("tok.en.sig")).rejects.toThrow(
          "Delete failed",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });
  });

  // ====================================================================
  // ORDER METHODS TESTS
  // ====================================================================
  describe("Order Methods", () => {
    describe("getOrders", () => {
      test("returns orders with items and pagination", async () => {
        const mockOrders = [
          { id: 1, franchiseId: 1, storeId: 1, date: "2024-01-01" },
          { id: 2, franchiseId: 1, storeId: 2, date: "2024-01-02" },
        ];
        const mockItems1 = [
          { id: 1, menuId: 1, description: "Veggie", price: 0.0038 },
        ];
        const mockItems2 = [
          { id: 2, menuId: 2, description: "Pepperoni", price: 0.0042 },
        ];

        mockConnection.execute
          .mockResolvedValueOnce([mockOrders]) // getOrders
          .mockResolvedValueOnce([mockItems1]) // items for order 1
          .mockResolvedValueOnce([mockItems2]); // items for order 2

        const user = { id: 5, name: "Test", email: "test@test.com" };
        const result = await originalDB.getOrders(user, 1);

        expect(result).toEqual({
          dinerId: 5,
          orders: [
            { ...mockOrders[0], items: mockItems1 },
            { ...mockOrders[1], items: mockItems2 },
          ],
          page: 1,
        });
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT 0,10",
          [5],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("handles pagination with page 2", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]); // No orders

        const user = { id: 5, name: "Test", email: "test@test.com" };
        const result = await originalDB.getOrders(user, 2);

        expect(result.page).toBe(2);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          expect.stringContaining("LIMIT 10,10"),
          [5],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        const user = { id: 5, name: "Test", email: "test@test.com" };
        await expect(originalDB.getOrders(user, 1)).rejects.toThrow("DB error");
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("addDinerOrder", () => {
      test("creates order with items and returns with insertId", async () => {
        const user = { id: 5, name: "Test", email: "test@test.com" };
        const order = {
          franchiseId: 1,
          storeId: 2,
          items: [
            { menuId: 1, description: "Veggie", price: 0.0038 },
            { menuId: 2, description: "Pepperoni", price: 0.0042 },
          ],
        };

        mockConnection.execute
          .mockResolvedValueOnce([{ insertId: 100 }]) // INSERT order
          .mockResolvedValueOnce([[{ id: 1 }]]) // getID for menu item 1
          .mockResolvedValueOnce([{}]) // INSERT orderItem 1
          .mockResolvedValueOnce([[{ id: 2 }]]) // getID for menu item 2
          .mockResolvedValueOnce([{}]); // INSERT orderItem 2

        const result = await originalDB.addDinerOrder(user, order);

        expect(result).toEqual({ ...order, id: 100 });
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())",
          [5, 1, 2],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)",
          [100, 1, "Veggie", 0.0038],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        const user = { id: 5, name: "Test", email: "test@test.com" };
        const order = { franchiseId: 1, storeId: 2, items: [] };

        mockConnection.execute.mockRejectedValueOnce(
          new Error("Insert failed"),
        );

        await expect(originalDB.addDinerOrder(user, order)).rejects.toThrow(
          "Insert failed",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });
  });

  // ====================================================================
  // FRANCHISE METHODS TESTS
  // ====================================================================
  describe("Franchise Methods", () => {
    describe("createFranchise", () => {
      test("creates franchise and adds franchisee roles", async () => {
        const franchise = {
          name: "pizzaPocket",
          admins: [{ email: "admin@test.com" }],
        };

        mockConnection.execute
          .mockResolvedValueOnce([[{ id: 10, name: "Admin User" }]]) // SELECT admin user
          .mockResolvedValueOnce([{ insertId: 5 }]) // INSERT franchise
          .mockResolvedValueOnce([{}]); // INSERT userRole

        const result = await originalDB.createFranchise(franchise);

        expect(result).toEqual({
          name: "pizzaPocket",
          id: 5,
          admins: [{ email: "admin@test.com", id: 10, name: "Admin User" }],
        });
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT id, name FROM user WHERE email=?",
          ["admin@test.com"],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO franchise (name) VALUES (?)",
          ["pizzaPocket"],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)",
          [10, Role.Franchisee, 5],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("validates admin emails and throws 404 for unknown admin", async () => {
        const franchise = {
          name: "pizzaPocket",
          admins: [{ email: "unknown@test.com" }],
        };

        mockConnection.execute.mockResolvedValueOnce([[]]); // No user found

        await expect(originalDB.createFranchise(franchise)).rejects.toThrow(
          new StatusCodeError(
            "unknown user for franchise admin unknown@test.com provided",
            404,
          ),
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("handles multiple admins", async () => {
        const franchise = {
          name: "pizzaPocket",
          admins: [{ email: "admin1@test.com" }, { email: "admin2@test.com" }],
        };

        mockConnection.execute
          .mockResolvedValueOnce([[{ id: 10, name: "Admin 1" }]]) // SELECT admin1
          .mockResolvedValueOnce([[{ id: 11, name: "Admin 2" }]]) // SELECT admin2
          .mockResolvedValueOnce([{ insertId: 5 }]) // INSERT franchise
          .mockResolvedValueOnce([{}]) // INSERT userRole for admin1
          .mockResolvedValueOnce([{}]); // INSERT userRole for admin2

        const result = await originalDB.createFranchise(franchise);

        expect(result.admins).toHaveLength(2);
        expect(result.admins[0]).toEqual({
          email: "admin1@test.com",
          id: 10,
          name: "Admin 1",
        });
        expect(result.admins[1]).toEqual({
          email: "admin2@test.com",
          id: 11,
          name: "Admin 2",
        });
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        const franchise = {
          name: "pizzaPocket",
          admins: [{ email: "admin@test.com" }],
        };
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        await expect(originalDB.createFranchise(franchise)).rejects.toThrow(
          "DB error",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("deleteFranchise", () => {
      test("deletes franchise in transaction (stores→userRoles→franchise)", async () => {
        mockConnection.execute
          .mockResolvedValueOnce([{}]) // DELETE stores
          .mockResolvedValueOnce([{}]) // DELETE userRoles
          .mockResolvedValueOnce([{}]); // DELETE franchise

        await originalDB.deleteFranchise(5);

        expect(mockConnection.beginTransaction).toHaveBeenCalled();
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "DELETE FROM store WHERE franchiseId=?",
          [5],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "DELETE FROM userRole WHERE objectId=?",
          [5],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "DELETE FROM franchise WHERE id=?",
          [5],
        );
        expect(mockConnection.commit).toHaveBeenCalled();
        expect(mockConnection.rollback).not.toHaveBeenCalled();
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("rolls back on error and throws 500 StatusCodeError", async () => {
        mockConnection.execute
          .mockResolvedValueOnce([{}]) // DELETE stores
          .mockRejectedValueOnce(new Error("DB error")); // DELETE userRoles fails

        await expect(originalDB.deleteFranchise(5)).rejects.toThrow(
          new StatusCodeError("unable to delete franchise", 500),
        );

        expect(mockConnection.beginTransaction).toHaveBeenCalled();
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.commit).not.toHaveBeenCalled();
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("getFranchises", () => {
      test('returns franchises with pagination and "more" flag', async () => {
        const mockFranchises = [
          { id: 1, name: "pizzaPocket" },
          { id: 2, name: "pizzaHut" },
        ];
        const mockStores = [{ id: 1, name: "Store 1" }];

        mockConnection.execute
          .mockResolvedValueOnce([mockFranchises]) // SELECT franchises
          .mockResolvedValueOnce([mockStores]) // SELECT stores for franchise 1
          .mockResolvedValueOnce([mockStores]); // SELECT stores for franchise 2

        const [franchises, more] = await originalDB.getFranchises(
          null,
          0,
          10,
          "*",
        );

        expect(franchises).toHaveLength(2);
        expect(more).toBe(false);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT id, name FROM franchise WHERE name LIKE ? LIMIT 11 OFFSET 0",
          ["%"],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("processes * wildcard to %", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]);

        await originalDB.getFranchises(null, 0, 10, "pizza*");

        expect(mockConnection.execute).toHaveBeenCalledWith(
          expect.any(String),
          ["pizza%"],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test('returns "more" flag when results exceed limit', async () => {
        const mockFranchises = [
          { id: 1, name: "pizzaPocket" },
          { id: 2, name: "pizzaHut" },
          { id: 3, name: "pizzaKing" },
        ];
        const mockStores = [];

        mockConnection.execute
          .mockResolvedValueOnce([mockFranchises]) // 3 results with limit 2
          .mockResolvedValueOnce([mockStores])
          .mockResolvedValueOnce([mockStores]);

        const [franchises, more] = await originalDB.getFranchises(
          null,
          0,
          2,
          "*",
        );

        expect(franchises).toHaveLength(2); // Sliced to limit
        expect(more).toBe(true);
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("admin sees full franchise details", async () => {
        const mockUser = {
          id: 1,
          isRole: (role) => role === Role.Admin,
        };
        const mockFranchises = [{ id: 1, name: "pizzaPocket" }];
        const mockAdmins = [{ id: 2, name: "Admin", email: "admin@test.com" }];
        const mockStores = [{ id: 1, name: "Store 1", totalRevenue: 100 }];

        mockConnection.execute
          .mockResolvedValueOnce([mockFranchises]) // SELECT franchises
          .mockResolvedValueOnce([mockAdmins]) // getFranchise - SELECT admins
          .mockResolvedValueOnce([mockStores]); // getFranchise - SELECT stores with revenue

        const [franchises] = await originalDB.getFranchises(
          mockUser,
          0,
          10,
          "*",
        );

        expect(franchises[0].admins).toEqual(mockAdmins);
        expect(franchises[0].stores).toEqual(mockStores);
        expect(mockConnection.end).toHaveBeenCalledTimes(2); // Once in getFranchises, once in getFranchise
      });

      test("non-admin sees only stores without revenue", async () => {
        const mockUser = {
          id: 2,
          isRole: () => false,
        };
        const mockFranchises = [{ id: 1, name: "pizzaPocket" }];
        const mockStores = [{ id: 1, name: "Store 1" }];

        mockConnection.execute
          .mockResolvedValueOnce([mockFranchises]) // SELECT franchises
          .mockResolvedValueOnce([mockStores]); // SELECT stores (no revenue)

        const [franchises] = await originalDB.getFranchises(
          mockUser,
          0,
          10,
          "*",
        );

        expect(franchises[0].stores).toEqual(mockStores);
        expect(franchises[0].admins).toBeUndefined();
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        await expect(
          originalDB.getFranchises(null, 0, 10, "*"),
        ).rejects.toThrow("DB error");
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("getUserFranchises", () => {
      test("returns user franchises with full details", async () => {
        const mockFranchiseIds = [{ objectId: 1 }, { objectId: 2 }];
        const mockFranchises = [
          { id: 1, name: "pizzaPocket" },
          { id: 2, name: "pizzaHut" },
        ];
        const mockAdmins = [{ id: 5, name: "Admin", email: "admin@test.com" }];
        const mockStores = [{ id: 1, name: "Store 1", totalRevenue: 100 }];

        mockConnection.execute
          .mockResolvedValueOnce([mockFranchiseIds]) // SELECT objectIds
          .mockResolvedValueOnce([mockFranchises]) // SELECT franchises
          .mockResolvedValueOnce([mockAdmins]) // getFranchise - admins for franchise 1
          .mockResolvedValueOnce([mockStores]) // getFranchise - stores for franchise 1
          .mockResolvedValueOnce([mockAdmins]) // getFranchise - admins for franchise 2
          .mockResolvedValueOnce([mockStores]); // getFranchise - stores for franchise 2

        const result = await originalDB.getUserFranchises(5);

        expect(result).toHaveLength(2);
        expect(result[0].admins).toEqual(mockAdmins);
        expect(result[0].stores).toEqual(mockStores);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?",
          [5],
        );
        expect(mockConnection.end).toHaveBeenCalledTimes(3); // Once in getUserFranchises, twice in getFranchise
      });

      test("returns empty array when user has no franchises", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]); // No franchise IDs

        const result = await originalDB.getUserFranchises(5);

        expect(result).toEqual([]);
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        await expect(originalDB.getUserFranchises(5)).rejects.toThrow(
          "DB error",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("getFranchise", () => {
      test("populates admins and stores with totalRevenue", async () => {
        const franchise = { id: 1, name: "pizzaPocket" };
        const mockAdmins = [{ id: 5, name: "Admin", email: "admin@test.com" }];
        const mockStores = [{ id: 1, name: "Store 1", totalRevenue: 100.5 }];

        mockConnection.execute
          .mockResolvedValueOnce([mockAdmins]) // SELECT admins
          .mockResolvedValueOnce([mockStores]); // SELECT stores with revenue

        const result = await originalDB.getFranchise(franchise);

        expect(result.admins).toEqual(mockAdmins);
        expect(result.stores).toEqual(mockStores);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT u.id, u.name, u.email FROM userRole AS ur JOIN user AS u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee'",
          [1],
        );
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT s.id, s.name, COALESCE(SUM(oi.price), 0) AS totalRevenue FROM dinerOrder AS do JOIN orderItem AS oi ON do.id=oi.orderId RIGHT JOIN store AS s ON s.id=do.storeId WHERE s.franchiseId=? GROUP BY s.id",
          [1],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        const franchise = { id: 1, name: "pizzaPocket" };
        mockConnection.execute.mockRejectedValueOnce(new Error("DB error"));

        await expect(originalDB.getFranchise(franchise)).rejects.toThrow(
          "DB error",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("createStore", () => {
      test("creates store with insertId", async () => {
        const store = { name: "New Store" };
        mockConnection.execute.mockResolvedValueOnce([{ insertId: 10 }]);

        const result = await originalDB.createStore(1, store);

        expect(result).toEqual({ id: 10, franchiseId: 1, name: "New Store" });
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "INSERT INTO store (franchiseId, name) VALUES (?, ?)",
          [1, "New Store"],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        const store = { name: "New Store" };
        mockConnection.execute.mockRejectedValueOnce(
          new Error("Insert failed"),
        );

        await expect(originalDB.createStore(1, store)).rejects.toThrow(
          "Insert failed",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });

    describe("deleteStore", () => {
      test("deletes store by franchiseId and storeId", async () => {
        mockConnection.execute.mockResolvedValueOnce([{}]);

        await originalDB.deleteStore(1, 5);

        expect(mockConnection.execute).toHaveBeenCalledWith(
          "DELETE FROM store WHERE franchiseId=? AND id=?",
          [1, 5],
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });

      test("closes connection on error", async () => {
        mockConnection.execute.mockRejectedValueOnce(
          new Error("Delete failed"),
        );

        await expect(originalDB.deleteStore(1, 5)).rejects.toThrow(
          "Delete failed",
        );
        expect(mockConnection.end).toHaveBeenCalled();
      });
    });
  });

  // ====================================================================
  // HELPER METHODS TESTS
  // ====================================================================
  describe("Helper Methods", () => {
    describe("query", () => {
      test("wraps connection.execute and returns results", async () => {
        const mockResults = [{ id: 1, name: "Test" }];
        mockConnection.execute.mockResolvedValueOnce([mockResults]);

        const result = await originalDB.query(
          mockConnection,
          "SELECT * FROM test",
          [],
        );

        expect(result).toEqual(mockResults);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT * FROM test",
          [],
        );
      });

      test("handles queries without params", async () => {
        const mockResults = [];
        mockConnection.execute.mockResolvedValueOnce([mockResults]);

        const result = await originalDB.query(
          mockConnection,
          "SELECT * FROM test",
        );

        expect(result).toEqual(mockResults);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT * FROM test",
          undefined,
        );
      });
    });

    describe("getID", () => {
      test("finds and returns ID", async () => {
        mockConnection.execute.mockResolvedValueOnce([[{ id: 42 }]]);

        const result = await originalDB.getID(
          mockConnection,
          "name",
          "testValue",
          "testTable",
        );

        expect(result).toBe(42);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT id FROM testTable WHERE name=?",
          ["testValue"],
        );
      });

      test("throws Error when ID not found", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]);

        await expect(
          originalDB.getID(mockConnection, "name", "notFound", "testTable"),
        ).rejects.toThrow("No ID found");
      });
    });

    describe("getOffset", () => {
      test("computes correct offset for page 1", () => {
        const result = originalDB.getOffset(1, 10);
        expect(result).toBe(0);
      });

      test("computes correct offset for page 2", () => {
        const result = originalDB.getOffset(2, 10);
        expect(result).toBe(10);
      });

      test("computes correct offset for page 3", () => {
        const result = originalDB.getOffset(3, 20);
        expect(result).toBe(40);
      });
    });

    describe("getTokenSignature", () => {
      test("returns third part of token", () => {
        const result = originalDB.getTokenSignature("header.payload.signature");
        expect(result).toBe("signature");
      });

      test("returns empty string for short tokens", () => {
        const result = originalDB.getTokenSignature("short");
        expect(result).toBe("");
      });

      test("returns empty string for two-part tokens", () => {
        const result = originalDB.getTokenSignature("header.payload");
        expect(result).toBe("");
      });
    });
  });

  // ====================================================================
  // INITIALIZATION METHODS TESTS
  // ====================================================================
  describe("Initialization Methods", () => {
    describe("checkDatabaseExists", () => {
      test("returns true when database exists", async () => {
        mockConnection.execute.mockResolvedValueOnce([
          [{ SCHEMA_NAME: "testdb" }],
        ]);

        const result = await originalDB.checkDatabaseExists(mockConnection);

        expect(result).toBe(true);
        expect(mockConnection.execute).toHaveBeenCalledWith(
          "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?",
          ["testdb"],
        );
      });

      test("returns false when database does not exist", async () => {
        mockConnection.execute.mockResolvedValueOnce([[]]);

        const result = await originalDB.checkDatabaseExists(mockConnection);

        expect(result).toBe(false);
      });
    });

    describe("initializeDatabase", () => {
      test("creates database if not exists and tables", async () => {
        const mockDbModel = require("../src/database/dbModel.js");
        mockDbModel.tableCreateStatements = [
          "CREATE TABLE IF NOT EXISTS test1",
          "CREATE TABLE IF NOT EXISTS test2",
        ];

        const localConnection = { ...mockConnection };
        mockMysql.createConnection.mockResolvedValueOnce(localConnection);
        localConnection.execute.mockResolvedValueOnce([[]]); // checkDatabaseExists - false
        localConnection.query
          .mockResolvedValueOnce([{}]) // CREATE DATABASE
          .mockResolvedValueOnce([{}]) // USE database
          .mockResolvedValueOnce([{}]) // CREATE TABLE 1
          .mockResolvedValueOnce([{}]); // CREATE TABLE 2

        await originalDB.initializeDatabase();

        expect(localConnection.query).toHaveBeenCalledWith(
          "CREATE DATABASE IF NOT EXISTS testdb",
        );
        expect(localConnection.query).toHaveBeenCalledWith("USE testdb");
        expect(localConnection.end).toHaveBeenCalled();
      });
    });
  });
});
