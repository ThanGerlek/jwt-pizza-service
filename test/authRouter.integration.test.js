jest.mock("../src/metrics", () => ({
  trackAuthAttempt: jest.fn(),
  requestTracker: (req, res, next) => next(),
  startMetrics: jest.fn(),
  stopMetrics: jest.fn(),
  recordCount: jest.fn(),
  recordValue: jest.fn(),
}));

const { trackAuthAttempt, stopMetrics } = require("../src/metrics");
const { setupMocks } = require("./test_utils/mocked_imports");
const { request, app, DB } = setupMocks();

describe("auth routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopMetrics();
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

  test("successful login as diner records auth success in metrics", async () => {
    DB.getUser.mockResolvedValueOnce({
      id: 5,
      name: "diner",
      email: "d@test.com",
      roles: [{ role: "diner" }],
    });
    DB.loginUser.mockResolvedValueOnce();

    await request(app).put("/api/auth").send({
      email: "d@test.com",
      password: "pw",
    });

    expect(trackAuthAttempt).toHaveBeenCalledTimes(1);
    expect(trackAuthAttempt).toHaveBeenCalledWith(true);
  });

  test("successful login as franchisee records auth success in metrics", async () => {
    DB.getUser.mockResolvedValueOnce({
      id: 6,
      name: "franchisee",
      email: "f@test.com",
      roles: [{ role: "franchisee", objectId: 1 }],
    });
    DB.loginUser.mockResolvedValueOnce();

    await request(app).put("/api/auth").send({
      email: "f@test.com",
      password: "pw",
    });

    expect(trackAuthAttempt).toHaveBeenCalledTimes(1);
    expect(trackAuthAttempt).toHaveBeenCalledWith(true);
  });

  test("successful login as admin records auth success in metrics", async () => {
    DB.getUser.mockResolvedValueOnce({
      id: 7,
      name: "admin",
      email: "a@test.com",
      roles: [{ role: "admin" }],
    });
    DB.loginUser.mockResolvedValueOnce();

    await request(app).put("/api/auth").send({
      email: "a@test.com",
      password: "pw",
    });

    expect(trackAuthAttempt).toHaveBeenCalledTimes(1);
    expect(trackAuthAttempt).toHaveBeenCalledWith(true);
  });

  test("failed login records auth failure in metrics", async () => {
    DB.getUser.mockRejectedValueOnce(new Error("Invalid credentials"));

    await request(app).put("/api/auth").send({
      email: "unknown@test.com",
      password: "wrong",
    });

    expect(trackAuthAttempt).toHaveBeenCalledTimes(1);
    expect(trackAuthAttempt).toHaveBeenCalledWith(false);
  });
});
