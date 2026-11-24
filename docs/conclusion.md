# Reflexión final

Lo que más nos cambió la forma de pensar fue entender que una falla de
seguridad casi nunca es "una línea mal escrita en un lugar puntual", es un
patrón que se repite por todo el código. Nos pasó con el XSS: pensábamos que
arreglar las dos o tres líneas marcadas como `FALLA` en los comentarios iba
a ser suficiente, y terminamos reescribiendo prácticamente todo `app.js` y
`admin.js`, porque cualquier `innerHTML` en cualquier parte del archivo era,
en potencia, la misma vulnerabilidad. Eso nos hizo ver la seguridad menos
como una lista de bugs puntuales y más como una forma de escribir código seguro.

También cambió cómo pensamos la confianza en los datos. Antes escribíamos
primero la funcionalidad y recién después, si quedaba tiempo, pensábamos en
validar. Ahora la pregunta de "¿este valor puede venir manipulado por
alguien de afuera?" aparece antes de escribir la query, el render o la
respuesta del error, no después. La inyección SQL, el XSS reflejado y el
XSS de DOM eran, en el fondo, la misma idea repetida en tres capas distintas
(base de datos, HTML, DOM): confiar en que lo que llega del cliente va a
comportarse como uno espera.

Por último, nos quedó claro que "funciona" y "está bien hecho" no son lo
mismo. El sitio funcionaba perfecto con todas estas fallas adentro.
