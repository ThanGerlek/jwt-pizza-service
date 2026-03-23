import type { Logger } from "./logger";
import type { MetricsManager } from "./metrics";
import config from "./config.js";
import jwt from "jsonwebtoken";
import dbModule from "./database/database.js";

import { GrafanaLogger } from "./logger.ts";
import { GrafanaMetricsManager } from "./metrics.ts";

type AuthJwt = {
  sign: (payload: any, secret: string) => string;
  verify: (token: string, secret: string) => any;
};
type AppFetch = typeof fetch;

export interface PizzaFactoryFacade {
  // TODO
}

export interface DatabasePort {
  isLoggedIn(token: string): Promise<boolean>;
  loginUser(userId: number, token: string): Promise<void>;
  logoutUser(token: string): Promise<void>;
  getUser(email: string, password: string): Promise<any>;
  addUser(user: any): Promise<any>;
  updateUser(
    userId: number,
    name?: string,
    email?: string,
    password?: string,
  ): Promise<any>;
  getFranchise(franchise: { id: number }): Promise<any>;
  getFranchises(
    user?: any,
    page?: any,
    limit?: any,
    name?: any,
  ): Promise<[any[], boolean]>;
  getUserFranchises(userId: number): Promise<any[]>;
  createFranchise(franchise: any): Promise<any>;
  deleteFranchise(franchiseId: number): Promise<void>;
  createStore(franchiseId: number, store: any): Promise<any>;
  deleteStore(franchiseId: number, storeId: number): Promise<void>;
  getMenu(): Promise<any>;
  addMenuItem(menuItem: any): Promise<void>;
  getOrders(user: any, page?: any): Promise<any>;
  addDinerOrder(user: any, order: any): Promise<any>;
}

export interface RolePort {
  Diner: string;
  Franchisee: string;
  Admin: string;
}

export interface Dependencies {
  logger: Logger;
  metricsManager: MetricsManager;
  pizzaFactoryFacade: PizzaFactoryFacade;
  db: DatabasePort;
  role: RolePort;
  jwt: AuthJwt;
  config: typeof config;
  fetchImpl: AppFetch;
}

function bindMetricsManager(manager: GrafanaMetricsManager): MetricsManager {
  return {
    startMetrics: manager.startMetrics.bind(manager),
    stopMetrics: manager.stopMetrics.bind(manager),
    requestTracker: manager.requestTracker.bind(manager),
    requestLatencyTracker: manager.requestLatencyTracker.bind(manager),
    activeUserTracker: manager.activeUserTracker.bind(manager),
    trackAuthAttempt: manager.trackAuthAttempt.bind(manager),
    trackPizzaCreationSuccess: manager.trackPizzaCreationSuccess.bind(manager),
    trackPizzaCreationFailure: manager.trackPizzaCreationFailure.bind(manager),
    trackPizzaCreationLatency: manager.trackPizzaCreationLatency.bind(manager),
    recordCount: manager.recordCount.bind(manager),
    recordValue: manager.recordValue.bind(manager),
  };
}

export function createProdDependencies(): Dependencies {
  return {
    logger: new GrafanaLogger(),
    metricsManager: bindMetricsManager(new GrafanaMetricsManager()),
    pizzaFactoryFacade: {},
    db: dbModule.DB as unknown as DatabasePort,
    role: dbModule.Role as RolePort,
    jwt,
    config,
    fetchImpl: globalThis.fetch.bind(globalThis),
  };
}

export function createDependencies(
  overrides: Partial<Dependencies>,
): Dependencies {
  return { ...createProdDependencies(), ...overrides };
}
