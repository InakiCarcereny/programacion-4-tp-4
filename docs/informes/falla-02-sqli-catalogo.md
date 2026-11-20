# Falla #2 — Inyección SQL en el catálogo

**Qué es y por qué importa**
La búsqueda y los filtros del catálogo armaban la consulta SQL pegando directo el texto que mandaba el usuario. Si alguien escribe comillas y sintaxis SQL en el buscador o en los filtros, puede cambiar la lógica de la consulta: hacer que devuelva productos que no coinciden con la búsqueda, o incluso usar `UNION` para leer datos de otras tablas de la base.

**Dónde está**
- `src/services/catalogo.service.ts`, función `listar()` (líneas 35 a 50): concatenaba `tipo`, `variedad` y `q` directo en el string SQL (líneas 39 a 44).
- `src/services/catalogo.service.ts`, función `obtener()` (líneas 53 a 58): concatenaba `id` en `WHERE id = '${id}'` (línea 55).

**Cómo se observa**
1. En el menú, escribir `' OR '1'='1` en el buscador o pegarle directo a la API:
   ```bash
   curl "http://localhost:8080/api/productos?q=%27%20OR%20%271%27%3D%271"
   ```
2. También probando el filtro por origen:
   ```bash
   curl "http://localhost:8080/api/productos?variedad=Colombia%27%20OR%20%271%27%3D%271"
   ```
3. Evidencia: en vez de devolver 0 resultados (porque ningún café se llama `' OR '1'='1`), la consulta terminaba con `OR '1'='1'` y devolvía todos los productos del catálogo.

**Por qué ocurre**
El servicio armaba el texto SQL usando template strings (`${tipo}`, `${variedad}`, `${q}`, `${id}`) en lugar de pasar los valores como parámetros separados. Para PostgreSQL, lo que escribe el usuario pasa a ser parte del código de la consulta y no un simple dato.

**Cómo se corrige**
Se pasaron todas las consultas a parámetros posicionales (`$1`, `$2`, ...) y se agregó una lista blanca para `tipo` y `variedad`, además de validar que `id` sea un entero positivo:

```ts
// src/services/catalogo.service.ts
const TIPOS_PERMITIDOS: readonly TipoProducto[] = ['espresso', 'filtrado', 'pasteleria'];
const VARIEDADES_PERMITIDAS: readonly Variedad[] = ['Brasil', 'Colombia', 'Etiopía'];

export async function listar(filtros: FiltrosCatalogo = {}): Promise<ProductoConPrecio[]> {
  const { tipo, variedad, q } = filtros;

  if (tipo && !TIPOS_PERMITIDOS.includes(tipo as TipoProducto)) {
    return [];
  }
  if (variedad && !VARIEDADES_PERMITIDAS.includes(variedad as Variedad)) {
    return [];
  }

  const condiciones = ['activo = true'];
  const params: unknown[] = [];

  if (tipo) {
    params.push(tipo);
    condiciones.push(`tipo = $${params.length}`);
  }
  if (variedad) {
    params.push(variedad);
    condiciones.push(`variedad = $${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    condiciones.push(`(nombre ILIKE $${params.length} OR descripcion ILIKE $${params.length})`);
  }

  const sql = `SELECT * FROM productos WHERE ${condiciones.join(' AND ')} ORDER BY tipo, variedad NULLS FIRST, id`;
  const { rows } = await db.query<Producto>(sql, params);

  return rows.map((p) => ({ ...p, precio: calcularPrecio(p) }));
}

export async function obtener(id: Id): Promise<ProductoConPrecio | null> {
  const idNumerico = Number(id);
  if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
    return null;
  }

  const { rows } = await db.query<Producto>('SELECT * FROM productos WHERE id = $1', [idNumerico]);
  if (!rows[0]) return null;
  return { ...rows[0], precio: calcularPrecio(rows[0]) };
}
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → los tests `"la búsqueda del catálogo NO se puede ampliar con SQL"` y `"el filtro por origen NO se puede ampliar con SQL"` en verde.
- `docker compose exec app npm run check:security` → controles `SQLI-02` y `VAL-03` en verde.
- `docker compose exec app npm test` → todos los tests funcionales del catálogo en verde.
- Manual: repetir el `curl` con `' OR '1'='1` y confirmar que devuelve `productos: []` (0 resultados).
