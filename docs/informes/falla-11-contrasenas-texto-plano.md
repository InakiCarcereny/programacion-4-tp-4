# Falla #11 — Contraseñas guardadas en texto plano

**Qué es y por qué importa**
Las contraseñas de los usuarios se guardaban tal cual se escribieron, dentro
de la tabla `usuarios`. Cualquiera que tenga acceso a la base (un dump, un
backup, un volcado accidental o una inyección SQL) ve todas las claves
directamente. Además, como la gente reutiliza contraseñas, una filtración de
esta cafetería puede destrozar otras cuentas de los mismos usuarios.

**Dónde está**
- `src/inicializar.ts` (líneas 56-64): el `INSERT` de la carga inicial guardaba
  `usuario.password` sin hashear.
- `src/services/usuarios.service.ts`, `cambiarPassword()` (líneas 77-83): el
  `UPDATE` escribía la contraseña nueva en claro.
- `src/services/usuarios.service.ts`, `autenticar()` (línea 42): la comparación
  era texto contra texto.

**Cómo se observa**

1. Mirar la base directamente:

   ```bash
   docker compose exec db psql -U postgres -d origen \
     -c "SELECT username, password FROM usuarios;"
   ```

   Se ve `admin | admin`, `valentina | origen2024`, ... es decir, las claves
   en texto plano.

**Por qué ocurre**
Nunca se aplicó una función de hash: el código guardaba el string que llegaba
del formulario y lo comparaba con `=`. Sin salt ni work factor, cualquier
lector de la tabla queda con todas las credenciales.

**Cómo se corrige**

```ts
// src/services/usuarios.service.ts
import bcrypt from 'bcryptjs';

export async function autenticar(username: string, password: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>('SELECT * FROM usuarios WHERE username = $1', [username]);
  const usuario = rows[0];
  if (!usuario) return null;
  const coincide = await bcrypt.compare(password, usuario.password);
  return coincide ? usuario : null;
}

export async function cambiarPassword(id: number, nuevaPassword: string): Promise<Usuario | null> {
  const hash = await bcrypt.hash(nuevaPassword, 12);
  const { rows } = await db.query<Usuario>(
    'UPDATE usuarios SET password = $1 WHERE id = $2 RETURNING *',
    [hash, id]
  );
  return rows[0] || null;
}
```

```ts
// src/inicializar.ts
const hash = await bcrypt.hash(usuario.password, 12);
await db.query(
  `INSERT INTO usuarios (username, password, rol, nombre)
   VALUES ($1, $2, $3, $4)
   ON CONFLICT (username) DO UPDATE
     SET password = EXCLUDED.password
   WHERE usuarios.password NOT LIKE '$2%'`,
  [usuario.username, hash, usuario.rol, usuario.nombre]
);
```

bcrypt genera un salt distinto por usuario: dos claves iguales producen hashes
distintos, y el `WHERE ... NOT LIKE '$2%'` hace que la reparación sólo toque
las contraseñas que todavía están en claro, sin pisar los hashes ya
almacenados. La comparación se hace con `bcrypt.compare`, que encripta la
entrada con el salt guardado y compara en tiempo constante.

**Cómo se verifica que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → test "las contraseñas NO
  se guardan en texto plano" en verde.


**Reflexión**
En un proyecto real el hash de contraseñas no es algo que se agrega al final:
es una decisión de diseño del día uno (bcrypt o argon2, con salt por usuario),
porque guardar en claro contamina todo lo demás — los backups, los logs y
cualquier filtración posterior.