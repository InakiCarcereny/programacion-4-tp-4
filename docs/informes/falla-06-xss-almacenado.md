# Falla #6 — XSS almacenado (reseñas)

**Qué es y por qué importa**
El texto de las reseñas que escriben los clientes se guarda en la base tal
cual, y al mostrarlo en la página se insertaba con `innerHTML`. A diferencia
del reflejado, acá el ataque queda **guardado**: alguien publica
una reseña con `<script>...</script>` una sola vez, y desde ese momento el
script se ejecuta en el navegador de **todos** los visitantes que entran a
ver las reseñas.

**Dónde está**
`public/js/app.js`, función `cargarReseñas()`, el HTML de cada reseña
(autor, estrellas, texto) se armaba concatenando strings y se asignaba con
`cont.innerHTML = ...`.

**Cómo se observa**
1. Levantar el proyecto y entrar a `http://localhost:8080`.
2. Publicar una reseña con un payload en el campo de texto, por ejemplo:
   `<img src=x onerror="alert(document.cookie)">`
3. Evidencia: al recargar la página, el navegador
   ejecuta el script apenas carga la lista de reseñas, no hace falta que
   nadie más interactúe con nada.

**Por qué ocurre**
`cargarReseñas()` recibía el array de comentarios desde `/api/comentarios` y
construía el HTML con concatenación de strings (por ejemplo `'<p class="review-text">'
c.texto + '</p>'`), asignado después con `innerHTML`. El navegador no
distingue "texto que escribió un cliente" de "HTML de la propia página": si
parece una etiqueta, la interpreta.

**Cómo se corrige**
Construir los nodos con `createElement` e insertar el texto con
`textContent`, que nunca interpretan el contenido como HTML:

```js
// public/js/app.js
function cargarReseñas() {
	return api("/comentarios").then(function (resp) {
		var cont = $("#lista-resenas");
		if (
			!resp.ok ||
			!resp.data.comentarios ||
			resp.data.comentarios.length === 0
		) {
			reemplazarHijos(cont, [
				crearEl("p", { class: "empty" }, [
					"Todavía no hay reseñas. ¡Sé el primero!",
				]),
			]);
			return;
		}

		var reseñas = resp.data.comentarios.map(function (c) {
			var estrellas = "";
			var i;
			for (i = 0; i < Number(c.calificacion || 0); i++) estrellas += "★";

			return crearEl("article", { class: "review" }, [
				crearEl("div", { class: "review-head" }, [
					crearEl("span", { class: "review-author" }, [texto(c.autor)]),
					crearEl("span", { class: "review-stars" }, [estrellas]),
				]),
				crearEl("p", { class: "review-text" }, [texto(c.texto)]),
			]);
		});

		reemplazarHijos(cont, reseñas);
	});
}
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run check:security` → control `XSS-01`
  en verde **para `app.js`**.
- Manual: repetir el paso de observación y confirmar que el texto se muestra como texto plano, sin ejecutar ningún script.
