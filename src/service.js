const express = require("express");
const { createAuthRouter } = require("./routes/authRouter.js");
const { createOrderRouter } = require("./routes/orderRouter.js");
const { createFranchiseRouter } = require("./routes/franchiseRouter.js");
const { createUserRouter } = require("./routes/userRouter.js");
const version = require("./version.json");

/**
 * Logs errors that reached the Express error middleware. Client errors (4xx) are
 * warn-level without stack; server errors (5xx) are error-level with stack.
 * @param {{ log: (level: string, type: string, data: object) => void }} logger
 * @param {Error & { statusCode?: number }} err
 * @param {{ originalUrl: string, method: string }} req
 */
function logRequestError(logger, err, req) {
  const statusCode = err.statusCode ?? 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const level = isClientError ? "warn" : "error";
  const errorPayload = isClientError
    ? { message: err.message, name: err.name }
    : { message: err.message, name: err.name, stack: err.stack };
  logger.log(level, "request-error", {
    path: req.originalUrl,
    method: req.method,
    statusCode,
    error: errorPayload,
  });
}
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
    logger: deps.logger,
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
    logRequestError(deps.logger, err, req);
    res
      .status(err.statusCode ?? 500)
      .json({ message: err.message, stack: err.stack });
    next();
  });

  return app;
}

module.exports = { createApp };
