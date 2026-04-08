const express = require("express");
const { asyncHandler } = require("../endpointHelper.js");
const docs = [
  {
    method: "POST",
    path: "/api/auth",
    description: "Register a new user",
    example: `curl -X POST localhost:3000/api/auth -d '{"name":"pizza diner", "email":"d@jwt.com", "password":"diner"}' -H 'Content-Type: application/json'`,
    response: {
      user: {
        id: 2,
        name: "pizza diner",
        email: "d@jwt.com",
        roles: [{ role: "diner" }],
      },
      token: "tttttt",
    },
  },
  {
    method: "PUT",
    path: "/api/auth",
    description: "Login existing user",
    example: `curl -X PUT localhost:3000/api/auth -d '{"email":"a@jwt.com", "password":"admin"}' -H 'Content-Type: application/json'`,
    response: {
      user: {
        id: 1,
        name: "常用名字",
        email: "a@jwt.com",
        roles: [{ role: "admin" }],
      },
      token: "tttttt",
    },
  },
  {
    method: "DELETE",
    path: "/api/auth",
    requiresAuth: true,
    description: "Logout a user",
    example: `curl -X DELETE localhost:3000/api/auth -H 'Authorization: Bearer tttttt'`,
    response: { message: "logout successful" },
  },
];

function createAuthRouter(deps) {
  const { db, role, jwt, config, metricsManager, logger } = deps;
  const authRouter = express.Router();
  authRouter.docs = docs;

  async function setAuthUser(req, res, next) {
    const token = readAuthToken(req);
    if (token) {
      try {
        if (await db.isLoggedIn(token)) {
          // Check the database to make sure the token is valid.
          req.user = jwt.verify(token, config.jwtSecret, {
            algorithms: ["HS256"],
          });
          req.user.isRole = (targetRole) =>
            !!req.user.roles.find((r) => r.role === targetRole);
        }
      } catch {
        req.user = null;
      }
    }
    next();
  }

  const authenticateToken = (req, res, next) => {
    if (!req.user) {
      logger.log("warn", "auth-unauthorized", {
        path: req.originalUrl,
        method: req.method,
        statusCode: 401,
        message: "unauthorized",
      });
      return res.status(401).send({ message: "unauthorized" });
    }
    next();
  };

  // register
  authRouter.post(
    "/",
    asyncHandler(async (req, res) => {
      const { name, email, password } = req.body;
      if (!name || !email || !password) {
        return res
          .status(400)
          .json({ message: "name, email, and password are required" });
      }
      const user = await db.addUser({
        name,
        email,
        password,
        roles: [{ role: role.Diner }],
      });
      const auth = await setAuth(user);
      res.json({ user: user, token: auth });
    }),
  );

  // login
  authRouter.put(
    "/",
    asyncHandler(async (req, res) => {
      const { email, password } = req.body;
      try {
        const user = await db.getUser(email, password);
        const auth = await setAuth(user);
        metricsManager.trackAuthAttempt(true);
        res.json({ user: user, token: auth });
      } catch (err) {
        metricsManager.trackAuthAttempt(false);
        throw err;
      }
    }),
  );

  // logout
  authRouter.delete(
    "/",
    authenticateToken,
    asyncHandler(async (req, res) => {
      await clearAuth(req);
      res.json({ message: "logout successful" });
    }),
  );

  async function setAuth(user) {
    const token = jwt.sign(user, config.jwtSecret, { algorithm: "HS256" });
    await db.loginUser(user.id, token);
    return token;
  }

  async function clearAuth(req) {
    const token = readAuthToken(req);
    if (token) {
      await db.logoutUser(token);
    }
  }

  return { authRouter, setAuthUser, setAuth, authenticateToken };
}

function readAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }
  const parts = authHeader.split(/\s+/);
  if (parts.length < 2 || parts[0] !== "Bearer") {
    return null;
  }
  const token = parts[1];
  return (typeof token === "string" && token.length > 0) ? token : null;
}

module.exports = { createAuthRouter };
