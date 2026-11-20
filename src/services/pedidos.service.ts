import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import type { ErrorHttp, Pedido, PedidoConItems, PedidoItem, Producto } from '../tipos';

/** Un renglón del pedido, tal como llega en el cuerpo de la petición. */
export interface ItemPedido {
  productoId: number;
  cantidad: number;
}

/** Pedido nuevo, tal como llega en el cuerpo de la petición. */
export interface NuevoPedido {
  mesa: string;
  cliente: string;
  items: ItemPedido[];
}

/** Id tal como llega en la URL (texto) o ya convertido. */
type Id = number | string;

const MAX_ITEMS_PEDIDO = 50;
const MAX_CANTIDAD_ITEM = 100;
const MAX_LARGO_MESA = 20;
const MAX_LARGO_CLIENTE = 100;

function errorValidacion(mensaje: string): ErrorHttp {
  const err: ErrorHttp = new Error(mensaje);
  err.status = 400;
  return err;
}

function validarPedido({ mesa, cliente, items }: NuevoPedido): {
  mesaLimpia: string;
  clienteLimpio: string;
} {
  if (typeof mesa !== 'string' || mesa.trim().length === 0 || mesa.trim().length > MAX_LARGO_MESA) {
    throw errorValidacion('La mesa es obligatoria y debe tener como máximo 20 caracteres.');
  }

  if (
    typeof cliente !== 'string' ||
    cliente.trim().length === 0 ||
    cliente.trim().length > MAX_LARGO_CLIENTE
  ) {
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

  return {
    mesaLimpia: mesa.trim(),
    clienteLimpio: cliente.trim(),
  };
}

/**
 * Crea un pedido a partir de una lista de items { productoId, cantidad }.
 * Total = suma de calcularPrecio(producto) x cantidad
 */
export async function crear(datos: NuevoPedido): Promise<PedidoConItems | null> {
  const { mesaLimpia, clienteLimpio } = validarPedido(datos);
  const filas: { productoId: number; cantidad: number; precioUnitario: number }[] = [];

  for (const item of datos.items) {
    const producto = await buscarProducto(item.productoId);
    if (!producto || !producto.activo) {
      throw errorValidacion('El producto solicitado no existe.');
    }
    const precioUnitario = calcularPrecio(producto);
    filas.push({
      productoId: producto.id,
      cantidad: item.cantidad,
      precioUnitario,
    });
  }

  const total = filas.reduce(
    (acc, f) => acc + f.precioUnitario * f.cantidad,
    0
  );

  const { rows } = await db.query<Pedido>(
    `INSERT INTO pedidos (mesa, cliente, estado, total)
     VALUES ($1, $2, 'abierto', $3)
     RETURNING *`,
    [mesaLimpia, clienteLimpio, total]
  );
  const pedido = rows[0];

  for (const fila of filas) {
    await db.query(
      `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [pedido.id, fila.productoId, fila.cantidad, fila.precioUnitario]
    );
  }

  return obtenerConItems(pedido.id);
}

/** Busca un producto por id (helper interno). */
async function buscarProducto(productoId: number): Promise<Producto | undefined> {
  const { rows } = await db.query<Producto>('SELECT * FROM productos WHERE id = $1', [productoId]);
  return rows[0];
}

/** Lista pedidos (con filtro opcional por mesa). */
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

/** Devuelve un pedido con sus items. */
export async function obtenerConItems(id: Id): Promise<PedidoConItems | null> {
  const { rows: pedidos } = await db.query<Pedido>(
    'SELECT * FROM pedidos WHERE id = $1',
    [id]
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const { rows: items } = await db.query<PedidoItem>(
    `SELECT pi.*, pr.nombre AS producto_nombre
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      WHERE pi.pedido_id = $1`,
    [id]
  );

  return { ...pedido, items };
}

/** Cambia el estado de un pedido. */
export async function cambiarEstado(id: Id, estado: string): Promise<Pedido | null> {
  const { rows } = await db.query<Pedido>(
    'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
    [estado, id]
  );
  return rows[0] || null;
}
