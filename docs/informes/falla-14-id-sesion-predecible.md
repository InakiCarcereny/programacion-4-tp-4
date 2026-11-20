# Falla #14 — Identificador de sesión predecible

**Qué es y por qué importa**
El id de sesión era un contador incremental (`sesion_1`, `sesion_2`, ...).
Cualquiera que adivine o pruebe valores secuenciales puede asumir la sesión de
otro usuario sin autenticarse. Además, al iniciar sesión no se regeneraba el
id, lo que permite un ataque de fijación de sesión: el atacante fija un id
conocido y lo convence a la víctima de que lo use.

**Dónde está**
- `src/middleware/sesion.ts`: `let contadorSesiones = 0;` (línea 30) y
  `const id = \`sesion_${contadorSesiones}\`` en `crearSesion()` (línea 52).
- `src/routes/auth.routes.ts`: el login llamaba a `crearSesion()` sin
  descartar la sesión previa (fijación de sesión).

**Cómo se observa**

1. Iniciar sesión dos veces en `http://localhost:8080/admin.html` y comparar
   el valor de la cookie `sid` (F12 → Application → Cookies).
2. Antes de corregir: `sesion_1`, `sesion_2`, ... un patrón secuencial
   adivinable al instante.
3. Después: dos UUIDs distintos e irracionales (`f3a9...-...-...`), sin
   relación entre sí ni con el orden de los logins.

**Por qué ocurre**
Se usó un contador en memoria como identificador por comodidad: es legible y
fácil de generar, pero no tiene entropía ninguna. Y como el id no se
regeneraba al autenticar, un valor fijado de antemano seguía siendo válido
después del login.

**Cómo se corrige**

```ts
// src/middleware/sesion.ts
import crypto from 'crypto';

// eliminar: let contadorSesiones = 0;

export function crearSesion(req: Request, res: Response, usuario: UsuarioSesion): string {
  const id = crypto.randomUUID();
}
```

```ts
// src/routes/auth.routes.ts — dentro de POST /login, antes de crearSesion
    // Regeneración tras el login: se descarta cualquier sesión previa para
    // no heredar un id que un atacante pudo fijar (fijación de sesión).
    destruirSesion(req);
```

**Cómo se verifica que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → test "el identificador
  de sesión es aleatorio y no predecible" en verde (pide 3 logins y exige 3
  ids distintos, no numéricos, no `sesion_N` y de al menos 16 caracteres).

**Reflexión**
En un proyecto real los identificadores de sesión se generan con un PRNG
criptográfico desde el principio (o los genera el framework), y se regeneran
en cada escalada de privilegio — principalmente en el login — porque la
seguridad de todo el sistema cuelga de que ese valor sea inadivinable.