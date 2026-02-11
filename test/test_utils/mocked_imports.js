function setupMocks() {
  // Mock DB and jsonwebtoken before importing app
  jest.mock("../../src/database/database.js", () => ({
    Role: { Diner: "diner", Admin: "admin" },
    DB: {
      isLoggedIn: jest.fn(),
      loginUser: jest.fn(),
      logoutUser: jest.fn(),

      getUser: jest.fn(),
      addUser: jest.fn(),
      updateUser: jest.fn(),

      getFranchise: jest.fn(),
      getFranchises: jest.fn(),
      getUserFranchises: jest.fn(),
      createFranchise: jest.fn(),
      deleteFranchise: jest.fn(),
      createStore: jest.fn(),
      deleteStore: jest.fn(),

      getMenu: jest.fn(),
      addMenuItem: jest.fn(),
      getOrders: jest.fn(),
      addDinerOrder: jest.fn(),
    },
  }));
  
  // Provide a jwt mock whose verify can be reconfigured within tests
  jest.mock("jsonwebtoken", () => ({
      sign: jest.fn(() => "tok.sig.sgn"),
      verify: jest.fn(() => ({
          id: 1,
          name: "admin",
          email: "a@jwt.com",
          roles: [{ role: "admin" }],
        })),
      }));
      const jwt = require("jsonwebtoken");
      
      const request = require("supertest");
      const app = require("../../src/service");
  const { DB } = require("../../src/database/database.js");
  return { request, app, DB, jwt };
}

module.exports = { setupMocks };
