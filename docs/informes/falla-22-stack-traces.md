# Falla #22 — Stack traces al cliente

**Qué es y por qué importa**
El manejador de errores global devolvía `err.message` **y** `err.stack`
completos en la respuesta JSON. El stack trace revela rutas internas del
servidor, nombres de archivos y de tablas, fragmentos de consultas SQL y
versiones de librerías — información que facilita un ataque dirigido.

**Dónde está**
`src/middleware/errores.ts`, dentro de `manejadorErrores`:

```ts
res.status(err.status || 500).json({
  error: err.message,
  stack: err.stack,
});
```

**Cómo se observa**

1. Forzar un error, por ejemplo un pedido con un producto inexistente:

   ```bash
   curl -X POST http://localhost:8080/api/pedidos \
     -H "Content-Type: application/json" \
     -d '{"mesa":"1","cliente":"Prueba","items":[{"productoId":999999,"cantidad":1}]}'
   ```

2. Evidencia: la respuesta incluye un campo `"stack"` con rutas absolutas del
   servidor (`/app/src/services/...`) y números de línea.

**Por qué ocurre**
El error capturado por el middleware se reenviaba tal cual al cliente, sin
distinguir entre lo que el servidor loguea para sí mismo y lo que el cliente
necesita ver.

**Cómo se corrige**

```ts
// src/middleware/errores.ts
export function manejadorErrores(
  err: ErrorHttp,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  console.error("[error]", err.message, err.stack);

  res.status(err.status || 500).json({
    error: "Error interno del servidor",
  });
}
```

**Cómo se verifica que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → test "la API NO devuelve
  stack traces al cliente" en verde.
- `docker compose exec app npm run check:security` → control `VAL-06` en
  verde.
- Manual: repetir el `curl` del paso de observación y confirmar que no hay
  campo `"stack"` ni rutas de archivo en la respuesta.
