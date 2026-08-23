/**
 * VETRA-INFRA-03: Application Metrics
 *
 * Lightweight metrics collection without external dependencies.
 * Exposes counters, gauges, and histograms for:
 * - HTTP request count & duration (per route, per method, per status)
 * - Active connections
 * - Memory & CPU usage
 * - Uptime
 * - Database pool status
 *
 * Output format: Prometheus-compatible text format (exposed via /metrics)
 */
import type { Request, Response, NextFunction } from "express";

interface Counter {
  _type: "counter";
  name: string;
  help: string;
  labels: Record<string, string>;
  value: number;
}

interface Gauge {
  _type: "gauge";
  name: string;
  help: string;
  labels: Record<string, string>;
  value: number;
}

interface Histogram {
  _type: "histogram";
  name: string;
  help: string;
  labels: Record<string, string>;
  buckets: number[];
  counts: number[];
  sum: number;
}

type Metric = Counter | Gauge | Histogram;

class MetricsRegistry {
  private metrics: Map<string, Metric> = new Map();
  private startTime: number = Date.now();

  private key(name: string, labels: Record<string, string>): string {
    const labelParts = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => k + "=" + JSON.stringify(v))
      .join(",");
    return labelParts ? name + "{" + labelParts + "}" : name;
  }

  counter(name: string, help: string, labels: Record<string, string> = {}): Counter {
    const k = this.key(name, labels);
    let metric = this.metrics.get(k) as Counter | undefined;
    if (!metric) {
      metric = { _type: "counter", name, help, labels, value: 0 };
      this.metrics.set(k, metric);
    }
    return metric;
  }

  gauge(name: string, help: string, labels: Record<string, string> = {}): Gauge {
    const k = this.key(name, labels);
    let metric = this.metrics.get(k) as Gauge | undefined;
    if (!metric) {
      metric = { _type: "gauge", name, help, labels, value: 0 };
      this.metrics.set(k, metric);
    }
    return metric;
  }

  histogram(
    name: string,
    help: string,
    labels: Record<string, string> = {},
    buckets: number[] = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  ): Histogram {
    const k = this.key(name, labels);
    let metric = this.metrics.get(k) as Histogram | undefined;
    if (!metric) {
      metric = {
        _type: "histogram",
        name,
        help,
        labels,
        buckets: [...buckets].sort((a, b) => a - b),
        counts: new Array(buckets.length).fill(0),
        sum: 0,
      };
      this.metrics.set(k, metric);
    }
    return metric;
  }

  observeHistogram(hist: Histogram, value: number): void {
    hist.sum += value;
    for (let i = 0; i < hist.buckets.length; i++) {
      if (value <= hist.buckets[i]) {
        hist.counts[i]++;
      }
    }
  }

  incCounter(c: Counter, by: number = 1): void {
    c.value += by;
  }

  setGauge(g: Gauge, value: number): void {
    g.value = value;
  }

  uptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  serialize(): string {
    const lines: string[] = [];
    const seenHelp = new Set<string>();

    for (const metric of this.metrics.values()) {
      if (!seenHelp.has(metric.name)) {
        seenHelp.add(metric.name);
        lines.push("# HELP " + metric.name + " " + metric.help);
        lines.push("# TYPE " + metric.name + " " + metric._type);
      }

      const labelStr = this.formatLabels(metric.labels);

      switch (metric._type) {
        case "counter":
          lines.push(metric.name + labelStr + " " + metric.value);
          break;
        case "gauge":
          lines.push(metric.name + labelStr + " " + metric.value);
          break;
        case "histogram": {
          const h = metric as Histogram;
          let cumulative = 0;
          for (let i = 0; i < h.buckets.length; i++) {
            cumulative += h.counts[i];
            const leLabels = { ...h.labels, le: h.buckets[i].toString() };
            lines.push(h.name + "_bucket" + this.formatLabels(leLabels) + " " + cumulative);
          }
          lines.push(h.name + "_bucket" + this.formatLabels({ ...h.labels, le: "+Inf" }) + " " + cumulative);
          lines.push(h.name + "_sum" + labelStr + " " + h.sum);
          lines.push(h.name + "_count" + labelStr + " " + cumulative);
          break;
        }
      }
    }

    lines.push("");
    return lines.join("\n");
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return "";
    const parts = entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => k + "=" + JSON.stringify(v));
    return "{" + parts.join(",") + "}";
  }
}

export const metrics = new MetricsRegistry();

export const httpRequestsTotal = (method: string, route: string, status: number) =>
  metrics.counter("http_requests_total", "Total number of HTTP requests", { method, route, status: String(status) });

export const httpRequestDuration = (method: string, route: string) =>
  metrics.histogram("http_request_duration_seconds", "HTTP request duration in seconds", { method, route });

export const activeRequests = metrics.gauge("http_active_requests", "Number of active HTTP requests");

export const appUptime = metrics.gauge("app_uptime_seconds", "Application uptime in seconds");

export const memoryUsageBytes = metrics.gauge("process_memory_bytes", "Process memory usage in bytes");

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  metrics.setGauge(activeRequests, activeRequests.value + 1);
  const start = Date.now();

  res.on("finish", () => {
    metrics.setGauge(activeRequests, activeRequests.value - 1);

    const duration = (Date.now() - start) / 1000;
    const route = (req.route?.path as string) ?? req.path ?? "/unknown";
    const method = req.method;
    const status = res.statusCode;

    const counter = httpRequestsTotal(method, route, status);
    metrics.incCounter(counter);

    const hist = httpRequestDuration(method, route);
    metrics.observeHistogram(hist, duration);
  });

  next();
}

export function updateSystemMetrics(): void {
  const mem = process.memoryUsage();
  metrics.setGauge(memoryUsageBytes, mem.rss);
  metrics.setGauge(appUptime, metrics.uptimeSeconds());
}

export function startSystemMetricsUpdater(intervalMs: number = 30_000): () => void {
  updateSystemMetrics();
  const interval = setInterval(updateSystemMetrics, intervalMs);
  interval.unref();
  return () => clearInterval(interval);
}

export function getMetricsText(): string {
  updateSystemMetrics();
  return metrics.serialize();
}

export { MetricsRegistry };
export type { Counter, Gauge, Histogram };
