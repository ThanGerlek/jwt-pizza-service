const { stopMetrics } = require("../src/metrics");
const { setupMocks } = require("./test_utils/mocked_imports");
const buildMocks = require("./test_utils/test_utils");
const { request, app, DB, jwt } = setupMocks();

const { mockLoginAsAdmin, mockLoginAsDiner } = buildMocks(DB, jwt);

describe("user routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    stopMetrics();
  });

  test("GET /api/user/me returns authenticated user", async () => {
    const userData = mockLoginAsDiner();
    const res = await request(app)
      .get("/api/user/me")
      .set("Authorization", "Bearer tok.sig.sgn");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: userData.id,
      name: userData.name,
      email: userData.email,
    });
  });

  test("PUT /api/user/:userId returns 403 for unauthorized user", async () => {
    // user in token has id 1; attempt to update user 2 should be forbidden
    const userData = mockLoginAsDiner();
    const wrongUserId = userData.id + 1;

    const res = await request(app)
      .put(`/api/user/${wrongUserId}`)
      .set("Authorization", "Bearer tok.sig.sgn")
      .send({ name: "x" });
    expect(res.status).toBe(403);
  });

  test("PUT /api/user/:userId allows admin to update", async () => {
    const userData = mockLoginAsAdmin();
    const updatedName = userData.name + "_UPDATED";
    DB.updateUser.mockResolvedValueOnce({ ...userData, name: updatedName });

    const res = await request(app)
      .put(`/api/user/${userData.id}`)
      .set("Authorization", "Bearer tok.sig.sgn")
      .send({ name: updatedName });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userData.id, name: updatedName });
    expect(res.body.token).toBe("tok.sig.sgn");
  });
});
