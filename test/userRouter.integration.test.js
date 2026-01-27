// Mock DB and jsonwebtoken before importing app
jest.mock("../src/database/database.js", () => ({
  Role: { Diner: "diner", Admin: "admin" },
  DB: {
    isLoggedIn: jest.fn(),
    updateUser: jest.fn(),
    loginUser: jest.fn(),
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
const app = require("../src/service");
const DBModule = require("../src/database/database.js");

describe("user routes", () => {
  beforeEach(() => {
    DBModule.DB.isLoggedIn.mockReset();
    DBModule.DB.updateUser.mockReset();
    DBModule.DB.loginUser = jest.fn();
  });

  test("GET /api/user/me returns authenticated user", async () => {
    DBModule.DB.isLoggedIn.mockResolvedValueOnce(true);
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", "Bearer tok.sig.sgn");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 1,
      name: "admin",
      email: "a@jwt.com",
    });
  });

  test("PUT /api/user/:userId returns 403 for unauthorized user", async () => {
    // user in token has id 1; attempt to update user 2 should be forbidden
    DBModule.DB.isLoggedIn.mockResolvedValueOnce(true);
    // Make the jwt verify return a non-admin user with id 1
    jwt.verify = jest.fn(() => ({
      id: 1,
      name: "user",
      email: "u@jwt.com",
      roles: [{ role: "diner" }],
    }));
    const res = await request(app)
      .put("/api/user/2")
      .set("Authorization", "Bearer tok.sig.sgn")
      .send({ name: "x" });
    expect(res.status).toBe(403);
  });

  test("PUT /api/user/:userId allows admin to update", async () => {
    DBModule.DB.isLoggedIn.mockResolvedValueOnce(true);
    DBModule.DB.updateUser.mockResolvedValueOnce({
      id: 2,
      name: "updated",
      email: "u@test.com",
      roles: [{ role: "diner" }],
    });

    // Make jwt.verify return an admin user for this request
    jwt.verify = jest.fn(() => ({
      id: 2,
      name: "admin",
      email: "a@jwt.com",
      roles: [{ role: "admin" }],
    }));

    const res = await request(app)
      .put("/api/user/2")
      .set("Authorization", "Bearer tok.sig.sgn")
      .send({ name: "updated" });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 2, name: "updated" });
    expect(res.body.token).toBe("tok.sig.sgn");
  });
});
