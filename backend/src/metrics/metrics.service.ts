import { Injectable } from "@nestjs/common";
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

/**
 * Registro de métricas Prometheus.
 * - Métricas por defecto de Node (memoria, CPU, event loop, GC) con prefijo "turnazo_".
 * - Contador y histograma de requests HTTP, etiquetados por método, ruta y status.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  private readonly httpRequests: Counter<"method" | "route" | "status_code">;
  private readonly httpDuration: Histogram<"method" | "route" | "status_code">;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: "turnazo_" });

    this.httpRequests = new Counter({
      name: "turnazo_http_requests_total",
      help: "Total de requests HTTP atendidos",
      labelNames: ["method", "route", "status_code"],
      registers: [this.registry],
    });

    this.httpDuration = new Histogram({
      name: "turnazo_http_request_duration_seconds",
      help: "Duración de los requests HTTP en segundos",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
  }

  observeRequest(
    method: string,
    route: string,
    statusCode: number,
    durationSeconds: number,
  ): void {
    const labels = {
      method,
      route,
      status_code: String(statusCode),
    };
    this.httpRequests.inc(labels);
    this.httpDuration.observe(labels, durationSeconds);
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
