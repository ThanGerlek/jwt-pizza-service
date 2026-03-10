const { stopMetrics } = require("../src/metrics");
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
});
