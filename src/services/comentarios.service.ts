import * as db from "../db";
import type { Comentario, ErrorHttp } from "../tipos";

export interface NuevoComentario {
  autor: string;
  texto: string;
  calificacion: number;
}

const MAX_LARGO_AUTOR = 80;
const MAX_LARGO_TEXTO = 1000;

function errorValidacion(mensaje: string): ErrorHttp {
  const err: ErrorHttp = new Error(mensaje);
  err.status = 400;
  return err;
}

function validarComentario({
  autor,
  texto,
  calificacion,
}: NuevoComentario): NuevoComentario {
  if (
    typeof autor !== "string" ||
    autor.trim().length === 0 ||
    autor.trim().length > MAX_LARGO_AUTOR
  ) {
    throw errorValidacion(
      `El autor es obligatorio y debe tener como máximo ${MAX_LARGO_AUTOR} caracteres.`,
    );
  }

  if (
    typeof texto !== "string" ||
    texto.trim().length === 0 ||
    texto.trim().length > MAX_LARGO_TEXTO
  ) {
    throw errorValidacion(
      `El texto es obligatorio y debe tener como máximo ${MAX_LARGO_TEXTO} caracteres.`,
    );
  }

  const calificacionNumerica = Number(calificacion);
  if (
    !Number.isInteger(calificacionNumerica) ||
    calificacionNumerica < 1 ||
    calificacionNumerica > 5
  ) {
    throw errorValidacion(
      "La calificación debe ser un número entero entre 1 y 5.",
    );
  }

  return {
    autor: autor.trim(),
    texto: texto.trim(),
    calificacion: calificacionNumerica,
  };
}

export async function listar(): Promise<Comentario[]> {
  const { rows } = await db.query<Comentario>(
    "SELECT * FROM comentarios ORDER BY id DESC",
  );
  return rows;
}

export async function crear(datos: NuevoComentario): Promise<Comentario> {
  const { autor, texto, calificacion } = validarComentario(datos);
  const { rows } = await db.query<Comentario>(
    `INSERT INTO comentarios (autor, texto, calificacion)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [autor, texto, calificacion],
  );
  return rows[0];
}

export async function eliminar(
  id: number | string,
): Promise<Comentario | null> {
  const { rows } = await db.query<Comentario>(
    "DELETE FROM comentarios WHERE id = $1 RETURNING *",
    [id],
  );
  return rows[0] || null;
}
