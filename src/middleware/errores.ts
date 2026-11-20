import type { NextFunction, Request, Response } from "express";

import type { ErrorHttp } from "../tipos";

export function rutaNoEncontrada(req: Request, res: Response): void {
  res.status(404).json({ error: `Ruta no encontrada: ${req.originalUrl}` });
}

// Express reconoce al manejador de errores por sus CUATRO parámetros: `next`
// tiene que estar aunque no se use.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
