import { MetricsService } from "./metrics.service";

describe("MetricsService", () => {
  it("expone requests HTTP y métricas por defecto de Node en formato Prometheus", async () => {
    const service = new MetricsService();
    service.observeRequest("GET", "/appointments/:id", 200, 0.042);
    service.observeRequest("POST", "/auth/login", 500, 0.3);

    const output = await service.render();

    expect(output).toContain(
      'turnazo_http_requests_total{method="GET",route="/appointments/:id",status_code="200"} 1',
    );
    expect(output).toContain(
      'turnazo_http_requests_total{method="POST",route="/auth/login",status_code="500"} 1',
    );
    expect(output).toContain("turnazo_http_request_duration_seconds_bucket");
    expect(output).toContain("turnazo_process_resident_memory_bytes");
    expect(service.contentType).toContain("text/plain");
  });
});
