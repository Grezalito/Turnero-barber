import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { MetricsService } from "./metrics.service";

/** Rutas que no se miden: el scrape y los probes generarían ruido constante. */
const IGNORED_PATHS = ["/metrics", "/health"];

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const path = (req.originalUrl || req.url || "").split("?")[0];
    if (IGNORED_PATHS.includes(path)) {
      next();
      return;
    }

    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const seconds = Number(process.hrtime.bigint() - start) / 1e9;
      // req.route.path es el patrón (/appointments/:id), no la URL real: evita
      // explotar la cantidad de series. Sin ruta que coincida → "unmatched".
      const route = req.route?.path
        ? `${req.baseUrl ?? ""}${req.route.path}`
        : "unmatched";
      this.metrics.observeRequest(req.method, route, res.statusCode, seconds);
    });
    next();
  }
}
