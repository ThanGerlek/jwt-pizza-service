// Prevent DB initialization during tests by mocking before importing app
jest.mock("../src/database/database.js", () => ({
  Role: { Diner: "diner" },
  DB: {
    isLoggedIn: jest.fn(),
    addUser: jest.fn(),
    getUser: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
  },
}));

// Mock jsonwebtoken so tokens are deterministic
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "tok.sig.sgn"),
  verify: jest.fn(() => ({
    id: 2,
    name: "pizza diner",
    email: "x@test.com",
    roles: [{ role: "diner" }],
  })),
}));

const request = require("supertest");
const app = require("../src/service");
const { DB } = require("../src/database/database.js");

describe("auth routes", () => {
  beforeEach(() => {
    DB.isLoggedIn.mockReset();
    DB.addUser.mockReset();
    DB.getUser.mockReset();
    DB.loginUser.mockReset();
    DB.logoutUser.mockReset();
  });

  test("register POST /api/auth returns user and token", async () => {
    const testUser = {
      name: "pizza diner",
      email: "r@test.com",
      password: "pw",
    };
    DB.addUser.mockResolvedValueOnce({
      id: 3,
      name: testUser.name,
      email: testUser.email,
      roles: [{ role: "diner" }],
    });
    DB.loginUser.mockResolvedValueOnce();

    const res = await request(app).post("/api/auth").send(testUser);
    expect(res.status).toBe(200);
    expect(res.body.token).toBe("tok.sig.sgn");
    expect(res.body.user).toMatchObject({
      id: 3,
      name: testUser.name,
      email: testUser.email,
      roles: [{ role: "diner" }],
    });
    expect(res.body.user.password).toBeUndefined();
  });

  test("login PUT /api/auth returns user and token", async () => {
    const testUser = { email: "l@test.com", password: "pw" };
    DB.getUser.mockResolvedValueOnce({
      id: 4,
      name: "login",
      email: testUser.email,
      roles: [{ role: "diner" }],
    });
    DB.loginUser.mockResolvedValueOnce();

    const res = await request(app).put("/api/auth").send(testUser);
    expect(res.status).toBe(200);
    expect(res.body.token).toBe("tok.sig.sgn");
    expect(res.body.user).toMatchObject({ id: 4, email: testUser.email });
  });

  test("logout DELETE /api/auth requires auth and logs out", async () => {
    DB.isLoggedIn.mockResolvedValueOnce(true);
    DB.logoutUser.mockResolvedValueOnce();

    const res = await request(app)
      .delete("/api/auth")
      .set("Authorization", "Bearer tok.sig.sgn");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ message: "logout successful" });
    expect(DB.logoutUser).toHaveBeenCalled();
  });
});
