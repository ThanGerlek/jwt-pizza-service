const { makeTestApp } = require("./test_utils/mocked_imports");
const buildMocks = require("./test_utils/test_utils");

describe("user routes", () => {
  let request;
  let app;
  let deps;
  let mockLoginAsAdmin;
  let mockLoginAsDiner;

  beforeEach(() => {
    ({ request, app, deps } = makeTestApp());
    ({ mockLoginAsAdmin, mockLoginAsDiner } = buildMocks(deps.db, deps.jwt));
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
    deps.db.updateUser.mockResolvedValueOnce({
      ...userData,
      name: updatedName,
    });

    const res = await request(app)
      .put(`/api/user/${userData.id}`)
      .set("Authorization", "Bearer tok.sig.sgn")
      .send({ name: updatedName });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: userData.id, name: updatedName });
    expect(res.body.token).toBe("tok.sig.sgn");
  });

  test("PUT admin updating another user returns user without new token", async () => {
    mockLoginAsAdmin();
    const otherUser = {
      id: 99,
      name: "Other",
      email: "other@test.com",
      roles: [{ role: "diner" }],
    };
    deps.db.updateUser.mockResolvedValueOnce(otherUser);

    const res = await request(app)
      .put("/api/user/99")
      .set("Authorization", "Bearer tok.sig.sgn")
      .send({ name: "Other" });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 99, name: "Other" });
    expect(res.body).not.toHaveProperty("token");
  });
});
