# Falla #20 — Inyección de comandos en "probar conexión"

**Qué es y por qué importa**
La herramienta "Probar conexión con el proveedor" armaba un comando de shell
concatenando lo que escribía el usuario (OWASP A03:2021). Quien controle ese
campo puede ejecutar cualquier comando en el contenedor: leer variables de
entorno con secretos, borrar archivos o abrir una consola remota.

**Dónde está**
`src/routes/admin.routes.ts`, `POST /api/admin/probar-conexion`, líneas
149–155: la línea 153 armaba `` `ping -c 3 ${host}` `` y la línea 155 lo
ejecutaba con `exec`.

**Cómo se observa**
1. Entrar al panel como administrador → Herramientas → "Probar conexión con
   el proveedor".
2. Escribir `127.0.0.1; cat /etc/hostname`.
3. Evidencia: además de la salida de `ping`, aparece el nombre del host del
   contenedor, es decir que el segundo comando se ejecutó. En la API:

   ```bash
   curl -s -b admin.txt -H "Content-Type: application/json" \
     -d '{"host":"127.0.0.1; cat /etc/hostname"}' \
     http://localhost:8080/api/admin/probar-conexion
   ```

**Por qué ocurre**
`exec` lanza `/bin/sh -c "<cadena>"`, y el shell interpreta `;`, `|`, `&&`,
`$()` y las comillas invertidas. El valor del usuario formaba parte de la
cadena, por lo tanto se interpretaba como código y no como dato.

**Cómo se corrige**

```ts
// src/routes/admin.routes.ts
import { spawn } from 'child_process';

const HOSTS_PERMITIDOS = (process.env.HOSTS_PROVEEDORES ?? 'localhost,127.0.0.1')
  .split(',').map((h) => h.trim()).filter(Boolean);
const REGEX_HOST = /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/;

router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  if (typeof host !== 'string' || !REGEX_HOST.test(host)) {
    return res.status(400).json({ error: 'Host inválido.' });
  }
  if (!HOSTS_PERMITIDOS.includes(host)) {
    return res.status(403).json({ error: 'Host no permitido.' });
  }

  const args = ['-c', '3', '--', host];
  const proceso = spawn('ping', args, { shell: false, timeout: 10_000 });
  // ...se acumula stdout/stderr y se responde al cerrar el proceso
});
```

Tres capas: regex estricto, lista blanca de servidores y ejecución sin shell
con los argumentos en un array. El `--` evita que un valor que empiece con `-`
se interprete como opción de `ping`.

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → bloque *Inyección de
  comandos* en verde.
- `docker compose exec app npm run check:security` → sin errores.
- Manual: `127.0.0.1; cat /etc/hostname` devuelve `400`; `-f` devuelve `400`;
  un host válido pero fuera de la lista devuelve `403`; `127.0.0.1` devuelve
  la salida normal de `ping`.
