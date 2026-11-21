import express from "express";
import helmet from "helmet";
import path from "path";
import config from "./config";
import { emitirTokenCsrf, verificarCsrf } from "./middleware/csrf";
import { manejadorErrores, rutaNoEncontrada } from "./middleware/errores";
import adminRoutes from "./routes/admin.routes";
import authRoutes from "./routes/auth.routes";
import comentariosRoutes from "./routes/comentarios.routes";
import debugRoutes from "./routes/debug.routes";
import pedidosRoutes from "./routes/pedidos.routes";
import productosRoutes from "./routes/productos.routes";
import reportesRoutes from "./routes/reportes.routes";

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
      },
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Archivos subidos por el panel de administración.
app.use("/uploads", express.static(config.uploadsDir));

// Sitio web estático
app.use(express.static(path.join(__dirname, "public")));

// --- API --------------------------------------------------------------------
app.get("/api/salud", (req, res) => {
  res.json({
    ok: true,
    servicio: "cafeteria-origen",
    hora: new Date().toISOString(),
  });
});

app.get("/api/csrf-token", emitirTokenCsrf);
app.use("/api", verificarCsrf);

app.use("/api/auth", authRoutes);
app.use("/api/productos", productosRoutes);
app.use("/api/pedidos", pedidosRoutes);
app.use("/api/reportes", reportesRoutes);
app.use("/api/comentarios", comentariosRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/_diagnostico", debugRoutes);

app.use("/api", rutaNoEncontrada);

app.use(manejadorErrores);

export default app;
