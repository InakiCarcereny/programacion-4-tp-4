/* =============================================================================
   Cafetería Origen — lógica del panel de administración
   ============================================================================= */
(function () {
  "use strict";

  var API = "/api";
  var usuario = null;
  var productosCache = {};

  var ESTADOS_PEDIDO = ["abierto", "preparando", "listo", "entregado"];
  var ROLES = ["cliente", "mozo", "barista", "admin"];

  function $(sel) {
    return document.querySelector(sel);
  }
  function $$(sel) {
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  function money(valor) {
    return Number(valor || 0).toLocaleString("es-AR", {
      style: "currency",
      currency: "ARS",
    });
  }

  function texto(valor) {
    return valor == null ? "" : String(valor);
  }

  function crearEl(tag, opciones, hijos) {
    var nodo = document.createElement(tag);
    opciones = opciones || {};
    Object.keys(opciones).forEach(function (clave) {
      if (clave === "class") nodo.className = opciones[clave];
      else nodo.setAttribute(clave, opciones[clave]);
    });
    (hijos || []).forEach(function (hijo) {
      if (hijo == null) return;
      nodo.appendChild(
        typeof hijo === "string" ? document.createTextNode(hijo) : hijo,
      );
    });
    return nodo;
  }

  function vaciar(nodo) {
    while (nodo.firstChild) nodo.removeChild(nodo.firstChild);
  }

  function reemplazarHijos(nodo, hijos) {
    vaciar(nodo);
    (hijos || []).forEach(function (hijo) {
      if (hijo == null) return;
      nodo.appendChild(
        typeof hijo === "string" ? document.createTextNode(hijo) : hijo,
      );
    });
  }

  function api(url, opciones) {
    return fetch(API + url, opciones).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { ok: res.ok, status: res.status, data: data };
        });
    });
  }

  function postJSON(url, cuerpo) {
    return api(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function putJSON(url, cuerpo) {
    return api(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function patchJSON(url, cuerpo) {
    return api(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo || {}),
    });
  }

  function feedback(el, mensaje, ok) {
    el.className = "form-feedback " + (ok ? "is-ok" : "is-error");
    el.textContent = mensaje;
  }

  function crearKpi(k) {
    return crearEl("div", { class: "kpi" }, [
      crearEl("div", { class: "kpi-label" }, [texto(k.label)]),
      crearEl("div", { class: "kpi-value" }, [texto(k.value)]),
    ]);
  }

  /* ------------------------------------------------------------------ login */
  function iniciarSesion(evento) {
    evento.preventDefault();
    var caja = $("#login-feedback");
    caja.className = "form-feedback";

    postJSON("/auth/login", {
      username: $("#login-usuario").value,
      password: $("#login-password").value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(
          caja,
          "No pudimos iniciar sesión: " +
            (resp.data.error || "error desconocido"),
          false,
        );
        return;
      }
      usuario = resp.data.usuario;
      mostrarPanel();
    });
  }

  function cerrarSesion() {
    postJSON("/auth/logout", {}).then(function () {
      usuario = null;
      $("#vista-login").hidden = false;
      $("#vista-panel").hidden = true;
      $("#admin-user").textContent = "";
    });
  }

  function mostrarPanel() {
    $("#vista-login").hidden = true;
    $("#vista-panel").hidden = false;
    reemplazarHijos($("#admin-user"), [
      "Sesión de ",
      crearEl("strong", {}, [texto(usuario.nombre)]),
      " · rol: ",
      crearEl("strong", {}, [texto(usuario.rol)]),
    ]);
    $("#panel-bienvenida").textContent = "Hola, " + usuario.nombre;
    cargarTodo();
  }

  function cargarTodo() {
    cargarResumen();
    cargarPedidos();
    cargarProductos();
    cargarReportes();
    cargarUsuarios();
  }

  /* ---------------------------------------------------------------- resumen */
  function cargarResumen() {
    api("/reportes/facturacion").then(function (f) {
      api("/reportes/mas-vendido").then(function (m) {
        api("/reportes/cantidad-vendida").then(function (c) {
          var mas = m.data.producto;
          var kpis = [
            { label: "Facturación total", value: money(f.data.facturado) },
            { label: "Pedidos registrados", value: f.data.pedidos },
            {
              label: "Producto más vendido",
              value: mas ? texto(mas.nombre) : "—",
            },
            {
              label: "Unidades por tipo",
              value:
                Object.keys(c.data.cantidadVendida || {})
                  .map(function (k) {
                    return k + ": " + c.data.cantidadVendida[k];
                  })
                  .join(" · ") || "—",
            },
          ];

          reemplazarHijos($("#kpis"), kpis.map(crearKpi));
        });
      });
    });
  }

  /* --------------------------------------------------------------- pedidos */
  function crearSelectEstado(pedido) {
    return crearEl(
      "select",
      { class: "sel-estado", "data-pedido": texto(pedido.id) },
      ESTADOS_PEDIDO.map(function (e) {
        var opt = crearEl("option", { value: e }, [e]);
        if (e === pedido.estado) opt.selected = true;
        return opt;
      }),
    );
  }

  function llenarTablaPedidos(tabla, filas, conAcciones) {
    vaciar(tabla);

    if (!filas || filas.length === 0) {
      tabla.appendChild(crearEl("p", { class: "empty" }, ["No hay pedidos."]));
      return;
    }

    var columnas = [
      { texto: "#" },
      { texto: "Mesa" },
      { texto: "Cliente" },
      { texto: "Estado" },
      { texto: "Total", class: "num" },
      { texto: "Fecha" },
    ];
    if (conAcciones) columnas.push({ texto: "Acciones" });

    var thead = crearEl("thead", {}, [
      crearEl(
        "tr",
        {},
        columnas.map(function (col) {
          return crearEl("th", col.class ? { class: col.class } : {}, [
            col.texto,
          ]);
        }),
      ),
    ]);

    var tbody = crearEl(
      "tbody",
      {},
      filas.map(function (p) {
        var celdas = [
          crearEl("td", {}, [texto(p.id)]),
          crearEl("td", {}, [texto(p.mesa)]),
          crearEl("td", {}, [texto(p.cliente)]),
          crearEl("td", {}, [
            crearEl("span", { class: "badge badge-" + texto(p.estado) }, [
              texto(p.estado),
            ]),
          ]),
          crearEl("td", { class: "num" }, [money(p.total)]),
          crearEl("td", {}, [new Date(p.creado_en).toLocaleString("es-AR")]),
        ];
        if (conAcciones) {
          celdas.push(crearEl("td", {}, [crearSelectEstado(p)]));
        }
        return crearEl("tr", {}, celdas);
      }),
    );

    tabla.appendChild(thead);
    tabla.appendChild(tbody);
  }

  function cargarPedidos() {
    api("/pedidos").then(function (resp) {
      var pedidos = resp.data.pedidos || [];
      llenarTablaPedidos($("#tabla-pedidos"), pedidos, true);
      llenarTablaPedidos($("#tabla-ultimos"), pedidos.slice(0, 5), false);
    });
  }

  function cambiarEstado(evento) {
    var select = evento.target.closest(".sel-estado");
    if (!select) return;
    var id = select.getAttribute("data-pedido");
    patchJSON("/pedidos/" + id + "/estado", { estado: select.value }).then(
      function (resp) {
        if (!resp.ok) {
          alert(
            "No se pudo cambiar el estado: " + (resp.data.error || "error"),
          );
        }
        cargarPedidos();
      },
    );
  }

  /* ------------------------------------------------------------- productos */
  function llenarTablaProductos(tabla, productos) {
    vaciar(tabla);
    productosCache = {};

    var thead = crearEl("thead", {}, [
      crearEl("tr", {}, [
        crearEl("th", {}, ["#"]),
        crearEl("th", {}, ["Nombre"]),
        crearEl("th", {}, ["Tipo"]),
        crearEl("th", {}, ["Origen"]),
        crearEl("th", { class: "num" }, ["Precio"]),
        crearEl("th", {}, ["Acciones"]),
      ]),
    ]);

    var tbody = crearEl(
      "tbody",
      {},
      productos.map(function (p) {
        productosCache[p.id] = p;
        return crearEl("tr", {}, [
          crearEl("td", {}, [texto(p.id)]),
          crearEl("td", {}, [texto(p.nombre)]),
          crearEl("td", {}, [texto(p.tipo)]),
          crearEl("td", {}, [texto(p.variedad || "—")]),
          crearEl("td", { class: "num" }, [money(p.precio)]),
          crearEl("td", {}, [
            crearEl(
              "button",
              { class: "link-danger", "data-borrar": texto(p.id) },
              ["Borrar"],
            ),
          ]),
        ]);
      }),
    );

    tabla.appendChild(thead);
    tabla.appendChild(tbody);
  }

  function cargarProductos() {
    api("/productos").then(function (resp) {
      llenarTablaProductos($("#tabla-productos"), resp.data.productos || []);
    });
  }

  function guardarProducto(evento) {
    evento.preventDefault();
    var caja = $("#producto-feedback");
    var id = $("#producto-id").value;

    var cuerpo = {
      nombre: $("#p-nombre").value,
      tipo: $("#p-tipo").value,
      variedad: $("#p-variedad").value || null,
      tamano: $("#p-tamano").value || null,
      gramos: $("#p-gramos").value ? Number($("#p-gramos").value) : null,
      precio_base: Number($("#p-precio-base").value || 0),
      precio_por_gramo: Number($("#p-precio-gramo").value || 0),
      descripcion: $("#p-descripcion").value,
    };

    var peticion = id
      ? putJSON("/admin/productos/" + id, cuerpo)
      : postJSON("/admin/productos", cuerpo);

    peticion.then(function (resp) {
      if (!resp.ok) {
        feedback(
          caja,
          "No se pudo guardar: " + (resp.data.error || "error desconocido"),
          false,
        );
        return;
      }
      feedback(caja, "Producto guardado correctamente.", true);
      $("#form-producto").reset();
      $("#producto-id").value = "";
      cargarProductos();
    });
  }

  function borrarProducto(evento) {
    var btn = evento.target.closest("[data-borrar]");
    if (!btn) return;
    var id = btn.getAttribute("data-borrar");
    if (!confirm("¿Borrar el producto #" + id + "?")) return;

    api("/admin/productos/" + id, { method: "DELETE" }).then(function (resp) {
      if (!resp.ok) alert("No se pudo borrar: " + (resp.data.error || "error"));
      cargarProductos();
    });
  }

  function limpiarFormularioProducto() {
    $("#form-producto").reset();
    $("#producto-id").value = "";
  }

  /* ---------------------------------------------------------------- upload */
  function subirArchivo(evento) {
    evento.preventDefault();
    var caja = $("#upload-feedback");
    var input = $("#archivo-subida");
    if (!input.files || !input.files[0]) {
      feedback(caja, "Elegí un archivo primero.", false);
      return;
    }

    var archivo = input.files[0];
    var lector = new FileReader();

    lector.onload = function () {
      var base64 = String(lector.result).split(",")[1] || "";
      postJSON("/admin/subir-archivo", {
        nombre: archivo.name,
        contenidoBase64: base64,
      }).then(function (resp) {
        if (!resp.ok) {
          feedback(
            caja,
            "No se pudo subir: " + (resp.data.error || "error desconocido"),
            false,
          );
          return;
        }
        feedback(caja, "Archivo subido a " + resp.data.url, true);
      });
    };

    lector.readAsDataURL(archivo);
  }

  /* -------------------------------------------------------------- reportes */
  function cargarReportes() {
    api("/reportes/facturacion").then(function (f) {
      api("/reportes/ticket-promedio").then(function (t) {
        api("/reportes/mas-vendido").then(function (m) {
          var mas = m.data.producto;
          var kpis = [
            { label: "Facturación", value: money(f.data.facturado) },
            { label: "Pedidos", value: f.data.pedidos },
            { label: "Ticket promedio", value: money(t.data.promedio) },
            {
              label: "Más vendido",
              value: mas
                ? texto(mas.nombre) + " (" + texto(mas.unidades) + ")"
                : "—",
            },
          ];
          reemplazarHijos($("#kpis-reportes"), kpis.map(crearKpi));
        });
      });
    });
  }

  function consultarVentas() {
    var caja = $("#reporte-feedback");
    var variedad = $("#reporte-variedad").value;
    var tabla = $("#tabla-ventas");

    api(
      "/reportes/ventas-por-variedad?variedad=" + encodeURIComponent(variedad),
    ).then(function (resp) {
      if (!resp.ok) {
        feedback(caja, "Error: " + (resp.data.error || "desconocido"), false);
        vaciar(tabla);
        return;
      }

      var ventas = resp.data.ventas || [];

      var thead = crearEl("thead", {}, [
        crearEl("tr", {}, [
          crearEl("th", {}, ["Origen"]),
          crearEl("th", {}, ["Producto"]),
          crearEl("th", { class: "num" }, ["Unidades"]),
          crearEl("th", { class: "num" }, ["Total"]),
        ]),
      ]);

      var tbody = crearEl(
        "tbody",
        {},
        ventas.map(function (v) {
          return crearEl("tr", {}, [
            crearEl("td", {}, [texto(v.variedad)]),
            crearEl("td", {}, [texto(v.nombre)]),
            crearEl("td", { class: "num" }, [texto(v.unidades)]),
            crearEl("td", { class: "num" }, [money(v.total)]),
          ]);
        }),
      );

      vaciar(tabla);
      tabla.appendChild(thead);
      tabla.appendChild(tbody);

      feedback(caja, "Consulta realizada.", true);
    });
  }

  /* -------------------------------------------------------------- usuarios */
  function crearSelectRol(u) {
    return crearEl(
      "select",
      { class: "sel-rol", "data-usuario": texto(u.id) },
      ROLES.map(function (r) {
        var opt = crearEl("option", { value: r }, [r]);
        if (r === u.rol) opt.selected = true;
        return opt;
      }),
    );
  }

  function cargarUsuarios() {
    api("/admin/usuarios").then(function (resp) {
      var usuarios = resp.data.usuarios || [];
      var tabla = $("#tabla-usuarios");

      var thead = crearEl("thead", {}, [
        crearEl("tr", {}, [
          crearEl("th", {}, ["#"]),
          crearEl("th", {}, ["Usuario"]),
          crearEl("th", {}, ["Nombre"]),
          crearEl("th", {}, ["Rol"]),
          crearEl("th", {}, ["Acciones"]),
        ]),
      ]);

      var tbody = crearEl(
        "tbody",
        {},
        usuarios.map(function (u) {
          var claseBadge = "badge" + (u.rol === "admin" ? " badge-admin" : "");
          return crearEl("tr", {}, [
            crearEl("td", {}, [texto(u.id)]),
            crearEl("td", {}, [texto(u.username)]),
            crearEl("td", {}, [texto(u.nombre)]),
            crearEl("td", {}, [
              crearEl("span", { class: claseBadge }, [texto(u.rol)]),
            ]),
            crearEl("td", {}, [crearSelectRol(u)]),
          ]);
        }),
      );

      vaciar(tabla);
      tabla.appendChild(thead);
      tabla.appendChild(tbody);
    });
  }

  function cambiarRol(evento) {
    var select = evento.target.closest(".sel-rol");
    if (!select) return;
    var id = select.getAttribute("data-usuario");

    putJSON("/admin/usuarios/" + id, { rol: select.value }).then(
      function (resp) {
        if (!resp.ok)
          alert("No se pudo actualizar: " + (resp.data.error || "error"));
        cargarUsuarios();
      },
    );
  }

  function cambiarPassword(evento) {
    evento.preventDefault();
    var caja = $("#password-feedback");
    postJSON("/admin/cambiar-contrasena", {
      nueva: $("#nueva-password").value,
    }).then(function (resp) {
      if (!resp.ok) {
        feedback(
          caja,
          "No se pudo cambiar: " + (resp.data.error || "error desconocido"),
          false,
        );
        return;
      }
      feedback(caja, "Contraseña actualizada.", true);
      $("#nueva-password").value = "";
    });
  }

  /* ----------------------------------------------------------- herramientas */
  function probarConexion(evento) {
    evento.preventDefault();
    var salida = $("#salida-conexion");
    salida.textContent = "Probando…";

    postJSON("/admin/probar-conexion", {
      host: $("#conexion-host").value,
    }).then(function (resp) {
      if (!resp.ok) {
        salida.textContent = "Error: " + (resp.data.error || "desconocido");
        return;
      }
      salida.textContent =
        "$ " +
        resp.data.comando +
        "\n\n" +
        (resp.data.salida || "") +
        (resp.data.error ? "\n[stderr]\n" + resp.data.error : "");
    });
  }

  function verDiagnostico() {
    var salida = $("#salida-diagnostico");
    salida.textContent = "Cargando…";
    api("/_diagnostico").then(function (resp) {
      salida.textContent = JSON.stringify(resp.data, null, 2);
    });
  }

  /* ------------------------------------------------------------------ tabs */
  function activarTab(evento) {
    var tab = evento.target.closest(".tab");
    if (!tab) return;
    var vista = tab.getAttribute("data-vista");
    $$(".tab").forEach(function (t) {
      t.classList.remove("is-active");
    });
    tab.classList.add("is-active");
    $$(".tab-panel").forEach(function (p) {
      p.classList.toggle("is-active", p.getAttribute("data-panel") === vista);
    });
  }

  /* ------------------------------------------------------------------ init */
  function init() {
    var params = new URLSearchParams(window.location.search);
    var objetivo = params.get("vista");
    if (objetivo) {
      $("#panel-bienvenida").textContent = "Panel " + objetivo;
    }

    $("#form-login").addEventListener("submit", iniciarSesion);
    $("#btn-logout").addEventListener("click", cerrarSesion);
    $("#btn-refrescar").addEventListener("click", cargarTodo);
    $("#tabs").addEventListener("click", activarTab);
    $("#tabla-pedidos").addEventListener("change", cambiarEstado);
    $("#tabla-productos").addEventListener("click", borrarProducto);
    $("#form-producto").addEventListener("submit", guardarProducto);
    $("#btn-limpiar-producto").addEventListener(
      "click",
      limpiarFormularioProducto,
    );
    $("#form-upload").addEventListener("submit", subirArchivo);
    $("#form-password").addEventListener("submit", cambiarPassword);
    $("#btn-reporte-variedad").addEventListener("click", consultarVentas);
    $("#tabla-usuarios").addEventListener("change", cambiarRol);
    $("#form-conexion").addEventListener("submit", probarConexion);
    $("#btn-diagnostico").addEventListener("click", verDiagnostico);

    api("/auth/yo").then(function (resp) {
      if (resp.ok) {
        usuario = resp.data.usuario;
        mostrarPanel();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
