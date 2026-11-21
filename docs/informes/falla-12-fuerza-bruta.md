# Falla #12 — Login sin protección contra fuerza bruta

**Qué es y por qué importa**
El endpoint de login aceptaba intentos ilimitados: un atacante puede probar
miles de contraseñas por segundo hasta dar con una (diccionarios, credenciales
reales filtradas, etc.). Sin límite ni bloqueo, una contraseña corta o
reutilizada cae en minutos.

**Dónde está**
`src/routes/auth.routes.ts`, la ruta `POST /api/auth/login` (línea 18): no
tenía ningún middleware de rate limiting.

**Cómo se observa**

1. Abrir `http://localhost:8080/admin.html` y fallar el login 6 veces seguidas
   con la misma clave equivocada.
2. Antes de corregir: las 6 respuestas son 401, sin cortar nada.
3. Después de corregir: la sexta responde **429 Too Many Requests** con el
   mensaje "Demasiados intentos. Probá de nuevo en unos minutos."

**Por qué ocurre**
El servidor no llevaba cuenta de los intentos fallidos por IP ni por cuenta:
cada petición se evaluaba en forma aislada, sin memoria de las anteriores.

**Cómo se corrige**

```ts
// src/routes/auth.routes.ts
import { rateLimit } from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   
  max: 5,                    
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, 
  message: { error: 'Demasiados intentos. Probá de nuevo en unos minutos.' },
});

router.post('/login', loginLimiter, async (req, res, next) => {
  // ...
});
```

`express-rate-limit` lleva la cuenta en memoria por IP: al superar el límite
responde 429 automáticamente. Con `skipSuccessfulRequests` sólo se descuentan
los intentos fallidos, de modo que un usuario legítimo que se equivocó una o
dos veces no queda bloqueado por los aciertos de otros.

**Cómo se verifica que quedó resuelto**

- `docker compose exec app npm run test:seguridad` → tests "el login bloquea o
  limita los intentos repetidos" y "el login correcto sigue funcionando
  después de un bloqueo" en verde.


**Reflexión**
En un proyecto real el rate limiting no es opcional desde el arranque: se
configura en el reverse proxy o en el framework, por IP y por cuenta, y se
acompaña con políticas de contraseñas (largas, sin reutilización) y
verificación en dos pasos para las cuentas sensibles.