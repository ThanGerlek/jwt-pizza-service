import type { Logger } from "./logger";
import type { MetricsManager } from "./metrics";

// @ts-ignore Runtime under --experimental-strip-types requires explicit .ts extension.
import * as loggerModule from "./logger.ts";
// @ts-ignore Runtime under --experimental-strip-types requires explicit .ts extension.
import * as metricsModule from "./metrics.ts";

export interface ServerFacade {
  // TODO
}

export interface DependencyFactory {
  logger: Logger;
  metricsManager: MetricsManager;
  serverFacade: ServerFacade;
}

function createMetricsManager(): MetricsManager {
  if (typeof metricsModule.GrafanaMetricsManager === "function") {
    const manager = new metricsModule.GrafanaMetricsManager();
    return {
      startMetrics: manager.startMetrics.bind(manager),
      stopMetrics: manager.stopMetrics.bind(manager),
      requestTracker: manager.requestTracker.bind(manager),
      requestLatencyTracker: manager.requestLatencyTracker.bind(manager),
      activeUserTracker: manager.activeUserTracker.bind(manager),
      trackAuthAttempt: manager.trackAuthAttempt.bind(manager),
      trackPizzaCreationSuccess:
        manager.trackPizzaCreationSuccess.bind(manager),
      trackPizzaCreationFailure:
        manager.trackPizzaCreationFailure.bind(manager),
      trackPizzaCreationLatency:
        manager.trackPizzaCreationLatency.bind(manager),
      recordCount: manager.recordCount.bind(manager),
      recordValue: manager.recordValue.bind(manager),
    };
  }

  return {
    startMetrics: metricsModule.startMetrics,
    stopMetrics: metricsModule.stopMetrics,
    requestTracker: metricsModule.requestTracker,
    requestLatencyTracker: metricsModule.requestLatencyTracker,
    activeUserTracker: metricsModule.activeUserTracker,
    trackAuthAttempt: metricsModule.trackAuthAttempt,
    trackPizzaCreationSuccess: metricsModule.trackPizzaCreationSuccess,
    trackPizzaCreationFailure: metricsModule.trackPizzaCreationFailure,
    trackPizzaCreationLatency: metricsModule.trackPizzaCreationLatency,
    recordCount: () => {},
    recordValue: () => {},
  };
}

export const dependencyFactory: DependencyFactory = {
  logger: new loggerModule.GrafanaLogger(),
  metricsManager: createMetricsManager(),
  serverFacade: {},
};
