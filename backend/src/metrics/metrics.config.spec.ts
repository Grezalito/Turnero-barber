import { isMetricsEnabled } from "./metrics.config";

describe("isMetricsEnabled", () => {
  it("sin definir: habilitado fuera de producción", () => {
    expect(isMetricsEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isMetricsEnabled({})).toBe(true);
  });

  it("sin definir: deshabilitado en producción", () => {
    expect(isMetricsEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it.each(["true", "1", "YES", " on "])('"%s" lo habilita', (value) => {
    expect(
      isMetricsEnabled({ NODE_ENV: "production", METRICS_ENABLED: value }),
    ).toBe(true);
  });

  it.each(["false", "0", "no", "off"])('"%s" lo deshabilita', (value) => {
    expect(
      isMetricsEnabled({ NODE_ENV: "development", METRICS_ENABLED: value }),
    ).toBe(false);
  });

  it("un valor inválido lanza error (fail-fast)", () => {
    expect(() => isMetricsEnabled({ METRICS_ENABLED: "ture" })).toThrow(
      /METRICS_ENABLED inválido/,
    );
  });
});
