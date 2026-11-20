# Falla #13 — Cookie de sesión sin HttpOnly, Secure ni SameSite

**Qué es y por qué importa**
La cookie `sid` se emitía con sólo `path: '/'`. Sin `HttpOnly`, cualquier
script en la página (por ejemplo un XSS) puede leer la cookie con
`document.cookie` y robar la sesión. Sin `Secure`, viaja en texto plano si la
petición va por HTTP. Sin `SameSite`, el navegador la manda también en
peticiones cross-site, lo que facilita ataques CSRF.

**Dónde está**
`src/middleware/sesion.ts`, función `crearSesion()` (línea 62):

```ts
res.cookie('sid', id, { path: '/' });
```

**Cómo se observa**

1. Iniciar sesión en `http://localhost:8080/admin.html`.
2. F12 → Application → Cookies → `sid`.
3. Antes de corregir: no tiene `HttpOnly`, ni `Secure`, ni `SameSite`.
4. Después: `HttpOnly` ✓ y `SameSite=Lax` ✓. `Secure` aparece sólo si la app
   corre en producción: en la demo local por HTTP el navegador no guardaría la
   cookie, por eso se configura por entorno (y el propio test lo exige así).

**Por qué ocurre**
`res.cookie` se llamó con las opciones mínimas (`path`), sin aprovechar las
banderas que Express soporta para endurecer la cookie de sesión.

**Cómo se corrige**

```ts
// src/middleware/sesion.ts — crearSesion()
res.cookie('sid', id, {
  path: '/',
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
});
```

- `httpOnly`: el navegador no expone la cookie a JavaScript, con lo que un XSS
  no puede robarla.
- `secure`: sólo se envía por HTTPS (activado en producción; la demo local
  sobre HTTP sigue funcionando porque se decide por `NODE_ENV`).
- `sameSite: 'lax'`: el navegador no la adjunta en peticiones cross-site
  iniciadas desde otro sitio, cerrando de paso una vía de CSRF.

**Cómo se verificar que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → test "la cookie de
  sesión lleva HttpOnly, Secure y SameSite" en verde.


**Reflexión**
En un proyecto real las cookies de sesión se emiten endurecidas por defecto
(HttpOnly + Secure + SameSite) desde el primer deploy, idealmente con la ayuda
del framework, porque es una de esas protecciones que cuesta un renglón y
olvidarse tiene consecuencias graves.