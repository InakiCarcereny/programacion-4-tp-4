import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import { leerCookies } from './sesion';

const tokensCsrf = new Map<string, string>();

/** Genera (o reutiliza) y devuelve el token anti-CSRF de la sesión actual. */
export function emitirTokenCsrf(req: Request, res: Response): void {
  const cookies = leerCookies(req);
  const existente = (cookies.sid && tokensCsrf.get(cookies.sid)) || cookies.csrf;
  const token = existente || crypto.randomBytes(32).toString('hex');

  if (cookies.sid) {
    tokensCsrf.set(cookies.sid, token);
  }

  res.cookie('csrf', token, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.json({ token, csrfToken: token });
}

/** Valida el token anti-CSRF y Origin/Referer en peticiones que cambian estado. */
export function verificarCsrf(req: Request, res: Response, next: NextFunction) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  if (req.path === '/auth/login') {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  const host = req.headers.host;
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return res.status(403).json({ error: 'Origen de la petición inválido.' });
      }
    } catch {
      return res.status(403).json({ error: 'Origen de la petición inválido.' });
    }
  }

  const cookies = leerCookies(req);
  const tokenEsperado =
    (cookies.sid && tokensCsrf.get(cookies.sid)) || cookies.csrf || '';
  const headerToken = req.headers['x-csrf-token'];
  const tokenRecibido =
    (typeof headerToken === 'string' ? headerToken : '') ||
    (typeof req.body?._csrf === 'string' ? req.body._csrf : '') ||
    (typeof req.query?._csrf === 'string' ? req.query._csrf : '');

  if (
    !tokenRecibido ||
    !tokenEsperado ||
    tokenRecibido.length !== tokenEsperado.length ||
    !crypto.timingSafeEqual(Buffer.from(tokenRecibido), Buffer.from(tokenEsperado))
  ) {
    return res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
  }

  next();
}
