# Falla #1 — Inyección SQL en el login

**Qué es y por qué importa**
El inicio de sesión armaba la consulta SQL concatenando directamente lo que
escribió el usuario dentro del texto de la consulta. Si la entrada contiene
comillas y operadores SQL (por ejemplo `' OR 1=1 --`), el motor los interpreta
como parte del código SQL: la condición se reescribe por completo y el login
devuelve una fila válida **sin conocer ninguna contraseña**. Es la falla más
clásica de OWASP A03:2021 y da acceso total a la aplicación (y, de paso, a
todos los datos de la base).

**Dónde está**
`src/services/usuarios.service.ts`, función `autenticar()`:

```ts
const sql = `SELECT * FROM usuarios WHERE username = '${username}' AND password = '${password}'`;
```

**Cómo se observa**

1. Abrir `http://localhost:8080/admin.html` e intentar entrar con el usuario
   `admin` y una contraseña cualquiera → falla (correcto).
2. En el campo de usuario escribir `' OR 1=1 --` y cualquier cosa en la
   contraseña → **se entra al panel como administrador**.
3. También funciona `admin'--` (el `--` comenta el resto de la consulta,
   incluida la verificación de contraseña).
4. Evidencia: la sesión queda iniciada sin haber conocido ninguna credencial.

**Por qué ocurre**
La consulta se construye con un template literal en el que se inserta la
entrada tal cual. PostgreSQL ve un solo texto de SQL: las comillas de la
entrada cierran el string, `OR 1=1` hace verdadero el `WHERE` y `--` comenta
hasta el final. La condición queda `WHERE username = '' OR 1=1`, que devuelve
la primera fila de la tabla (el admin).

**Cómo se corrige**

```ts
// src/services/usuarios.service.ts
export async function autenticar(username: string, password: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(
    'SELECT * FROM usuarios WHERE username = $1 AND password = $2',
    [username, password]
  );
  return rows[0] || null;
}
```

Con consultas parametrizadas el SQL y los datos viajan por separado: el motor
prepara la consulta una vez y los valores se sustituyen después, de modo que
cualquier cosa que escriba el usuario queda siempre entre comillas y jamás
altera la estructura de la consulta.

**Cómo se verifica que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → tests "el login NO
  acepta el bypass con payload SQL" y "el login NO acepta el payload que
  comenta la contraseña" en verde.


**Reflexión**
En un proyecto real esto no debería ser una corrección tardía: desde la
primera línea hay que usar un acceso a datos con consultas parametrizadas (o
un ORM), de forma que sea imposible por construcción mezclar código SQL con
entrada del usuario.