# Service CRM

CRM simple para emprendimientos de servicios (jardinería, limpieza, fletes, pintura).

Permite:
- Registrar clientes (nombre, contacto, dirección, notas).
- Registrar servicios realizados con fecha, rubro, descripción, precio y estado de pago.
- Marcar servicios como pagados/pendientes con un clic.
- Dashboard con totales (cobrado, pendiente), desglose por rubro, evolución por mes, top clientes y clientes con deuda.

## Stack

- Node.js + Express
- SQLite (better-sqlite3)
- Bootstrap 5 (sin build step)
- Auth básica por sesión (usuario/contraseña en variables de entorno)

## Correr localmente (prototipo / pruebas)

```bash
npm install
cp .env.example .env   # editar credenciales si querés
npm run seed           # (opcional) carga 5 clientes y 13 servicios de ejemplo
npm start
```

Abrir http://localhost:3000 y loguearse con el usuario/contraseña del `.env` (por defecto `admin` / `cambia-esto`).

Para empezar de cero, borrá `data/crm.db` y corré `npm run seed` de nuevo.

## Deploy a Railway

1. **Crear proyecto en Railway** desde este repositorio (Railway detecta Node.js automáticamente).
2. **Agregar un Volume** al servicio (tab "Volumes" → New Volume) y montarlo en `/data`.
3. **Setear variables de entorno** en el servicio:
   - `ADMIN_USER` → tu usuario (ej: `admin`).
   - `ADMIN_PASSWORD` → contraseña fuerte.
   - `SESSION_SECRET` → string largo y aleatorio (ej: salida de `openssl rand -hex 32`).
   - `DB_PATH` → `/data/crm.db` (para que use el volume persistente).
   - `NODE_ENV` → `production`.
4. **Deploy**. Railway va a correr `npm install` y luego `node server.js` (también definido en `railway.json`).
5. Entrá a la URL que te da Railway y loguéate con tus credenciales.

> Importante: sin el Volume montado en `/data`, la base de datos se borra en cada redeploy.

## Estructura

```
server.js               # Express app + auth + static
db.js                   # SQLite + schema
routes/
  clients.js            # CRUD clientes
  services.js           # CRUD servicios + toggle-paid
  analytics.js          # Endpoints del dashboard
public/
  index.html            # Dashboard
  clients.html          # Listado / ABM clientes + detalle
  services.html         # Listado / ABM servicios + filtros
  login.html
  js/common.js
  css/style.css
```

## API (resumen)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/login` | Autenticación (body: `{username, password}`) |
| POST | `/api/logout` | Cierra sesión |
| GET | `/api/clients?q=...` | Listar clientes (con agregados) |
| POST/PUT/DELETE | `/api/clients/:id` | CRUD clientes |
| GET | `/api/services?category=&paid=&from=&to=&client_id=` | Listar servicios |
| POST/PUT/DELETE | `/api/services/:id` | CRUD servicios |
| POST | `/api/services/:id/toggle-paid` | Alternar pago |
| GET | `/api/analytics/summary` | Todas las métricas del dashboard |
| GET | `/health` | Healthcheck (sin auth) |

## Notas

- Para cambiar los rubros, editá la constante `CATEGORIES` en `routes/services.js`.
- El listado de servicios suma los totales del filtro actual (útil para consultar "cuánto cobré en marzo de limpieza").
- Borrar un cliente borra también todos sus servicios (cascade).
