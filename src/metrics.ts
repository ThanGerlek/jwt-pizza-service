import config from "./config.js";
import os from "os";

const { metrics } = config;

type MetricType = "gauge" | "sum";
type MetricUnit = "1" | "%" | "ms";

interface DataPoint {
  asInt: number;
  timeUnixNano: number;
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

let metricsTrackers: {trackerFn: () => void, delay: number}[] = [];
let metricsIntervals: ReturnType<typeof setInterval>[] = [];

function registerMetricsTracker(trackerFn: () => void, delay: number): void {
  metricsTrackers.push({ trackerFn, delay });
}

function startMetrics(): void {
  metricsIntervals = metricsTrackers.map((pair) =>
    setInterval(pair.trackerFn, pair.delay)
  );
}

function stopMetrics(): void {
  metricsIntervals.forEach((intervalId) => {
    clearInterval(intervalId);
  });
  metricsIntervals = [];
}

// Hardware metrics

function getCpuUsagePercentage(): string {
  const cpuUsage = (os.loadavg()[0] ?? 0) / os.cpus().length;
  return (cpuUsage * 100).toFixed(0);
}

function getMemoryUsagePercentage(): string {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsage = (usedMemory / totalMemory) * 100;
  return memoryUsage.toFixed(0);
}

registerMetricsTracker(() => {
  sendMetricToGrafana("cpu", getCpuUsagePercentage(), "gauge", "%");
  sendMetricToGrafana("memory", getMemoryUsagePercentage(), "gauge", "%");
}, 1000);



// HTTP metrics

const requests: Record<string, number> = {};

function requestTracker(
  req: { method: string; path: string },
  res: unknown,
  next: () => void
): void {
  const endpoint = `[${req.method}] ${req.path}`;
  requests[endpoint] = (requests[endpoint] ?? 0) + 1;
  // TODO sendMetricToGrafana(endpoint, 1, "sum", unit)
  next();
}

function sendMetricToGrafana(metricName: string, metricValue: string, type: MetricType, unit: MetricUnit): void {
  // requests += Math.floor(Math.random() * 200) + 1;
  // sendMetricToGrafana("requests", requests, "sum", "1");
  // latency += Math.floor(Math.random() * 200) + 1;
  // sendMetricToGrafana("latency", latency, "sum", "ms");

  const metricEntry: MetricEntry = {
    name: metricName,
    unit: unit,
    [type]: {
      dataPoints: [
        {
          asInt: metricValue,
          timeUnixNano: Date.now() * 1000000,
        },
      ],
    },

  }
  const metric = {
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
  const metricRequest = {
    resourceMetrics: [{ scopeMetrics: [{ metrics: [metricEntry] }] }]
  };

  const body = JSON.stringify(metricRequest);
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
            `Failed to push metrics data to Grafana: ${text}\n${body}`
          );
        });
      }
    })
    .catch((error) => {
      console.error("Error pushing metrics:", error);
    });
}

export { requestTracker, startMetrics, stopMetrics };
