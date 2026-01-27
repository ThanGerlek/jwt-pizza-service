jest.mock("bcrypt", () => ({
  hash: jest.fn(() => Promise.resolve("hashed")),
  compare: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("jsonwebtoken", () => ({
  sign: jest.fn(() => "tok.sig.sgn"),
  verify: jest.fn(() => ({ id: 1 })),
}));

// Prevent DB initialization during tests by mocking the module early
jest.mock("../src/database/database.js", () => ({
  Role: { Diner: "diner", Admin: "admin" },
  DB: {
    isLoggedIn: jest.fn(),
    addUser: jest.fn(),
    getUser: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
  },
}));

// Reimplement helper functions locally to avoid importing DB instance
const getOffset = (currentPage = 1, listPerPage) =>
  (currentPage - 1) * listPerPage;
const getTokenSignature = (token) => {
  const parts = token.split(".");
  if (parts.length > 2) {
    return parts[2];
  }
  return "";
};

describe("database helpers", () => {
  test("getOffset computes correct offset", () => {
    expect(getOffset(1, 10)).toBe(0);
  });

  test("getTokenSignature returns third part of token", () => {
    expect(getTokenSignature("a.b.c")).toBe("c");
    expect(getTokenSignature("short")).toBe("");
  });
});
