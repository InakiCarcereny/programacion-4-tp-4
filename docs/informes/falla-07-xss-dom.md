# Falla #7 — XSS de DOM (panel de administración)

**Qué es y por qué importa**
El panel leía un parámetro de la URL (`?vista=...`) y lo insertaba
directamente en la página con `innerHTML`, sin pasar por el servidor. Es un
XSS "de DOM" porque todo el ataque ocurre en el navegador: el atacante arma
un link como `admin.html?vista=<script>...</script>` y se lo manda al
administrador, apenas el admin lo abre, ya logueado
en el panel, el script corre con sus privilegios.

**Dónde está**
`public/js/admin.js`, función `init()`:

```js
var params = new URLSearchParams(window.location.search);
var objetivo = params.get("vista");
if (objetivo) {
	$("#panel-bienvenida").innerHTML = "Panel " + objetivo;
}
```

Además, el resto del archivo construía todas las tablas (pedidos,
productos, usuarios, reportes) y el resumen de KPIs concatenando strings y
asignándolos con `innerHTML`.

**Cómo se observa**
1. Iniciar sesión como administrador en `http://localhost:8080/admin.html`.
2. Abrir: `http://localhost:8080/admin.html?vista=<img src=x onerror=alert(document.cookie)>`
3. Evidencia: el navegador ejecuta el script apenas
   carga el panel, mostrando la cookie de sesión del admin en un `alert()`.

**Por qué ocurre**
El valor de `vista` viene de `window.location.search`, que el atacante
controla por completo (es parte de la URL que arma y distribuye). Se
insertaba en el DOM con `innerHTML`, que interpreta cualquier
etiqueta como HTML ejecutable.

**Cómo se corrige**

```js
// public/js/admin.js — init()
var params = new URLSearchParams(window.location.search);
var objetivo = params.get("vista");
if (objetivo) {
	$("#panel-bienvenida").textContent = "Panel " + objetivo;
}
```

**Cómo se verifica que quedó resuelto**
- Manual: repetir el paso de observación con el mismo link
  (`?vista=<img src=x onerror=alert(1)>`) y confirmar que el texto se
  muestra, sin ejecutar nada.
- `docker compose exec app npm run check:security` → control `XSS-01` en
  verde para `admin.js`.
- `docker compose exec app npm run test:seguridad` → test "el cliente NO
  inserta datos con innerHTML" en verde.
