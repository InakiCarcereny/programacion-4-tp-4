# Falla #9 — Validación débil en la creación de pedidos

**Qué es y por qué importa**
El servidor no validaba los datos que llegaban al crear un pedido (`POST /api/pedidos`). Se podían mandar cantidades negativas (que dejaban el total del pedido en negativo), cantidades con texto como `"muchos"` (que rompían la facturación con `NaN`), listas de items vacías o enormes, textos sin límite en `mesa` y `cliente`, o un `productoId` inexistente que hacía explotar el servidor con un `TypeError`.

**Dónde está**
- `src/services/pedidos.service.ts`, función `crear()` (líneas 43 a 83).

**Cómo se observa**
1. Mandar un pedido con cantidad negativa:
   ```bash
   curl -X POST http://localhost:8080/api/pedidos \
     -H "Content-Type: application/json" \
     -d '{"mesa":"1","cliente":"Prueba","items":[{"productoId":1,"cantidad":-5}]}'
   ```
   Evidencia: respondía `201` con un `total` negativo.
2. Mandar una cantidad no numérica (`"cantidad": "muchos"`):
   Evidencia: respondía `201` con `total: null` / `NaN` en la base, ensuciando la suma de facturación.

**Por qué ocurre**
El código confiaba en los tipos de TypeScript (`NuevoPedido`), pero TypeScript sólo chequea en compilación. En tiempo de ejecución el `req.body` puede traer cualquier tipo, rango o estructura si no se valida explícitamente en el servidor.

**Cómo se corrige**
Se agregó `validarPedido()` en el servicio de pedidos para chequear en el servidor tipo, rango y longitud de todos los campos, además de verificar que cada producto exista y esté activo antes de calcular el total:

```ts
// src/services/pedidos.service.ts
const MAX_ITEMS_PEDIDO = 50;
const MAX_CANTIDAD_ITEM = 100;
const MAX_LARGO_MESA = 20;
const MAX_LARGO_CLIENTE = 100;

function errorValidacion(mensaje: string): ErrorHttp {
  const err: ErrorHttp = new Error(mensaje);
  err.status = 400;
  return err;
}

function validarPedido({ mesa, cliente, items }: NuevoPedido) {
  if (typeof mesa !== 'string' || mesa.trim().length === 0 || mesa.trim().length > MAX_LARGO_MESA) {
    throw errorValidacion('La mesa es obligatoria y debe tener como máximo 20 caracteres.');
  }
  if (typeof cliente !== 'string' || cliente.trim().length === 0 || cliente.trim().length > MAX_LARGO_CLIENTE) {
    throw errorValidacion('El nombre del cliente es obligatorio y debe tener como máximo 100 caracteres.');
  }
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS_PEDIDO) {
    throw errorValidacion('El pedido debe tener entre 1 y 50 items.');
  }
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw errorValidacion('Cada item del pedido debe ser un objeto válido.');
    }
    if (typeof item.productoId !== 'number' || !Number.isInteger(item.productoId) || item.productoId <= 0) {
      throw errorValidacion('El productoId debe ser un número entero positivo.');
    }
    if (
      typeof item.cantidad !== 'number' ||
      !Number.isInteger(item.cantidad) ||
      item.cantidad < 1 ||
      item.cantidad > MAX_CANTIDAD_ITEM
    ) {
      throw errorValidacion('La cantidad debe ser un número entero entre 1 y 100.');
    }
  }
  return { mesaLimpia: mesa.trim(), clienteLimpio: cliente.trim() };
}
```

**Cómo se verifica que quedó resuelto**
- `docker compose exec app npm run test:seguridad` → tests `"no se aceptan cantidades negativas"` y `"no se aceptan cantidades no numéricas"` en verde (devuelven `400`).
- `docker compose exec app npm run check:security` → control `VAL-02` en verde.
- `docker compose exec app npm test` → todos los tests funcionales de pedidos y reportes en verde.
- Manual: repetir el `curl` con `cantidad: -5` o `"muchos"` y confirmar que responde `400`.
