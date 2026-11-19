# Monitoreo de Turnazo (Prometheus + Alertmanager + Grafana)

Responde tres preguntas: **¿la app está viva?**, **¿cuánta memoria usa?** y
**¿cuántos errores tira?** — y avisa por Telegram si se cae.

```
  namespace: turnazo                     namespace: monitoring
  ┌───────────────────┐   GET /metrics   ┌────────────────┐  alerta   ┌──────────────┐
  │ backend (NestJS)  │ ◄─────────────── │  Prometheus    │ ────────► │ Alertmanager │──► Telegram
  │  /metrics  :3000  │   cada 15s       │  (guarda 7d)   │           └──────────────┘
  └───────────────────┘                  └───────┬────────┘
                                                 │ consulta PromQL
                                         ┌───────▼────────┐
                                         │    Grafana     │  dashboard "Turnazo - Backend"
                                         └────────────────┘
```

## Qué mide el backend

`GET /metrics` (módulo `backend/src/metrics/`) expone:

| Métrica | Para qué sirve |
|---|---|
| `turnazo_http_requests_total{method,route,status_code}` | Requests por segundo y % de errores 5xx |
| `turnazo_http_request_duration_seconds` (histograma) | Latencia p50 / p95 / p99 |
| `turnazo_process_resident_memory_bytes` | Memoria que usa el proceso |
| `turnazo_nodejs_eventloop_lag_seconds`, CPU, GC… | Salud interna de Node |

La etiqueta `route` es el **patrón** (`/appointments/:id`), no la URL real, para no
generar una serie nueva por cada id. `/health` y `/metrics` no se miden.

`/metrics` no tiene autenticación, por eso se controla con `METRICS_ENABLED`
(apagado por defecto en producción). En el cluster lo enciende `k8s/backend.yaml`
y es seguro porque el Service es `ClusterIP`: no se llega desde afuera.

## Levantarlo

Requiere la app corriendo (ver [`../README.md`](../README.md)). Volvé a construir la
imagen, porque el backend ahora tiene `/metrics`:

```bash
# 1. Reconstruir la imagen y reiniciar el backend
docker build -t turnazo-backend:local backend
kubectl apply -k k8s/
kubectl rollout restart -n turnazo deploy/backend

# 2. Secretos del monitoreo
cp k8s/monitoring/secrets.env.example k8s/monitoring/secrets.env
#    Completar GRAFANA_ADMIN_PASSWORD y TELEGRAM_BOT_TOKEN

# 3. Tu chat_id de Telegram, en k8s/monitoring/config/alertmanager.yml (chat_id: ...)

# 4. Desplegar
kubectl apply -k k8s/monitoring/
kubectl get pods -n monitoring -w
```

### Telegram (una sola vez)

1. En Telegram, hablale a **@BotFather** → `/newbot` → copiá el token a `secrets.env`.
2. Escribile cualquier mensaje a tu bot nuevo.
3. Abrí `https://api.telegram.org/bot<TOKEN>/getUpdates` y copiá `"chat":{"id": ...}`
   al `chat_id` de `config/alertmanager.yml`.

## Ver los dashboards

```bash
kubectl port-forward -n monitoring svc/grafana 3001:3000      # http://localhost:3001  (user: admin)
kubectl port-forward -n monitoring svc/prometheus 9090:9090   # http://localhost:9090  (Status → Targets)
kubectl port-forward -n monitoring svc/alertmanager 9093:9093 # http://localhost:9093
```

En Grafana, carpeta **Turnazo** → **Turnazo - Backend**. En Prometheus → *Status → Targets*,
el job `turnazo-backend` tiene que figurar **UP**.

## Alertas

| Alerta | Condición | Severidad |
|---|---|---|
| `TurnazoBackendDown` | Ningún pod sano del backend durante 1 min | critical |
| `TurnazoHighErrorRate` | Más del 5% de requests 5xx durante 5 min | warning |
| `TurnazoHighLatency` | p95 > 1s durante 5 min | warning |
| `TurnazoHighMemory` | Memoria > 400MB durante 5 min (el límite es 512Mi) | warning |

`TurnazoBackendDown` usa `absent(up == 1)` y no `up == 0` a propósito: cuando se borra
un pod, la serie `up` **desaparece** en vez de valer 0, y una regla `up == 0` nunca
dispararía. Esto está cubierto por un test (`config/alerts.test.yml`).

### Probar que la alerta de caída llega

```bash
kubectl scale -n turnazo deploy/backend --replicas=0   # "se cae" el backend
# ~1-2 min después: mensaje [FIRING] TurnazoBackendDown en Telegram
kubectl scale -n turnazo deploy/backend --replicas=1   # se recupera
# mensaje [RESOLVED]
```

## Tests de las reglas (sin cluster)

Las alertas se testean con series simuladas. Con `promtool` instalado, o vía Docker:

```bash
docker run --rm -v "$PWD/k8s/monitoring/config:/etc/prometheus:ro" -w /etc/prometheus \
  --entrypoint promtool prom/prometheus:v2.55.1 test rules alerts.test.yml
```

El CI corre esto, más `promtool check config`, `amtool check-config` y kubeconform
sobre los manifiestos, en cada push.

## Borrar todo

```bash
kubectl delete -k k8s/monitoring/    # incluye el historial de métricas (PVC)
```

## Qué queda fuera (a propósito)

- No hay métricas de Postgres ni de los nodos (`postgres_exporter`, `node-exporter`).
- No hay `kube-state-metrics`, así que no se alerta por reinicios de contenedor desde Prometheus
  (Kubernetes igual reinicia solo el pod; ver la prueba en el README de `k8s/`).
- Grafana no persiste cambios hechos desde la UI: el dashboard vive en
  `dashboards/turnazo-backend.json` (versionado en git).
