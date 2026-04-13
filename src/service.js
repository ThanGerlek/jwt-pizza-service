const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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

function createCorsMiddleware() {
  return (req, res, next) => {
    const raw = process.env.CORS_ALLOWED_ORIGINS || "";
    const allowedOrigins = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const origin = req.headers.origin;

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS",
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization",
    );

    if (allowedOrigins.length > 0) {
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Credentials", "true");
      }
    } else {
      // Do not reflect arbitrary Origins with credentials (unsafe). Bearer APIs
      // typically need * without credentials, or an explicit allowlist above.
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  };
}

function createApp(deps) {
  const app = express();
  if (process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", 1);
  }

  app.use(helmet());
  app.use(express.json({ limit: "256kb" }));

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

  app.use(auth.setAuthUser);
  app.use(deps.metricsManager.activeUserTracker);
  app.use(deps.metricsManager.requestTracker);
  app.use(deps.metricsManager.requestLatencyTracker);
  app.use(deps.logger.httpLogger);
  app.use(createCorsMiddleware());

  const authLimiter = rateLimit({
    windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 100),
    standardHeaders: true,
    legacyHeaders: false,
  });
  // const isAuthRateLimitDisabled = process.env.AUTH_RATE_LIMIT_DISABLED === "true";
  const isAuthRateLimitDisabled = false;

  const apiRouter = express.Router();
  app.use("/api", apiRouter);
  apiRouter.use(
    "/auth",
    ...(isAuthRateLimitDisabled ? [] : [authLimiter]),
    auth.authRouter,
  );
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

  const exposeErrorDetails =
    process.env.EXPOSE_ERROR_DETAILS === "true" ||
    (process.env.NODE_ENV !== "production" &&
      process.env.EXPOSE_ERROR_DETAILS !== "false");

  app.use((err, req, res, next) => {
    logRequestError(deps.logger, err, req);
    const statusCode = err.statusCode ?? 500;
    const body = { message: err.message };
    if (exposeErrorDetails && err.stack) {
      body.stack = err.stack;
    }
    if (!exposeErrorDetails && statusCode >= 500) {
      body.message = "internal server error";
    }
    res.status(statusCode).json(body);
    next();
  });

  return app;
}

module.exports = { createApp };
