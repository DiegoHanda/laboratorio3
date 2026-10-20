# Reserva de salones (team2)

App web para consultar qué salones están libres y reservarlos a nombre propio o de un grupo. Laboratorio de Kubernetes, Proyecto 2.

- **web/**: React (Vite) servido por Nginx, que reenvía `/api` a la API.
- **api/**: Node + Express. Login con JWT, roles `alumno` y `admin`.
- **PostgreSQL**: la restricción `sin_solapes` (ver `api/db/schema.sql`) impide dos reservas activas solapadas en el mismo salón, aunque lleguen en el mismo instante.
- **k8s/**: manifiestos del namespace `alumno-team2` (base con volumen persistente, API, web e Ingress).
- **Jenkinsfile**: tests, build, push al registro y deploy al cluster en cada cambio de `main`.

## Qué falta completar

1. En `Jenkinsfile`: `REGISTRY` y `HOST` (marcados `COMPLETAR`). El host del Ingress tiene que quedar bajo el dominio del laboratorio.
2. Credenciales en Jenkins: `registry-creds`, `kubeconfig-team2` y `reservas-admin-password` (ver encabezado del Jenkinsfile).
3. Si el registro es privado, crear un `imagePullSecret` en el namespace y referenciarlo en `k8s/api.yaml` y `k8s/web.yaml`.
4. Si el cluster no tiene StorageClass ni IngressClass por defecto, descomentar y completar esas líneas en `k8s/postgres.yaml` y `k8s/web.yaml`.

No subir el kubeconfig al repositorio: contiene un token. Ya está excluido en `.gitignore`.

## Desarrollo local

```bash
# 1. Postgres (cualquier instancia), p. ej. con Docker:
docker run -d --name pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16-alpine

# 2. API (crea las tablas al arrancar y siembra admin + datos de demo)
cd api && npm ci
DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres \
  ADMIN_EMAIL=admin@reservas.test ADMIN_PASSWORD=admin123 SEED_DEMO=true npm start

# 3. Web con proxy a la API
cd web && npm ci && npm run dev
```

Usuarios de demo: `admin@reservas.test` / `admin123` y `alumno@demo.test` / `alumno123`.

## Tests

```bash
cd api && DATABASE_URL=postgres://postgres:dev@localhost:5432/postgres npm test   # incluye reservas simultáneas
cd web && npm test
```

## Configuración de la API

| Variable | Por defecto | Qué hace |
| --- | --- | --- |
| `HORA_ABRE`, `HORA_CIERRA` | 8, 22 | Franjas de 1 hora entre esas horas |
| `TZ_OFFSET` | `-03:00` | Zona horaria de las franjas (Montevideo) |
| `MAX_RESERVAS_ACTIVAS` | 3 | Límite por alumno |
| `SEED_DEMO` | — | `true` crea salones y un alumno de demo |

## Pendiente respecto al diseño

Vista de calendario semanal y reservas repetidas (extras del enunciado) no están implementadas.
