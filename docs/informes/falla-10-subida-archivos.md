# Falla #10 — Subida de archivos sin restricciones

**Qué es y por qué importa**
El panel guardaba cualquier archivo con el nombre que mandaba el cliente, sin
mirar extensión, tipo ni tamaño (OWASP A04:2021). Eso permite subir un `.html`
o `.svg` con JavaScript, que después se sirve desde el mismo origen y se
ejecuta en el navegador de quien lo abra (XSS almacenado); llenar el disco; o
escribir fuera de la carpeta de subidas usando `../` en el nombre.

**Dónde está**
`src/routes/admin.routes.ts`, `POST /api/admin/subir-archivo`, líneas
180–194: límite de 8 MB (línea 180), `Buffer.from` sin validar (línea 189),
`path.join` con el nombre del cliente (línea 193) y `writeFileSync` (línea
194).

**Cómo se observa**
1. Crear en tu máquina un archivo `prueba.html` con
   `<script>alert(document.domain)</script>`.
2. En el panel (como administrador), subirlo.
3. Abrir `http://localhost:8080/uploads/prueba.html`.
4. Evidencia: el servidor acepta el archivo y el navegador ejecuta el script.
   Además, una subida con nombre `../prueba.html` escribe fuera de la carpeta
   de subidas.

**Por qué ocurre**
No hay validación de extensión, de contenido ni de tamaño, y el nombre del
cliente se usa para construir la ruta del archivo en disco. Los archivos se
sirven con `express.static` desde el mismo origen que la aplicación.

**Cómo se corrige**

```ts
// src/routes/admin.routes.ts
const MAX_BYTES = 2 * 1024 * 1024;
const FIRMAS: Record<string, (b: Buffer) => boolean> = {
  '.png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

router.post('/subir-archivo', express.json({ limit: '3mb' }), (req, res, next) => {
  // ...
  const ext = path.extname(nombre).toLowerCase();
  const verificar = FIRMAS[ext];
  if (!verificar) return res.status(400).json({ error: 'Tipo de archivo no permitido (solo png, jpg, jpeg).' });

  const buffer = Buffer.from(contenidoBase64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) return res.status(413).json({ error: 'El archivo está vacío o supera los 2 MB.' });
  if (!verificar(buffer)) return res.status(400).json({ error: 'El contenido no coincide con la extensión.' });

  const nombreSeguro = `${crypto.randomUUID()}${ext}`;
  const carpeta = path.resolve(config.uploadsDir);
  const destino = path.resolve(carpeta, nombreSeguro);
  if (path.dirname(destino) !== carpeta) return res.status(400).json({ error: 'Ruta de destino inválida.' });
  fs.writeFileSync(destino, buffer, { flag: 'wx' });
  // ...
```

Lista blanca de extensiones (SVG queda afuera a propósito: puede contener
scripts), verificación de los primeros bytes del archivo (el tipo real, no el
que declara el cliente), tamaño máximo de 2 MB, nombre aleatorio y
comprobación de que el destino quede dentro de la carpeta de subidas.

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → bloque *Validación de
  entrada* (archivos) en verde.
- `docker compose exec app npm run check:security` → sin errores.
- Manual: subir `prueba.html` devuelve `400`; un archivo `.png` con texto
  dentro devuelve `400`; uno de más de 2 MB devuelve `413`; un PNG real se
  sube y la URL devuelta tiene un nombre aleatorio, no el original.
