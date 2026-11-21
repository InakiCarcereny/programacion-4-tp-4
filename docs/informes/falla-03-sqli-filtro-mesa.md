# Falla #3 — Inyección SQL en el filtro por mesa de pedidos

**Qué es y por qué importa**
El endpoint que lista los pedidos permite filtrar por mesa (`?mesa=`). Como ese valor se pegaba directo dentro de la consulta SQL, cualquiera podía mandar una expresión como `' OR '1'='1` y saltarse el filtro para ver los pedidos de todas las mesas, o armar consultas con `UNION` para leer otras tablas.

**Dónde está**
- `src/services/pedidos.service.ts`, función `listar()` (líneas 92 a 100), específicamente la concatenación en la línea 95 (`if (mesa) sql += \` WHERE mesa = '${mesa}'\`;`).

**Cómo se observa**
1. Hacer una petición al listado de pedidos mandando un payload SQL en `mesa`:
   ```bash
   curl "http://localhost:8080/api/pedidos?mesa=%27%20OR%20%271%27%3D%271"
   ```
2. Evidencia: aunque no hay ninguna mesa llamada `' OR '1'='1`, la API devolvía todos los pedidos cargados en la base de datos.

**Por qué ocurre**
El parámetro `mesa` que viene del cliente se concatenaba en el string de la consulta SQL en vez de pasarse como parámetro con `$1`. Al venir con comillas simples, cerraba el string en SQL y el `OR '1'='1'` se evaluaba como verdadero para todas las filas.

**Cómo se corrige**
Se reemplazó la concatenación por una consulta parametrizada con `$1`:

```ts
// src/services/pedidos.service.ts
export async function listar(mesa?: string): Promise<Pedido[]> {
  if (mesa) {
    const { rows } = await db.query<Pedido>(
      'SELECT * FROM pedidos WHERE mesa = $1 ORDER BY id DESC',
      [mesa]
    );
    return rows;
  }

  const { rows } = await db.query<Pedido>('SELECT * FROM pedidos ORDER BY id DESC');
  return rows;
}
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → test `"el filtro por mesa NO se puede ampliar con SQL"` en verde.
- `docker compose exec app npm run check:security` → control `SQLI-02` en verde.
- `docker compose exec app npm test` → los tests funcionales de pedidos en verde.
- Manual: repetir el `curl` con `?mesa=' OR '1'='1` y confirmar que devuelve `pedidos: []`.
