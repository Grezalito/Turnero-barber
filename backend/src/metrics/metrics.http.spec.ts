import { Controller, Get, INestApplication, Param } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as http from "http";
import { MetricsModule } from "./metrics.module";

@Controller("demo")
class DemoController {
  @Get(":id")
  find(@Param("id") id: string) {
    return { id };
  }
}

function get(
  app: INestApplication,
  path: string,
): Promise<{ status: number; body: string; type: string }> {
  return new Promise((resolve, reject) => {
    const { port } = app.getHttpServer().address();
    http
      .get({ host: "127.0.0.1", port, path }, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            type: String(res.headers["content-type"]),
          }),
        );
      })
      .on("error", reject);
  });
}

describe("GET /metrics (HTTP)", () => {
  let app: INestApplication;
  const originalEnv = process.env.METRICS_ENABLED;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MetricsModule],
      controllers: [DemoController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
    if (originalEnv === undefined) delete process.env.METRICS_ENABLED;
    else process.env.METRICS_ENABLED = originalEnv;
  });

  it("expone métricas con la ruta como patrón (sin explotar cardinalidad)", async () => {
    process.env.METRICS_ENABLED = "true";
    await get(app, "/demo/123");
    await get(app, "/demo/456");
    await get(app, "/no-existe");

    const res = await get(app, "/metrics");

    expect(res.status).toBe(200);
    expect(res.type).toContain("text/plain");
    expect(res.body).toContain(
      'turnazo_http_requests_total{method="GET",route="/demo/:id",status_code="200"} 2',
    );
    expect(res.body).toContain('route="unmatched",status_code="404"');
    expect(res.body).not.toContain("/demo/123");
    expect(res.body).not.toContain('route="/metrics"');
  });

  it("responde 404 cuando METRICS_ENABLED está apagado", async () => {
    process.env.METRICS_ENABLED = "false";
    const res = await get(app, "/metrics");
    expect(res.status).toBe(404);
  });
});
