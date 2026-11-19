import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('responde { status: "ok" } sin dependencias', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok' });
  });
});
