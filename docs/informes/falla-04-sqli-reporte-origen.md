# Falla #4 — Inyección SQL en el reporte de ventas por origen

**Qué es y por qué importa**
El reporte de ventas por origen (`GET /api/reportes/ventas-por-variedad?variedad=`) concatenaba el parámetro `variedad` al final de la consulta en un `HAVING`. Esto permitía cerrar la consulta original y pegar un `UNION SELECT` para leer otras tablas de la base, por ejemplo `usuarios` con sus contraseñas.

**Dónde está**
- `src/services/reportes.service.ts`, función `ventasPorVariedad()` (líneas 77 a 92), específicamente en la línea 88 (`HAVING pr.variedad = '${variedad}'`).

**Cómo se observa**
1. En el panel (Reportes → Ventas por origen) o con `curl`, mandar un payload con `UNION SELECT`:
   ```bash
   curl "http://localhost:8080/api/reportes/ventas-por-variedad?variedad=Brasil%27%20UNION%20SELECT%20username%2C%20password%2C%201%2C%201%20FROM%20usuarios--"
   ```
2. Evidencia: la respuesta JSON devolvía en `ventas` los nombres de usuario y las contraseñas de la tabla `usuarios`.

**Por qué ocurre**
El valor `variedad` que llega por query string se metía directo en el SQL. Como no había ni lista blanca ni consulta parametrizada, el motor de base de datos ejecutaba el `UNION SELECT` como parte de la misma consulta.

**Cómo se corrige**
Se validó `variedad` contra una lista blanca con los tres orígenes del catálogo (`Brasil`, `Colombia`, `Etiopía`) y se parametrizó la consulta con `$1`:

```ts
// src/services/reportes.service.ts
const VARIEDADES_PERMITIDAS: readonly Variedad[] = ['Brasil', 'Colombia', 'Etiopía'];

export async function ventasPorVariedad(variedad: string): Promise<VentaPorVariedad[]> {
  if (!VARIEDADES_PERMITIDAS.includes(variedad as Variedad)) {
    return [];
  }

  const { rows } = await db.query<VentaPorVariedad>(
    `SELECT pr.variedad, pr.nombre, SUM(pi.cantidad) AS unidades,
            SUM(pi.cantidad * pi.precio_unitario) AS total
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      GROUP BY pr.variedad, pr.nombre
     HAVING pr.variedad = $1`,
    [variedad]
  );
  return rows;
}
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → test `"el reporte por origen NO filtra otras tablas con UNION"` en verde.
- `docker compose exec app npm run check:security` → controles `SQLI-02` y `VAL-03` en verde.
- `docker compose exec app npm test` → el test funcional de ventas por variedad en verde.
- Manual: repetir el `curl` con el payload `UNION SELECT` y confirmar que devuelve `ventas: []` sin datos de `usuarios`.
