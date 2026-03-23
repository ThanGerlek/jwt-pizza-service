const express = require("express");
const { createAuthRouter } = require("./routes/authRouter.js");
const { createOrderRouter } = require("./routes/orderRouter.js");
const { createFranchiseRouter } = require("./routes/franchiseRouter.js");
const { createUserRouter } = require("./routes/userRouter.js");
const version = require("./version.json");
function createApp(deps) {
  const app = express();
  const auth = createAuthRouter(deps);
  const userRouter = createUserRouter({
    db: deps.db,
    role: deps.role,
    authenticateToken: auth.authenticateToken,
    setAuth: auth.setAuth,
  });
  const orderRouter = createOrderRouter({
    db: deps.db,
    role: deps.role,
    authenticateToken: auth.authenticateToken,
    config: deps.config,
    metricsManager: deps.metricsManager,
    fetchImpl: deps.fetchImpl,
  });
  const franchiseRouter = createFranchiseRouter({
    db: deps.db,
    role: deps.role,
    authenticateToken: auth.authenticateToken,
  });

  app.use(express.json());
  app.use(auth.setAuthUser);
  app.use(deps.metricsManager.activeUserTracker);
  app.use(deps.metricsManager.requestTracker);
  app.use(deps.metricsManager.requestLatencyTracker);
  app.use(deps.logger.httpLogger);
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    next();
  });

  const apiRouter = express.Router();
  app.use("/api", apiRouter);
  apiRouter.use("/auth", auth.authRouter);
  apiRouter.use("/user", userRouter);
  apiRouter.use("/order", orderRouter);
  apiRouter.use("/franchise", franchiseRouter);

  apiRouter.use("/docs", (req, res) => {
    res.json({
      version: version.version,
      endpoints: [
        ...auth.authRouter.docs,
        ...userRouter.docs,
        ...orderRouter.docs,
        ...franchiseRouter.docs,
      ],
      config: {
        factory: deps.config.factory.url,
        db: deps.config.db.connection.host,
      },
    });
  });

  app.get("/", (req, res) => {
    res.json({
      message: "welcome to JWT Pizza",
      version: version.version,
    });
  });

  app.use("*", (req, res) => {
    res.status(404).json({
      message: "unknown endpoint",
    });
  });

  // Default error handler for all exceptions and errors.
  app.use((err, req, res, next) => {
    res
      .status(err.statusCode ?? 500)
      .json({ message: err.message, stack: err.stack });
    next();
  });

  return app;
}

module.exports = { createApp };
