# Falla #8 — Formularios sin token anti-CSRF

**Qué es y por qué importa**
El navegador envía automáticamente las cookies de sesión del dominio en cada
petición. Como las rutas que modifican datos no exigían un token anti-CSRF ni
verificaban el origen de la petición (OWASP A01:2021), cualquier página externa
abierta en el navegador de un usuario con sesión iniciada podía forzar acciones
en su nombre: crear pedidos, publicar reseñas, dar de alta, editar o borrar
productos, o cambiar la contraseña del administrador.

**Dónde está**
- `src/app.ts`, líneas 48–56: las rutas `/api/*` se montaban sin ningún
  middleware que emitiera o verificara un token anti-CSRF.
- Endpoints que cambian estado sin validar token:
  - `POST /api/pedidos` (`src/routes/pedidos.routes.ts`, línea 18)
  - `POST /api/comentarios` (`src/routes/comentarios.routes.ts`, línea 24)
  - `POST /api/admin/productos` (`src/routes/admin.routes.ts`, línea 89)
  - `PUT /api/admin/productos/:id` (`src/routes/admin.routes.ts`, línea 103)
  - `DELETE /api/admin/productos/:id` (`src/routes/admin.routes.ts`, línea 121)
  - `POST /api/admin/cambiar-contrasena` (`src/routes/admin.routes.ts`, línea 139)

**Cómo se observa**
1. Levantar el proyecto: `docker compose up -d --build`.
2. Iniciar sesión y guardar la cookie de sesión:

   ```bash
   curl -s -c sesion.txt -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"admin"}' \
     http://localhost:8080/api/auth/login
   ```

3. Enviar una operación que modifica estado usando únicamente la cookie `sid`,
   sin ningún token anti-CSRF (simulando una petición disparada desde otro
   sitio):

   ```bash
   curl -i -b sesion.txt -H "Content-Type: application/json" \
     -d '{"mesa":"4","cliente":"CSRF","items":[{"productoId":4,"cantidad":1}]}' \
     http://localhost:8080/api/pedidos
   ```

4. Evidencia: el servidor aceptaba la petición y respondía `201 Created` (o en
   `/api/admin/cambiar-contrasena` cambiaba la contraseña del administrador) sin
   haber recibido ningún token anti-CSRF.

**Por qué ocurre**
La aplicación confiaba únicamente en la cookie de sesión (`sid`) para autorizar
las peticiones `POST`, `PUT`, `PATCH` y `DELETE`. Como las cookies viajan de
forma automática en el navegador, el servidor no tenía manera de distinguir una
acción iniciada desde un formulario legítimo de la aplicación de una petición
forzada desde un sitio externo.

**Cómo se corrige**

```ts
// src/middleware/csrf.ts
const tokensCsrf = new Map<string, string>();

export function emitirTokenCsrf(req: Request, res: Response): void {
  const cookies = leerCookies(req);
  const existente = (cookies.sid && tokensCsrf.get(cookies.sid)) || cookies.csrf;
  const token = existente || crypto.randomBytes(32).toString('hex');

  if (cookies.sid) {
    tokensCsrf.set(cookies.sid, token);
  }

  res.cookie('csrf', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.json({ token, csrfToken: token });
}

export function verificarCsrf(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  if (req.path === '/auth/login') {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const host = req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return res.status(403).json({ error: 'Origen de la petición inválido.' });
      }
    } catch {
      return res.status(403).json({ error: 'Origen de la petición inválido.' });
    }
  }

  const cookies = leerCookies(req);
  const tokenEsperado =
    (cookies.sid && tokensCsrf.get(cookies.sid)) || cookies.csrf || '';
  const headerToken = req.headers['x-csrf-token'];
  const tokenRecibido =
    (typeof headerToken === 'string' ? headerToken : '') ||
    (typeof req.body?._csrf === 'string' ? req.body._csrf : '') ||
    (typeof req.query?._csrf === 'string' ? req.query._csrf : '');

  if (
    !tokenRecibido ||
    !tokenEsperado ||
    tokenRecibido.length !== tokenEsperado.length ||
    !crypto.timingSafeEqual(Buffer.from(tokenRecibido), Buffer.from(tokenEsperado))
  ) {
    return res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
  }

  next();
}
```

```ts
// src/app.ts
app.get("/api/csrf-token", emitirTokenCsrf);
app.use("/api", verificarCsrf);
```

Se expone `GET /api/csrf-token` para emitir un token aleatorio de 32 bytes
asociado a la sesión (y en cookie `csrf` con `httpOnly: true` y
`sameSite: 'lax'`), y el middleware `verificarCsrf` exige ese token (por
cabecera `X-CSRF-Token`, campo `_csrf` en el cuerpo o query) comparándolo en
tiempo constante con `crypto.timingSafeEqual`, además de comprobar que `Origin`
o `Referer` coincidan con el `Host` cuando están presentes.

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → bloque *CSRF* en verde.
- `docker compose exec app npm run check:security` → controles `CSRF-01`,
  `CSRF-03` y `CSRF-04` en verde.
- `docker compose exec app npm test` → los 28 tests funcionales siguen en verde.
- Manual: enviar `POST /api/pedidos` solo con la cookie `sid` y sin token
  devuelve `403` (`{"error":"Token CSRF inválido o ausente."}`); pidiendo antes
  `GET /api/csrf-token` y enviando el token en `X-CSRF-Token` o `_csrf`, la
  petición responde `201`.
