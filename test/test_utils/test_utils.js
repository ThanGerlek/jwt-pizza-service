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

function buildMocks(db, jwt) {
  function getMockLoginAsFunc(mockUser) {
    return () => {
      db.isLoggedIn.mockResolvedValueOnce(true);
      jwt.verify.mockReturnValueOnce(mockUser);
      return mockUser;
    }
  }

  return {
    mockLoginAsAdmin: getMockLoginAsFunc(mockUserAdmin),
    mockLoginAsFranchisee: getMockLoginAsFunc(mockUserFranchisee),
    mockLoginAsDiner: getMockLoginAsFunc(mockUserDiner),
    mockUserAdmin,
    mockUserFranchisee,
    mockUserDiner
  }
}

module.exports = buildMocks;
