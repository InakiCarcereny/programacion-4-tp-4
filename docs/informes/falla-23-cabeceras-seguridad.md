# Falla #23 — Sin cabeceras de seguridad (helmet, CSP)

**Qué es y por qué importa**
El servidor no enviaba cabeceras HTTP de seguridad (`Content-Security-Policy`,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`). Sin ellas, el
navegador no tiene ninguna capa extra de defensa: un XSS que logre inyectar un
`<script>` se ejecuta sin restricciones, la página puede embeberse en un
`<iframe>` ajeno y el navegador puede interpretar mal el
`Content-Type` de un archivo subido.

**Dónde está**
`src/app.ts`, (`const app = express();`) no había ningún
`app.use(helmet(...))` antes de registrar las rutas. La dependencia `helmet`
ya estaba en `package.json` pero nunca se usaba.

**Cómo se observa**
1. Levantar el proyecto: `docker compose up -d --build`.
2. `curl -I http://localhost:8080/`
3. Evidencia: no aparecen las cabeceras `Content-Security-Policy`,
   `X-Content-Type-Options`, `X-Frame-Options` ni `Referrer-Policy` en la
   respuesta.

**Por qué ocurre**
`helmet` figuraba como dependencia instalada pero no se conectaba al
middleware stack de Express.

**Cómo se corrige**

```ts
// src/app.ts
import helmet from "helmet";

const app = express();

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				objectSrc: ["'none'"],
				baseUri: ["'none'"],
			},
		},
	}),
);
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → test "el sitio envía
  cabeceras de seguridad" en verde.
- `docker compose exec app npm run check:security` → controles `CFG-01` y
  `XSS-03` en verde.
- Manual: `curl -I http://localhost:8080/` y confirmar que aparecen las
  cuatro cabeceras.
