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

let metricsTrackers: { trackerFn: () => void; delay: number }[] = [];
let metricsIntervals: ReturnType<typeof setInterval>[] = [];

function registerMetricsTracker(trackerFn: () => void, delay: number): void {
  metricsTrackers.push({ trackerFn, delay });
}

function startMetrics(): void {
  metricsIntervals = metricsTrackers.map((pair) =>
    setInterval(pair.trackerFn, pair.delay),
  );
}

function stopMetrics(): void {
  metricsIntervals.forEach((intervalId) => {
    clearInterval(intervalId);
  });
  metricsIntervals = [];
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

registerMetricsTracker(() => {
  sendMetricToGrafana("cpu", getCpuUsagePercentage(), "gauge", "%");
  sendMetricToGrafana("memory", getMemoryUsagePercentage(), "gauge", "%");
}, 1000);

// HTTP metrics

const requests: Record<string, number> = {};
const stringMetrics: Record<string, number> = {};

function requestTracker(
  req: { method: string; path: string },
  res: unknown,
  next: () => void,
): void {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] ?? 0) + 1;

  // Generic string metric that can be grouped by attributes later in Grafana
  sendStringMetric("http_requests_total", {
    method: req.method,
    path: req.path,
  });

  next();
}

function sendStringMetric(
  metricName: string,
  attributes?: Record<string, string>,
): void {
  const key = buildMetricKey(metricName, attributes);
  stringMetrics[key] = (stringMetrics[key] ?? 0) + 1;
  const value = stringMetrics[key];
  console.log(
    `Sent string metric: '${metricName}' -> ${value} ${JSON.stringify(attributes ?? {})}`,
  );
  sendMetricToGrafana(metricName, value, "sum", "1", attributes);
}

function buildMetricKey(
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

function sendMetricToGrafana(
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
  const otelPayload: OtelPayload = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics: [metricEntry],
          },
        ],
      },
    ],
  };

  if (type === "sum") {
    const sumData = metricEntry[type] as SumData;
    sumData.aggregationTemporality = "AGGREGATION_TEMPORALITY_CUMULATIVE";
    sumData.isMonotonic = true;
  }

  const body = JSON.stringify(otelPayload);
  fetch(`${metrics.endpointUrl}`, {
    method: "POST",
    body: body,
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

export { requestTracker, startMetrics, stopMetrics };
