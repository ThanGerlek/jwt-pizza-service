const express = require("express");
const request = require("supertest");
const { GrafanaLogger } = require("../src/logger.ts");
const { makeTestApp } = require("./test_utils/mocked_imports");

describe("GrafanaLogger httpLogger", () => {
  test("logs method, path, status, auth flag, request body, and response body", async () => {
    const logger = new GrafanaLogger();
    const logSpy = jest.spyOn(logger, "log").mockImplementation(() => {});

    const app = express();
    app.use(express.json());
    app.use(logger.httpLogger);
    app.post("/example", (req, res) => {
      res.status(201).json({ ok: true, echoed: req.body.value });
    });

    const res = await request(app)
      .post("/example")
      .set("Authorization", "Bearer token")
      .send({ value: "abc", password: "secret" });

    expect(res.status).toBe(201);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "info",
      "http",
      expect.objectContaining({
        method: "POST",
        path: "/example",
        statusCode: 201,
        hasAuthorizationHeader: true,
        requestBody: { value: "abc", password: "secret" },
        responseBody: '{"ok":true,"echoed":"abc"}',
      }),
    );
  });

  test("logs error responses and missing authorization/body correctly", async () => {
    const logger = new GrafanaLogger();
    const logSpy = jest.spyOn(logger, "log").mockImplementation(() => {});

    const app = express();
    app.use(express.json());
    app.use(logger.httpLogger);
    app.get("/fail", (_req, res) => {
      res.status(401).json({ message: "unauthorized" });
    });

    const res = await request(app).get("/fail");

    expect(res.status).toBe(401);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith(
      "warn",
      "http",
      expect.objectContaining({
        method: "GET",
        path: "/fail",
        statusCode: 401,
        hasAuthorizationHeader: false,
        requestBody: {},
        responseBody: '{"message":"unauthorized"}',
      }),
    );
  });
});

describe("GrafanaLogger sanitization", () => {
  test("redacts confidential fields in nested logs", () => {
    const logger = new GrafanaLogger();
    const sendSpy = jest
      .spyOn(logger, "sendLogToGrafana")
      .mockImplementation(() => {});

    logger.log("info", "security", {
      password: "secret-password",
      token: "tok.sig.sgn",
      nested: {
        authorization: "Bearer secret-token",
        apiKey: "secret-factory-api-key",
        jwt: "secret-jwt-value",
      },
    });

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [event] = sendSpy.mock.calls[0];
    const logLine = event.streams[0].values[0][1];
    expect(logLine).toContain('"password":"*****"');
    expect(logLine).toContain('"token":"*****"');
    expect(logLine).toContain('"apiKey":"*****"');
    expect(logLine).toContain('"jwt":"*****"');
    expect(logLine).toContain('"authorization":"Bearer *****"');
    expect(logLine).not.toContain("secret");
  });
});

describe("Service wiring", () => {
  test("uses global logger middleware for routes", async () => {
    const httpLogger = jest.fn((req, _res, next) => next());
    const { request: appRequest, app } = makeTestApp({
      logger: { httpLogger, log: jest.fn() },
    });

    const res = await appRequest(app).get("/api/docs");

    expect(res.status).toBe(200);
    expect(httpLogger).toHaveBeenCalled();
  });
});
