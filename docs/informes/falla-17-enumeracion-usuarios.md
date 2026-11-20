# Falla #17 — Enumeración de usuarios en el login

**Qué es y por qué importa**
El login respondía con mensajes distintos según el caso: "El usuario X no
existe" versus "La contraseña es incorrecta". Esa diferencia le permite a un
atacante armar listas de cuentas reales del sistema (con usernames filtrados
en otro lado) y después atacarlas con fuerza bruta, descartando las que no
existen. Es el paso previo de casi todo ataque dirigido a un login.

**Dónde está**
`src/routes/auth.routes.ts`, dentro de `POST /api/auth/login` (líneas 29-40):

```ts
const existe = await usuarios.buscarPorUsername(username);
if (existe) {
  return res.status(401).json({ error: 'La contraseña es incorrecta.' });
}
return res.status(401)
  .json({ error: `El usuario "${username}" no existe en el sistema.` });
```

**Cómo se observa**

1. En `http://localhost:8080/admin.html`, intentar entrar con un usuario que
   no existe (`fantasma`) y cualquier clave.
2. Luego, con un usuario real (`admin`) y una clave equivocada.
3. Antes de corregir: los dos mensajes son distintos (y el segundo además
   refleja lo que escribió el usuario).
4. Después: ambos responden exactamente
   `{"error":"Usuario o contraseña incorrectos."}`.

**Por qué ocurre**
El código quería ser "amigable" con quien olvidó la clave: consultaba si el
usuario existía para dar un mensaje más específico. Esa amabilidad delata
información que el cliente no debería tener.

**Cómo se corrige**

```ts
// src/routes/auth.routes.ts
if (!usuario) {
  return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
}
```

Un solo mensaje genérico, igual para ambos casos y que no refleja la entrada
del usuario (esto además elimina el último `` error: `${...}` `` de
`src/routes`, el vector de XSS reflejado del mensaje de error).

**Cómo se verificar que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → test "los mensajes de
  login son genéricos (sin enumeración de usuarios)" en verde (compara el
  `error` de ambos 401 y exige que sean idénticos).
- `docker compose exec app npm run check:security` → controles `AUTH-12` y
  `XSS-02` en verde.
- Manual: repetir el paso 2 de observación y comparar los dos mensajes.

**Reflexión**
En un proyecto real los mensajes de autenticación son genéricos por política
(desde el mensaje hasta el tiempo de respuesta), y las cuentas se protejen en
otro lado: rate limiting por cuenta, bloqueo temporal y verificación en dos
pasos — no diferenciando casos en el formulario.