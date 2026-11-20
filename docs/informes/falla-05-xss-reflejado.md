# Falla #5 — XSS reflejado (buscador y mensajes de error)

**Qué es y por qué importa**
Varios puntos del sistema devolvían al navegador, sin escapar, texto que
venía directamente de lo que mandó el cliente (el término buscado, el id de
un producto inexistente, la URL pedida). Si ese texto contiene HTML o
JavaScript (por ejemplo `<script>alert(1)</script>`), el navegador lo
ejecuta como si fuera parte de la página. Es "reflejado" porque no
queda guardado en ningún lado: el atacante arma un link con el payload y se
lo manda a la víctima; apenas la víctima lo abre, el script corre en su
sesión.

**Dónde está**
- `public/js/app.js` — `renderResultado()`, insertaba `filtros.q` (lo que el
  usuario escribió en el buscador) con `innerHTML`.
- `src/routes/productos.routes.ts`, el 404 de producto devolvía
  `` `No existe el producto "${req.params.id}".` ``, reflejando el id tal
  cual.
- `src/middleware/errores.ts`, el 404 genérico devolvía
  `` `Ruta no encontrada: ${req.originalUrl}` ``, reflejando la URL pedida.

**Cómo se observa**
1. Pedir un producto con un id que incluya HTML:

   ```bash
   curl "http://localhost:8080/api/productos/%3Cscript%3Ealert(1)%3C%2Fscript%3E"
   ```
2. Evidencia: la respuesta incluía literalmente
   `<script>alert(1)</script>` dentro del campo `error`.
3. Mismo chequeo para una ruta inexistente:

   ```bash
   curl "http://localhost:8080/api/<script>alert(1)</script>"
   ```
4. En el buscador escribir
   `<img src=x onerror=alert(1)>` y ver que antes de corregir el navegador
   llegaba a interpretar las etiquetas en el texto "Resultados para...".

**Por qué ocurre**
En los tres casos, el valor recibido del cliente (`req.params.id`,
`req.originalUrl`, `filtros.q`) se insertaba directamente en una respuesta
HTML/JSON que después el frontend pintaba con `innerHTML`, sin pasar por
ningún escape ni por `textContent`.

**Cómo se corrige**

Backend — mensajes genéricos, sin reflejar la entrada:
```ts
// src/routes/productos.routes.ts
if (!producto) {
  return res.status(404).json({ error: 'No existe el producto solicitado.' });
}
```
```ts
// src/middleware/errores.ts
export function rutaNoEncontrada(req: Request, res: Response): void {
	res.status(404).json({ error: "Ruta no encontrada." });
}
```

Frontend — insertar el término buscado como texto, no como HTML:
```js
// public/js/app.js
function renderResultado(filtros, total) {
	var contenedor = $("#resultado-busqueda");

	if (filtros && filtros.q) {
		reemplazarHijos(contenedor, [
			"Resultados para ",
			crearEl("strong", {}, [texto(filtros.q)]),
			" — " + total + " producto(s)",
		]);
	} else {
		contenedor.textContent = total + " producto(s) en el menú";
	}
}
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → test "el servidor NO refleja HTML en las respuestas" en verde.
