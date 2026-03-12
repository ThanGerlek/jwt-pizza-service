import config from "./config.js";
import os from "os";

const { metrics } = config;

type MetricType = "gauge" | "sum";
type MetricUnit = "1" | "%" | "s" | "By" | "MiBy" | "ms";

interface AttributeValue {
  stringValue?: string;
  intValue?: string;
  doubleValue?: number;
}

interface Attribute {
  key: string;
  value: AttributeValue;
}

interface DataPoint {
  asInt?: number;
  asDouble?: number;
  timeUnixNano: number;
  attributes?: Attribute[];
}

interface GaugeData {
  dataPoints: DataPoint[];
}

interface SumData {
  dataPoints: DataPoint[];
  aggregationTemporality?: string;
  isMonotonic?: boolean;
}

interface MetricEntry {
  name: string;
  unit: MetricUnit;
  gauge?: GaugeData;
  sum?: SumData;
}

interface OtelPayload {
  resourceMetrics: Array<{
    scopeMetrics: Array<{
      metrics: MetricEntry[];
    }>;
  }>;
}

const DEFAULT_FLUSH_INTERVAL_MS = (metrics as any)?.flushIntervalMs ?? 10_000;
const DEFAULT_MAX_BATCH_SIZE = (metrics as any)?.maxBatchSize ?? 1000;

interface PeriodicTracker {
  fn: () => void;
  intervalMs: number;
  runOnStart: boolean;
}

let metricsTrackers: PeriodicTracker[] = [];
let trackerIntervals: ReturnType<typeof setInterval>[] = [];
let flushIntervalId: ReturnType<typeof setInterval> | null = null;

let pendingMetricEntries: MetricEntry[] = [];

function registerPeriodicMetricsTracker(
  trackerFn: () => void,
  intervalMs: number,
  runOnStart = true,
): void {
  metricsTrackers.push({
    fn: trackerFn,
    intervalMs,
    runOnStart,
  });
}

function startMetrics(): void {
  // Set up per-tracker intervals
  metricsTrackers.forEach((tracker) => {
    if (tracker.runOnStart) {
      tracker.fn();
    }

    const intervalId = setInterval(tracker.fn, tracker.intervalMs);
    trackerIntervals.push(intervalId);
  });

  // Separate flush loop so batching cadence is decoupled from collection cadence.
  if (!flushIntervalId) {
    flushIntervalId = setInterval(() => {
      flushMetricsBatch();
    }, DEFAULT_FLUSH_INTERVAL_MS);
  }
}

function stopMetrics(): void {
  trackerIntervals.forEach((intervalId) => {
    clearInterval(intervalId);
  });
  trackerIntervals = [];

  if (flushIntervalId) {
    clearInterval(flushIntervalId);
    flushIntervalId = null;
  }

  // Ensure any queued metrics are sent once on shutdown.
  flushMetricsBatch();
}

// Hardware metrics

function getCpuUsagePercentage(): number {
  const cpuUsage = (os.loadavg()[0] ?? 0) / os.cpus().length;
  return cpuUsage * 100;
}

function getMemoryUsagePercentage(): number {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage;
}

registerPeriodicMetricsTracker(() => {
  recordValue("cpu", getCpuUsagePercentage(), "gauge", "%");
  recordValue("memory", getMemoryUsagePercentage(), "gauge", "%");
}, 1000);

// HTTP metrics

const requests: Record<string, number> = {};
interface CumulativeMetricState {
  metricName: string;
  value: number;
  attributes: Record<string, string> | undefined;
}

const cumulativeMetrics: Record<string, CumulativeMetricState> = {};

function requestTracker(
  req: { method: string; path: string },
  res: unknown,
  next: () => void,
): void {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] ?? 0) + 1;

  recordCount("http_requests_total", {
    method: req.method,
    path: req.path,
  });

  next();
}

function trackAuthAttempt(success: boolean): void {
  recordCount("auth_attempts_total", {
    outcome: success ? "success" : "failure",
  });
}

/** Record one occurrence of a counter identified by name and attributes. */
function recordCount(name: string, attributes?: Record<string, string>): void {
  const key = buildCumulativeMetricKey(name, attributes);
  const current = cumulativeMetrics[key];
  const value = (current?.value ?? 0) + 1;
  cumulativeMetrics[key] = { metricName: name, value, attributes };
}

function buildCumulativeMetricKey(
  metricName: string,
  attributes?: Record<string, string>,
): string {
  if (!attributes) {
    return metricName;
  }
  const sortedEntries = Object.entries(attributes).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `${metricName}|${JSON.stringify(sortedEntries)}`;
}

function enqueueMetric(
  metricName: string,
  metricValue: number,
  type: MetricType,
  unit: MetricUnit,
  attributes?: Record<string, string>,
): void {
  const metricEntry: MetricEntry = {
    name: metricName,
    unit,
    [type]: {
      dataPoints: [
        ((): DataPoint => {
          const point: DataPoint = {
            ...(type === "sum"
              ? { asInt: Math.trunc(metricValue) }
              : { asDouble: metricValue }),
            timeUnixNano: Date.now() * 1000000,
          };

          if (attributes && Object.keys(attributes).length > 0) {
            point.attributes = Object.entries(attributes).map(
              ([key, value]) => ({
                key,
                value: { stringValue: value },
              }),
            );
          }

          return point;
        })(),
      ],
    },
  };

  if (type === "sum") {
    const sumData = metricEntry[type] as SumData;
    sumData.aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";
    sumData.isMonotonic = true;
  }

  pendingMetricEntries.push(metricEntry);

  if (pendingMetricEntries.length >= DEFAULT_MAX_BATCH_SIZE) {
    flushMetricsBatch();
  }
}

function flushMetricsBatch(): void {
  if (
    pendingMetricEntries.length === 0 &&
    Object.keys(cumulativeMetrics).length === 0
  ) {
    return;
  }

  const entriesToSend: MetricEntry[] = [...pendingMetricEntries];
  pendingMetricEntries = [];

  // Add cumulative metrics as single entries per key
  for (const { metricName, value, attributes } of Object.values(
    cumulativeMetrics,
  )) {
    enqueueMetric(metricName, value, "sum", "1", attributes);
  }

  // Move any metrics that were enqueued during this flush into the batch to send now.
  entriesToSend.push(...pendingMetricEntries);
  pendingMetricEntries = [];

  const otelPayload: OtelPayload = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: entriesToSend,
          },
        ],
      },
    ],
  };

  const body = JSON.stringify(otelPayload);

  fetch(`${metrics.endpointUrl}`, {
    method: "POST",
    body,
    headers: {
      Authorization: `Bearer ${metrics.accountId}:${metrics.apiKey}`,
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (!response.ok) {
        response.text().then((text) => {
          console.error(
            `Failed to push metrics data to Grafana: ${text}\n${body}`,
          );
        });
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

/** Record a gauge or sum value (one observation per call). */
function recordValue(
  name: string,
  value: number,
  type: MetricType,
  unit: MetricUnit,
  attributes?: Record<string, string>,
): void {
  enqueueMetric(name, value, type, unit, attributes);
}

export {
  recordCount,
  recordValue,
  requestTracker,
  startMetrics,
  stopMetrics,
  trackAuthAttempt,
};
