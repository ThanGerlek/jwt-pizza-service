import { Logger } from "./logger";
import { MetricsManager } from "./metrics";

export interface ServerFacade {}

export interface DependencyFactory {
  logger: Logger;
  metricsManager: MetricsManager;
  serverFacade: ServerFacade;
}
