import { GrafanaLogger, Logger } from "./logger";
import { GrafanaMetricsManager, MetricsManager } from "./metrics";

export interface ServerFacade {
  // TODO
}

export interface DependencyFactory {
  logger: Logger;
  metricsManager: MetricsManager;
  serverFacade: ServerFacade;
}

export const dependencyFactory: DependencyFactory = {
  logger: new GrafanaLogger(),
  metricsManager: new GrafanaMetricsManager(),
  serverFacade: {},
};
