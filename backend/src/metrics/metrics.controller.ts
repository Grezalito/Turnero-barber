import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { isMetricsEnabled } from "./metrics.config";
import { MetricsService } from "./metrics.service";

/**
 * Endpoint de scrape para Prometheus. Responde 404 si METRICS_ENABLED está apagado.
 */
@Controller("metrics")
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  async scrape(@Res() res: Response): Promise<void> {
    if (!isMetricsEnabled()) {
      throw new NotFoundException();
    }
    res.set("Content-Type", this.metrics.contentType);
    res.send(await this.metrics.render());
  }
}
