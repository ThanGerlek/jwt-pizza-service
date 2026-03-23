const { createApp } = require("../../src/service.js");
const config = require("../../src/config.js");

const passThroughMiddleware = (req, res, next) => next();

function makeTestDeps(overrides = {}) {
  const db = {
    isLoggedIn: jest.fn(),
    loginUser: jest.fn(),
    logoutUser: jest.fn(),
    getUser: jest.fn(),
    addUser: jest.fn(),
    updateUser: jest.fn(),
    getFranchise: jest.fn(),
    getFranchises: jest.fn(),
    getUserFranchises: jest.fn(),
    createFranchise: jest.fn(),
    deleteFranchise: jest.fn(),
    createStore: jest.fn(),
    deleteStore: jest.fn(),
    getMenu: jest.fn(),
    addMenuItem: jest.fn(),
    getOrders: jest.fn(),
    addDinerOrder: jest.fn(),
  };

  const metricsManager = {
    activeUserTracker: passThroughMiddleware,
    requestTracker: passThroughMiddleware,
    requestLatencyTracker: passThroughMiddleware,
    startMetrics: jest.fn(),
    stopMetrics: jest.fn(),
    trackAuthAttempt: jest.fn(),
    trackPizzaCreationSuccess: jest.fn(),
    trackPizzaCreationFailure: jest.fn(),
    trackPizzaCreationLatency: jest.fn(),
    recordCount: jest.fn(),
    recordValue: jest.fn(),
  };

  const jwt = {
    sign: jest.fn(() => "tok.sig.sgn"),
    verify: jest.fn(() => ({
      id: 1,
      name: "admin",
      email: "a@jwt.com",
      roles: [{ role: "admin" }],
    })),
  };

  const deps = {
    db,
    role: { Diner: "diner", Admin: "admin", Franchisee: "franchisee" },
    jwt,
    config,
    metricsManager,
    logger: {
      httpLogger: passThroughMiddleware,
      log: jest.fn(),
    },
    fetchImpl: jest.fn(),
    serverFacade: {},
    ...overrides,
  };

  return deps;
}

function makeTestApp(overrides = {}) {
  const request = require("supertest");
  const deps = makeTestDeps(overrides);
  const app = createApp(deps);
  return { request, app, deps };
}

module.exports = { makeTestDeps, makeTestApp };
