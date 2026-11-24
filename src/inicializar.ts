import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { CATALOGO } from "./catalogo";
import * as db from "./db";
import type { Rol } from "./tipos";

interface UsuarioInicial {
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
}

function passwordPorDefecto(
  variableEntorno: string,
  usuarioDemo: string,
): string {
  const desdeEntorno = process.env[variableEntorno];
  if (desdeEntorno) return desdeEntorno;

  const generada = crypto.randomBytes(9).toString("base64url");
  console.warn(
    `[inicializar] ${variableEntorno} no está definida: se generó una contraseña aleatoria ` +
      `para "${usuarioDemo}" (definila en el entorno para fijarla): ${generada}`,
  );
  return generada;
}

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: "admin",
    password: passwordPorDefecto("SEED_ADMIN_PASSWORD", "admin"),
    rol: "admin",
    nombre: "Administración",
  },
  {
    username: "valentina",
    password: "origen2024",
    rol: "admin",
    nombre: "Valentina",
  },
  {
    username: "barista",
    password: "cafe123",
    rol: "barista",
    nombre: "Barista",
  },
  {
    username: "mozo",
    password: "mozo123",
    rol: "mozo",
    nombre: "Mozo de sala",
  },
  {
    username: "cliente",
    password: passwordPorDefecto("SEED_CLIENTE_PASSWORD", "cliente"),
    rol: "cliente",
    nombre: "Cliente",
  },
];

export async function inicializarBase(): Promise<void> {
  for (const usuario of USUARIOS_INICIALES) {
    const hash = await bcrypt.hash(usuario.password, 12);
    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO UPDATE
       SET password = EXCLUDED.password
     WHERE usuarios.password NOT LIKE '$2%'`,
      [usuario.username, hash, usuario.rol, usuario.nombre],
    );
  }

  for (const producto of CATALOGO) {
    await db.query(
      `INSERT INTO productos
         (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (nombre) DO NOTHING`,
      [
        producto.nombre,
        producto.tipo,
        producto.variedad,
        producto.tamano,
        producto.gramos,
        producto.precio_base,
        producto.precio_por_gramo,
        producto.descripcion,
      ],
    );
  }
}
