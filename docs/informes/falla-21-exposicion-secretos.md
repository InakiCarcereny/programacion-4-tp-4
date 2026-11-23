# Falla #21 — Exposición de secretos por `/api/_diagnostico`

**Qué es y por qué importa**
El endpoint `/api/_diagnostico` estaba abierto sin autenticación y devolvía
el objeto `process.env` completo junto con las credenciales de conexión a la
base de datos (`DB_USER`, `DB_PASSWORD`, `DB_HOST`, etc.) (OWASP A01:2021 /
A05:2021). Cualquier visitante podía consultar esa ruta y obtener en texto
plano las contraseñas y variables de entorno internas del servidor.

**Dónde está**
`src/routes/debug.routes.ts`, `GET /api/_diagnostico`, líneas 17–29:
- línea 17: `router.get('/', ...)` sin `requiereSesion` ni `requiereRol`,
- línea 21: `entorno: process.env`,
- líneas 22–29: bloque `baseDeDatos` que incluye `password: process.env.DB_PASSWORD`
  en la línea 28.

**Cómo se observa**
1. Con el proyecto levantado, abrir `http://localhost:8080/api/_diagnostico`
   en el navegador sin iniciar sesión, o ejecutar:

   ```bash
   curl -s http://localhost:8080/api/_diagnostico
   ```

2. Evidencia: el servidor responde `200` con un JSON que incluye todas las
   variables de entorno del contenedor en `entorno` y la contraseña de la
   base de datos en `baseDeDatos.password`.

**Por qué ocurre**
La ruta de diagnóstico se montó en `src/app.ts` (`/api/_diagnostico`) sin
middlewares de autenticación ni autorización, y serializaba directamente
`process.env` y las variables `DB_*` en la respuesta HTTP.

**Cómo se corrige**

```ts
// src/routes/debug.routes.ts
import express from 'express';

import { requiereSesion, requiereRol } from '../middleware/auth';

const router = express.Router();

router.use(requiereSesion);
router.use(requiereRol('admin'));

router.get('/', (req, res) => {
  res.json({
    mensaje: 'Diagnóstico del servidor',
    version: '1.0.0',
    sistema: {
      node: process.version,
      plataforma: process.platform,
      arquitectura: process.arch,
      memoria: process.memoryUsage(),
      uptime: process.uptime(),
      pid: process.pid,
    },
  });
});
```

- Se exige sesión iniciada y rol `admin` mediante `requiereSesion` y
  `requiereRol('admin')`.
- Se eliminan `entorno: process.env` y el bloque `baseDeDatos` con
  credenciales de la respuesta, dejando únicamente datos no sensibles del
  proceso (`sistema`).

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → test *"el endpoint de
  diagnóstico NO expone secretos"* (bloque *Configuración y exposición de
  información*) en verde.
- `docker compose exec app npm run check:security` → controles `CFG-03` y
  `CFG-04` en verde.
- `docker compose exec app npm test` → sigue en verde.
- Manual: `curl -i http://localhost:8080/api/_diagnostico` sin sesión
  devuelve `401`; con sesión de `cliente` devuelve `403`; con sesión de
  `admin` devuelve `200` sin `process.env` ni contraseñas.
