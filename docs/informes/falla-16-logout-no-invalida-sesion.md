# Falla #16 — El logout no invalida la sesión en el servidor

**Qué es y por qué importa**
Al cerrar sesión sólo se borraba la cookie del navegador. La sesión seguía
viva en el `Map` del servidor, así que cualquiera que tuviera una copia del
valor de la cookie (robo previo, historial, registro de un proxy) podía seguir
usándola como si nada: el "cerrar sesión" no cerraba nada de verdad.

**Dónde está**
`src/routes/auth.routes.ts`, la ruta `POST /api/auth/logout` (líneas 69-72):

```ts
router.post('/logout', (req, res) => {
  res.clearCookie('sid', { path: '/' });
  res.json({ mensaje: 'Sesión cerrada.' });
});
```

**Cómo se observa**

1. Iniciar sesión en el panel y copiar el valor de la cookie `sid`
   (F12 → Application → Cookies).
2. Cerrar sesión desde la interfaz.
3. Reenviar una petición con la cookie copiada:

   ```bash
   curl http://localhost:8080/api/auth/yo -H "Cookie: sid=<valor-copiado>"
   ```

4. Antes de corregir: responde 200 con el usuario — la sesión seguía viva.
5. Después: responde 401.

**Por qué ocurre**
Se confundió "borrar la cookie" (una acción del navegador) con "cerrar la
sesión" (una acción del servidor). La fuente de verdad de la sesión es el
almacén del servidor, y el logout no lo tocaba.

**Cómo se corrige**

```ts
// src/routes/auth.routes.ts
router.post('/logout', (req, res) => {
  destruirSesion(req);
  res.clearCookie('sid', { path: '/' });
  res.json({ mensaje: 'Sesión cerrada.' });
});
```

`destruirSesion()` ya existía en `src/middleware/sesion.ts`: lee el `sid` de
la cookie y hace `sesiones.delete(id)`, con lo que el id deja de resolver a
una sesión válida.

**Cómo se verifica que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → test "el logout invalida
  la sesión en el servidor" en verde (antes y después del logout pide
  `GET /api/auth/yo` con la misma cookie: antes 200, después 401).
- `docker compose exec app npm run check:security` → control `AUTH-11` en
  verde.
- Manual: repetir el paso 3 de observación.

**Reflexión**
En un proyecto real el cierre de sesión siempre es una operación del servidor
(borrar o marcar inválido el registro de sesión), con la cookie del navegador
como complemento — y conviene agregar el borrado en cadena de todos los
dispositivos cuando se cambia una contraseña.