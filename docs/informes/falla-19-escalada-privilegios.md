# Falla #19 — Escalada de privilegios (cambiarse el rol a admin)

**Qué es y por qué importa**
La ruta que edita usuarios copiaba a la base cualquier campo que llegara en el
cuerpo de la petición, incluido `rol`. Es una asignación masiva: un usuario
con rol `cliente` podía mandarse `{"rol": "admin"}` y quedar como
administrador, con control total de la aplicación.

**Dónde está**
`src/routes/admin.routes.ts`, `PUT /api/admin/usuarios/:id`, líneas 49–55. La
línea 55 (`if (rol !== undefined) cambios.rol = rol;`) pasaba el rol del
cliente directo al servicio.

**Cómo se observa**
1. Entrar con `cliente` / `cliente` (posible gracias a la falla #18).
2. En el panel, abrir la edición de usuarios y cambiar el rol del propio
   usuario `cliente` a `admin`.
3. Evidencia: el servidor responde `200` con el usuario actualizado y, al
   volver a consultar la lista de usuarios, el rol figura como `admin`. En la
   API:

   ```bash
   curl -s -b cliente.txt -X PUT -H "Content-Type: application/json" \
     -d '{"rol":"admin"}' http://localhost:8080/api/admin/usuarios/<id-de-cliente>
   ```

**Por qué ocurre**
El servidor confiaba en los datos del cliente. No había control sobre quién
puede cambiar roles, ni sobre qué valores son válidos para el campo `rol`, ni
ninguna regla que impidiera que un usuario modificara su propio rol.

**Cómo se corrige**

```ts
// src/routes/admin.routes.ts
const ROLES_VALIDOS = ['admin', 'barista', 'mozo', 'cliente'] as const;

router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const { username, nombre, rol, password } = req.body || {};

    // cada campo debe ser texto
    for (const [campo, valor] of Object.entries({ username, nombre, rol, password })) {
      if (valor !== undefined && typeof valor !== 'string') {
        return res.status(400).json({ error: `El campo "${campo}" debe ser texto.` });
      }
    }

    if (rol !== undefined) {
      // el rol tiene que ser uno de los que existen
      if (!(ROLES_VALIDOS as readonly string[]).includes(rol)) {
        return res.status(400).json({ error: 'Rol inválido.' });
      }
      // un admin no puede cambiarse su propio rol
      if (String(req.usuario!.id) === String(req.params.id)) {
        return res.status(403).json({ error: 'No podés cambiar tu propio rol.' });
      }
    }
    // ...solo se copian los campos de la lista blanca a `cambios`
```

Se combina con la corrección de #18: como toda la ruta exige rol `admin`,
un `cliente` ya no llega a este código; las validaciones agregan defensa en
profundidad contra roles inventados y contra el bloqueo accidental del único
administrador.

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → bloque *Autenticación y
  sesiones* (escalada de privilegios) en verde.
- `docker compose exec app npm run check:security` → sin errores.
- Manual: con `cliente`, repetir el cambio de rol y confirmar `403`. Con un
  admin, mandar `{"rol":"superadmin"}` y confirmar `400`; mandar un rol
  válido sobre otro usuario y confirmar `200`.
