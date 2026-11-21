import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn } from 'child_process';

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion, requiereRol } from '../middleware/auth';
import type { Usuario } from '../tipos';

const router = express.Router();

/**
 * Rutas del panel de administración.
 *
 * -----------------------------------------------------------------------------
 * FALLA — Autorización ausente / escalada de privilegios (OWASP A01:2021)
 * -----------------------------------------------------------------------------
 * Se exige estar autenticado, pero NO se comprueba el rol: `requiereRol` está
 * importado y no se usa. Cualquier usuario autenticado (incluso con rol
 * "cliente") entra al panel y puede:
 *   - crear, editar y BORRAR productos,
 *   - cambiar contraseñas,
 *   - dar de alta usuarios y cambiarles el rol (escalada de privilegios),
 *   - ejecutar comandos en el servidor.
 *
 * Corrección: `router.use(requiereRol('admin'))` sobre las rutas sensibles.
 * -----------------------------------------------------------------------------
 */
router.use(requiereSesion);
router.use(requiereRol('admin'));

const ROLES_VALIDOS = ['admin', 'barista', 'mozo', 'cliente'] as const;

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/usuarios/:id
 *
 * FALLA — Asignación masiva: se actualiza cualquier campo que llegue en el
 * cuerpo, incluido el `rol`. Un usuario con rol "cliente" puede mandarse
 * `{"rol": "admin"}` y convertirse en administrador.
 */
router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const { username, nombre, rol, password } = req.body || {};

    for (const [campo, valor] of Object.entries({ username, nombre, rol, password })) {
      if (valor !== undefined && typeof valor !== 'string') {
        return res.status(400).json({ error: `El campo "${campo}" debe ser texto.` });
      }
    }

    if (rol !== undefined) {
      if (!(ROLES_VALIDOS as readonly string[]).includes(rol)) {
        return res.status(400).json({ error: 'Rol inválido.' });
      }
      if (String(req.usuario!.id) === String(req.params.id)) {
        return res.status(403).json({ error: 'No podés cambiar tu propio rol.' });
      }
    }

    const cambios: Partial<Usuario> = {};
    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;
    if (rol !== undefined) cambios.rol = rol;
    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(req.params.id, cambios);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/productos — alta de producto. */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    // El nombre del producto es único en la base.
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre.' });
    }
    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.actualizar(req.params.id, req.body || {});
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/productos/:id
 *
 * FALLA — CSRF: la petición que borra un producto no lleva ningún token y se
 * acepta con un simple GET/POST desde cualquier origen.
 */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.eliminar(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/cambiar-contrasena
 *
 * FALLAS: sin token anti-CSRF, sin límite de intentos, y la contraseña nueva
 * se guarda en texto plano.
 */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};
    if (!nueva) {
      return res.status(400).json({ error: 'Falta la contraseña nueva.' });
    }
    // FALLA: no se valida la longitud ni la complejidad de la contraseña.
    // (`req.usuario!`: requiereSesion ya garantizó que hay un usuario.)
    const usuario = await usuarios.cambiarPassword(req.usuario!.id, nueva);
    res.json({ mensaje: 'Contraseña actualizada.', usuario });
  } catch (err) {
    next(err);
  }
});

const HOSTS_PERMITIDOS = (process.env.HOSTS_PROVEEDORES ?? 'localhost,127.0.0.1')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const REGEX_HOST = /^[a-zA-Z0-9]([a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/;

/**
 * POST /api/admin/probar-conexion
 *
 * -----------------------------------------------------------------------------
 * FALLA — Inyección de comandos del sistema operativo (OWASP A03:2021)
 * -----------------------------------------------------------------------------
 * La dirección del proveedor se mete dentro de una cadena de shell.
 * Como `exec` launches /bin/sh -c, los operadores del shell (|, ;, &&, $())
 * se interpretan y permiten ejecutar comandos arbitrarios en el contenedor.
 *
 * Corrección: validar el host contra una LISTA BLANCA y ejecutar el proceso
 * con `spawn('ping', ['-c', '3', host], { shell: false })`, sin pasar por el
 * shell.
 * -----------------------------------------------------------------------------
 */
router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  // FALLA: entrada de usuario concatenada en un comando de shell.
  if (typeof host !== 'string' || !REGEX_HOST.test(host)) {
    return res.status(400).json({ error: 'Host inválido.' });
  }
  if (!HOSTS_PERMITIDOS.includes(host)) {
    return res.status(403).json({ error: 'Host no permitido.' });
  }

  const args = ['-c', '3', '--', host];
  const proceso = spawn('ping', args, { shell: false, timeout: 10_000 });

  let salida = '';
  let errorSalida = '';
  proceso.stdout.on('data', (d) => (salida += d.toString()));
  proceso.stderr.on('data', (d) => (errorSalida += d.toString()));

  proceso.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'No se pudo ejecutar la prueba.' });
  });
  proceso.on('close', (codigo) => {
    if (res.headersSent) return;
    res.json({
      comando: `ping ${args.join(' ')}`,
      salida,
      error: codigo === 0 ? null : errorSalida || `ping terminó con código ${codigo}`,
    });
  });
});

const MAX_BYTES = 2 * 1024 * 1024;
const FIRMAS: Record<string, (b: Buffer) => boolean> = {
  '.png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  '.jpg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  '.jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
};

/**
 * POST /api/admin/subir-archivo
 *
 * -----------------------------------------------------------------------------
 * FALLA — Carga de archivos sin restricciones (OWASP A04:2021)
 * -----------------------------------------------------------------------------
 * No se valida la extensión, el tipo MIME ni el tamaño del archivo, y se
 * guarda con el nombre que manda el cliente (además sin sanitizar "../", lo
 * que permite escribir fuera de la carpeta de subidas). Los archivos subidos
 * se sirven con express.static desde el mismo origen.
 *
 * Corrección: validar extensión contra lista blanca (.png/.jpg/.svg saneado),
 * verificar el tipo MIME real, limitar el tamaño, generar un nombre aleatorio
 * y guardar fuera del árbol web.
 * -----------------------------------------------------------------------------
 */
router.post('/subir-archivo', express.json({ limit: '3mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (typeof nombre !== 'string' || typeof contenidoBase64 !== 'string' || !nombre || !contenidoBase64) {
      return res.status(400).json({ error: 'Falta el archivo.' });
    }

    const ext = path.extname(nombre).toLowerCase();
    const verificar = FIRMAS[ext];
    if (!verificar) {
      return res.status(400).json({ error: 'Tipo de archivo no permitido (solo png, jpg, jpeg).' });
    }

    // FALLA: sin validación de extensión, MIME ni tamaño.
    const buffer = Buffer.from(contenidoBase64, 'base64');
    if (buffer.length === 0 || buffer.length > MAX_BYTES) {
      return res.status(413).json({ error: 'El archivo está vacío o supera los 2 MB.' });
    }
    if (!verificar(buffer)) {
      return res.status(400).json({ error: 'El contenido no coincide con la extensión.' });
    }

    const nombreSeguro = `${crypto.randomUUID()}${ext}`;
    const carpeta = path.resolve(config.uploadsDir);
    fs.mkdirSync(carpeta, { recursive: true });

    // FALLA: nombre tomado del cliente sin sanear (path traversal).
    const destino = path.resolve(carpeta, nombreSeguro);
    if (path.dirname(destino) !== carpeta) {
      return res.status(400).json({ error: 'Ruta de destino inválida.' });
    }
    fs.writeFileSync(destino, buffer, { flag: 'wx' });

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombreSeguro}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
