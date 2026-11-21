# Falla #18 — Autorización ausente en el panel de administración

**Qué es y por qué importa**
El panel de administración comprobaba que el usuario hubiera iniciado sesión,
pero no que fuera administrador. Es un control de acceso roto (OWASP A01:2021):
cualquier usuario autenticado, incluso con rol `cliente`, podía usar funciones
que son solo del administrador: crear, editar y borrar productos, cambiar
contraseñas, editar usuarios y ejecutar comandos en el servidor.

**Dónde está**
`src/routes/admin.routes.ts`:
- línea 9: se importaba `requiereRol` y nunca se usaba,
- línea 31: `router.use(requiereSesion);` era la única protección del router.

**Cómo se observa**
1. Levantar el proyecto: `docker compose up -d --build`.
2. Entrar a `http://localhost:8080` con el usuario `cliente` / `cliente`.
3. Abrir `http://localhost:8080/admin.html`.
4. Evidencia: el panel carga y el cliente puede ver la lista de usuarios, los
   productos y las herramientas de administración. También se ve desde la API:

   ```bash
   curl -s -b cliente.txt http://localhost:8080/api/admin/usuarios
   ```

   (con la cookie `sid` del cliente guardada en `cliente.txt`). La respuesta
   es `200` con todos los usuarios.

**Por qué ocurre**
`requiereSesion` verifica identidad (autenticación): "sos alguien que inició
sesión". No verifica permisos (autorización): "sos alguien que puede hacer
esto". El middleware que sí mira el rol, `requiereRol`, estaba escrito pero
no se aplicaba a ninguna ruta.

**Cómo se corrige**

```ts
// src/routes/admin.routes.ts

// antes
router.use(requiereSesion);

// después
router.use(requiereSesion);
router.use(requiereRol('admin'));
```

Se aplica con `router.use()` al principio del router para que toda ruta
actual y futura quede protegida por defecto. El rol se lee de la sesión que
guarda el servidor, nunca de datos que mande el cliente.

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → bloque *Autenticación y
  sesiones* (control de roles) en verde.
- `docker compose exec app npm run check:security` → sin errores.
- `docker compose exec app npm test` → sigue en verde.
- Manual: repetir los pasos de observación. Con `cliente` el panel ya no
  responde (la API devuelve `403`); sin sesión devuelve `401`; con `admin` /
  `admin` o `valentina` el panel sigue funcionando.
