# Falla #15 — Las sesiones no expiran nunca

**Qué es y por qué importa**
Una sesión abierta seguía válida indefinidamente: si el usuario se levantaba
dejando el navegador abierto en una compu compartida, o si la cookie se
filtraba, el id seguía sirviendo para siempre. Sin expiración no hay forma de
cerrar el acceso de forma automática ni de limitar el daño de una cookie
robada.

**Dónde está**
`src/middleware/sesion.ts`:

- `crearSesion()` (línea 58): `expiraEn: null` — la sesión nunca vence.
- `crearSesion()` (línea 62): la cookie se emitía sin `maxAge`, sin límite en
  el navegador.
- `obtenerSesion()` (líneas 68-73): devolvía la sesión sin chequear vigencia.

**Cómo se observa**

1. Iniciar sesión en el panel y ver la cookie `sid` en F12 → Application →
   Cookies: no tenía `Max-Age` (caducaba al cerrar el navegador, y en el
   servidor ni siquiera eso).
2. Después de corregir: la cookie trae `Max-Age=1800` y, si se deja la sesión
   inactiva 30 minutos, `GET /api/auth/yo` responde 401.

**Por qué ocurre**
La sesión se guardaba en un `Map` con la fecha de creación pero sin fecha de
vencimiento, y la lectura no comparaba nada contra el reloj: si existía la
clave, valía para siempre.

**Cómo se corrige**

```ts
// src/middleware/sesion.ts
const TTL_SESION_MS = 30 * 60 * 1000;   

//crear:
const ahora = Date.now();
sesiones.set(id, { usuario, creadaEn: ahora, expiraEn: ahora + TTL_SESION_MS });
res.cookie('sid', id, { /* ...flags... */ maxAge: TTL_SESION_MS });

//leer:
const sesion = sesiones.get(id);
if (!sesion) return null;
if (sesion.expiraEn !== null && sesion.expiraEn < Date.now()) {
  sesiones.delete(id);    
  return null;
}
return sesion;
```

La expiración se calcula al crear (`Date.now() + TTL`), se aplica también en
la cookie (`maxAge`, para que el navegador la descarte) y se valida en cada
lectura, borrando del servidor las sesiones vencidas.

**Cómo se verifica que quedó resuelto**

- Este fix se verifica con el checklist.
  `docker compose exec app npm run check:security` → controles `AUTH-09` (no
  más `expiraEn: null`) y `AUTH-10` (`Date.now() + TTL` / `maxAge`) en verde.


**Reflexión**
En un proyecto real las sesiones tienen TTL corto con renovación por
actividad, y el cierre de sesión y el vencimiento se resuelven en el servidor:
la cookie del navegador es sólo un índice, no la fuente de verdad.