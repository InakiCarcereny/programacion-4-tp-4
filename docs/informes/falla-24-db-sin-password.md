# Falla #24 — Base de datos sin contraseña y con el superusuario

**Qué es y por qué importa**
La base de datos PostgreSQL usaba una contraseña trivial (`postgres`) y estaba
configurada con autenticación `trust`, que acepta cualquier conexión de red
sin pedir contraseña. Además, la aplicación se conectaba con el superusuario
`postgres`. Quien alcance el puerto de la base entra sin credenciales y con
permisos totales (leer, modificar o borrar todo). Y como la app usa esos mismos
permisos, cualquier inyección SQL (fallas #1 a #4) se ejecuta como superusuario
en vez de quedar limitada a las tablas del schema `public` (principio de mínimos
privilegios).

**Dónde está**
`docker-compose.yml`:
- línea 25: `POSTGRES_PASSWORD: postgres` (contraseña trivial),
     - línea 29: `POSTGRES_HOST_AUTH_METHOD: trust` (sin contraseña),
- líneas 60–61: `DB_USER: postgres` y `DB_PASSWORD: postgres` (la app usa el
  superusuario).

**Cómo se observa**
1. Con el proyecto levantado, conectarse a la base **por red** (TCP) sin dar
   ninguna contraseña:

   ```bash
   docker compose exec db psql -h 127.0.0.1 -U postgres -d origen -c "SELECT current_user, usesuper FROM pg_user WHERE usename = current_user;"
   ```
2. Evidencia: la consulta se ejecuta sin pedir clave y muestra que el usuario
   es superusuario (`usesuper = t`).
3. Ver con qué usuario trabaja la aplicación:

   ```bash
   docker compose exec app printenv DB_USER DB_PASSWORD
   ```

   Evidencia: `postgres` y `postgres`.

Nota: la conexión por el socket local del contenedor (`psql -U postgres` sin
`-h`) entra sin contraseña incluso después de corregir; es el comportamiento
normal de la imagen oficial y no es accesible desde la red. Por eso la
prueba se hace con `-h 127.0.0.1`.

**Por qué ocurre**
Se priorizó que el proyecto "funcione" en la demo: contraseña trivial escrita
directo en el compose, autenticación `trust` para no tener que configurar
nada, y un único usuario con todos los privilegios para la aplicación.

**Cómo se corrige**

```yaml
# docker-compose.yml

# servicio db
POSTGRES_PASSWORD: Caf3-Or1gen-DB-2024!

# servicio app
DB_USER: origen_app
DB_PASSWORD: origen_app_2024
```

- Se elimina `POSTGRES_HOST_AUTH_METHOD: trust`; PostgreSQL 16 usa
  `scram-sha-256` por defecto.
- La contraseña del superusuario deja de ser `postgres`.
- La aplicación usa el usuario `origen_app`, que no es superusuario y tiene
  permisos sobre las tablas del schema `public` (definido en
  `docker/initdb/02-usuario-aplicacion.sql`). El superusuario `postgres`
  queda solo para administración.
- La base no publica ningún puerto en el host: solo es accesible desde la red
  interna `red_origen`.

Como los scripts de `docker/initdb` solo corren al crear el volumen, hay que
recrear la base para que apliquen las contraseñas nuevas:

```bash
docker compose down -v
docker compose up -d --build
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run check:security` → controles `SQLI-03`,
  `SQLI-04` y `SQLI-05` en verde.
- `docker compose exec app npm test` → sigue en verde (la app conecta con
  `origen_app`).
- Manual: repetir `psql -h 127.0.0.1 -U postgres ...` y confirmar que ahora
  pide contraseña o falla con `password authentication failed`;
  `docker compose exec app printenv DB_USER` muestra `origen_app`; no hay
  `POSTGRES_HOST_AUTH_METHOD: trust` en `docker-compose.yml`.
