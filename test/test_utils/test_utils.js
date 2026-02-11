const jwt = require("jsonwebtoken");

const mockUserAdmin = {
  id: 1,
  name: "Admin",
  email: "admin@test.com",
  roles: [{ role: "admin" }],
};
const mockUserFranchisee = {
  id: 2,
  name: "Franchisee",
  email: "franchisee@test.com",
  roles: [{ role: "franchisee", objectId: 11 }],
};
const mockUserDiner = {
  id: 3,
  name: "Diner",
  email: "diner@test.com",
  roles: [{ role: "diner" }],
}

function getMockLoginAsFunc(db, mockUser) {
  return () => {
    db.isLoggedIn.mockResolvedValueOnce(true);
    jwt.verify.mockReturnValueOnce(mockUser);
    return mockUser;
  }
}

function buildMocks(db) {
  return {
    mockLoginAsAdmin: getMockLoginAsFunc(db, mockUserAdmin),
    mockLoginAsFranchisee: getMockLoginAsFunc(db, mockUserFranchisee),
    mockLoginAsDiner: getMockLoginAsFunc(db, mockUserDiner),
    mockUserAdmin,
    mockUserFranchisee,
    mockUserDiner
  }
}

module.exports = buildMocks;
