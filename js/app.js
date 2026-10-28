import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, onSnapshot, runTransaction, writeBatch, query, orderBy, limit, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const db = getFirestore(initializeApp(firebaseConfig));
const $ = (s) => document.querySelector(s);

/* ================= Constantes y utilidades ================= */
const CATEGORIAS = [
  "Hardware / Placas de video", "Hardware / Procesadores", "Hardware / Memorias RAM",
  "Hardware / Almacenamiento", "Hardware / Motherboards", "Hardware / Fuentes y gabinetes",
  "Periféricos", "Redes", "Notebooks", "Monitores", "Otros"
];
// Campos que se pueden modificar a mano. El stock NO está acá: solo cambia con
// movimientos (venta, entrada, devolución), así siempre queda registro.
const CAMPOS_EDITABLES = ["nombre", "categoria", "marca", "precio", "sku"];
const STOCK_BAJO = 5;
const MOTIVOS_BAJA = {
  fuera_de_comercializacion: "Fuera de comercialización",
  rotura: "Rotura",
  garantia: "Garantía / devolución a proveedor",
  otro: "Otro"
};
const TIPOS_MOVIMIENTO = {
  alta: "Alta", salida: "Venta", reposicion: "Reposición", devolucion: "Devolución",
  baja: "Desactivación comercial", baja_stock: "Baja de stock", baja_error: "Baja por error de carga", reactivacion: "Reactivación"
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesos = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

function mostrarExito(mensaje) {
  $("#exito-mensaje").textContent = mensaje;
  $("#dlg-exito").showModal();
}

// Error de regla de negocio: su mensaje se le muestra tal cual al usuario.
class ReglaError extends Error {}

async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const soloEditables = (permisos) => (permisos || []).filter((p) => CAMPOS_EDITABLES.includes(p));

let sesion = JSON.parse(sessionStorage.getItem("sesion") || "null");
if (sesion) sesion.permisos = soloEditables(sesion.permisos);
let insumos = [];
let usuarios = [];
let desuscribir = [];
let insumoEditandoId = null;
let insumoOriginal = null;
let ventaInsumoId = null;
let ventaPrecioUnitario = 0;
let entradaInsumoId = null;
let bajaInsumoId = null;
let movimientos = [];
let usuarioEditando = null;
let ordenInsumos = { campo: "nombre", direccion: 1 };

const esAdmin = () => sesion?.rol === "admin";
const puedeEditarCampo = (campo) => esAdmin() || sesion.permisos.includes(campo);
const estaActivo = (i) => i.activo !== false;   // los insumos viejos no tienen el campo: cuentan como activos

/* ================= Usuarios precargados ================= */
async function precargarUsuarios() {
  const snap = await getDocs(query(collection(db, "usuarios"), limit(1)));
  if (!snap.empty) return;
  await setDoc(doc(db, "usuarios", "admin"), {
    usuario: "admin", rol: "admin", activo: true,
    passHash: await sha256("admin123"), permisos: [...CAMPOS_EDITABLES]
  });
  await setDoc(doc(db, "usuarios", "empleado"), {
    usuario: "empleado", rol: "usuario", activo: true,
    passHash: await sha256("empleado123"), permisos: []
  });
}

/* ================= Login / sesión ================= */
$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#login-error");
  error.textContent = "";
  const user = $("#login-usuario").value.trim().toLowerCase();
  const pass = $("#login-pass").value;
  try {
    const snap = await getDoc(doc(db, "usuarios", user));
    const d = snap.data();
    if (!d || !d.activo || d.passHash !== await sha256(pass)) {
      error.textContent = "Usuario o contraseña incorrectos.";
      return;
    }
    sesion = { usuario: d.usuario, rol: d.rol, permisos: soloEditables(d.permisos) };
    sessionStorage.setItem("sesion", JSON.stringify(sesion));
    iniciarApp();
  } catch (err) {
    console.error(err);
    error.textContent = "No se pudo conectar con la base de datos. Revisá la configuración de Firebase.";
  }
});

$("#btn-salir").addEventListener("click", () => {
  sessionStorage.removeItem("sesion");
  desuscribir.forEach((f) => f());
  desuscribir = [];
  sesion = null;
  $("#vista-app").hidden = true;
  $("#vista-login").hidden = false;
  $("#form-login").reset();
});

function cerrarSesionPorCambioDePermisos(mensaje = "Tus permisos fueron modificados. Iniciá sesión nuevamente para aplicar los cambios.") {
  sessionStorage.removeItem("sesion");
  desuscribir.forEach((f) => f());
  desuscribir = [];
  sesion = null;
  $("#vista-app").hidden = true;
  $("#vista-login").hidden = false;
  $("#form-login").reset();
  $("#login-error").textContent = mensaje;
}

function iniciarApp() {
  $("#vista-login").hidden = true;
  $("#vista-app").hidden = false;
  $("#sesion-info").textContent = `${sesion.usuario} · ${esAdmin() ? "Administrador" : "Usuario"}`;
  $("#tab-usuarios").hidden = !esAdmin();
  $("#tab-movimientos").hidden = !esAdmin();
  $("#wrap-ver-bajas").hidden = !esAdmin();
  $("#btn-nuevo-insumo").hidden = !esAdmin();
  mostrarPanel("panel-insumos");

  // Vigila el documento del usuario conectado. Si cambian sus permisos, rol o estado,
  // se cierra la sesión para evitar que siga usando permisos antiguos.
  const usuarioSesion = sesion.usuario;
  let primeraLecturaUsuario = true;
  desuscribir.push(onSnapshot(doc(db, "usuarios", usuarioSesion), (snap) => {
    if (!snap.exists()) {
      cerrarSesionPorCambioDePermisos("Tu cuenta ya no existe. Iniciá sesión con otra cuenta.");
      return;
    }
    const actual = snap.data();
    if (!actual.activo) {
      cerrarSesionPorCambioDePermisos("Tu cuenta fue desactivada. Consultá con el administrador.");
      return;
    }
    if (primeraLecturaUsuario) {
      primeraLecturaUsuario = false;
      return;
    }
    const permisosActuales = JSON.stringify(soloEditables(actual.permisos).slice().sort());
    const permisosSesion = JSON.stringify(soloEditables(sesion?.permisos).slice().sort());
    if (!sesion || actual.rol !== sesion.rol || permisosActuales !== permisosSesion) {
      cerrarSesionPorCambioDePermisos();
    }
  }, (err) => console.error("No se pudieron verificar los permisos de la sesión:", err)));

  // onSnapshot = tiempo real: si otro empleado vende, la tabla se actualiza sola
  desuscribir.push(onSnapshot(collection(db, "insumos"), (snap) => {
    insumos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    actualizarCategoriasMovimientos();
    renderInsumos();
    actualizarAvisoSkuDuplicado();
    renderMovimientos();
  }, () => { $("#msg-insumos").textContent = "No se pudieron cargar los insumos."; }));

  if (esAdmin()) {
    desuscribir.push(onSnapshot(collection(db, "usuarios"), (snap) => {
      usuarios = snap.docs.map((d) => d.data()).sort((a, b) => a.usuario.localeCompare(b.usuario));
      actualizarUsuariosMovimientos();
      renderUsuarios();
      renderMovimientos();
    }));
    desuscribir.push(onSnapshot(
      query(collection(db, "movimientos"), orderBy("fecha", "desc")),
      (snap) => { movimientos = snap.docs.map((d) => d.data()); renderMovimientos(); }
    ));
  }
}

/* ================= Pestañas ================= */
function mostrarPanel(id) {
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== id));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("activa", t.dataset.panel === id));
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => mostrarPanel(t.dataset.panel)));
document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

/* ================= INSUMOS: consulta ================= */
CATEGORIAS.forEach((c) => {
  $("#filtro-categoria").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`);
  $("#f-categoria").insertAdjacentHTML("beforeend", `<option>${esc(c)}</option>`);
});
$("#buscar").addEventListener("input", renderInsumos);
$("#filtro-categoria").addEventListener("change", renderInsumos);
$("#ver-bajas").addEventListener("change", () => {
  if ($("#ver-bajas").checked) $("#ver-sin-stock").checked = false;
  renderInsumos();
});
$("#ver-sin-stock").addEventListener("change", () => {
  if ($("#ver-sin-stock").checked) $("#ver-bajas").checked = false;
  renderInsumos();
});
document.querySelectorAll("[data-orden]").forEach((b) => b.addEventListener("click", () => {
  const campo = b.dataset.orden;
  if (ordenInsumos.campo === campo) ordenInsumos.direccion *= -1;
  else ordenInsumos = { campo, direccion: 1 };
  document.querySelectorAll("[data-orden]").forEach((th) => {
    th.querySelector("span").textContent = th.dataset.orden === ordenInsumos.campo ? (ordenInsumos.direccion === 1 ? "▲" : "▼") : "";
  });
  renderInsumos();
}));

function renderInsumos() {
  if (!sesion) return;
  const texto = $("#buscar").value.trim().toLowerCase();
  const cat = $("#filtro-categoria").value;
  const verBajas = esAdmin() && $("#ver-bajas").checked;
  const sinStock = $("#ver-sin-stock").checked;
  // Los filtros de baja y sin stock son excluyentes: cada uno muestra solo ese conjunto.
  const visibles = insumos.filter((i) => verBajas ? !estaActivo(i) : estaActivo(i));
  let lista = visibles.filter((i) =>
    (!sinStock || Number(i.stock) === 0) &&
    (!cat || i.categoria === cat) &&
    (!texto || [i.nombre, i.marca, i.sku].some((v) => String(v ?? "").toLowerCase().includes(texto))));
  const campo = ordenInsumos.campo;
  lista.sort((a, b) => {
    const av = a[campo] ?? ""; const bv = b[campo] ?? "";
    const comparacion = ["precio", "stock"].includes(campo)
      ? (Number(av) || 0) - (Number(bv) || 0)
      : String(av).localeCompare(String(bv), "es", { numeric: true, sensitivity: "base" });
    return comparacion * ordenInsumos.direccion;
  });

  const puedeModificar = esAdmin() || sesion.permisos.length > 0;
  $("#tbody-insumos").innerHTML = lista.length ? lista.map((i) => {
    if (!estaActivo(i)) {
      return `<tr class="fila-baja">
        <td>${esc(i.nombre)}<br><small>Baja: ${esc(MOTIVOS_BAJA[i.motivoBaja] ?? "sin motivo")}</small></td>
        <td>${esc(i.categoria)}</td><td>${esc(i.marca)}</td>
        <td><small>${esc(i.sku)}</small></td>
        <td class="num">${pesos(i.precio)}</td>
        <td class="num">${i.stock}</td>
        <td><button class="btn btn-texto" data-accion="reactivar" data-id="${i.id}" title="Reactivar producto" aria-label="Reactivar ${esc(i.nombre)}">♻️</button></td></tr>`;
    }
    const clase = i.stock === 0 ? "stock-cero" : i.stock <= STOCK_BAJO ? "stock-bajo" : "stock-ok";
    const sinStock = i.stock === 0 ? ` <span class="etiqueta etiqueta-cero">Sin stock</span>` : "";
    return `<tr>
      <td>${esc(i.nombre)}</td><td>${esc(i.categoria)}</td><td>${esc(i.marca)}</td>
      <td><small>${esc(i.sku)}</small></td>
      <td class="num">${pesos(i.precio)}</td>
      <td class="num ${clase}">${sinStock} ${i.stock}</td>
      <td>
        <button class="btn btn-texto btn-icono btn-vender" data-accion="vender" data-id="${i.id}" title="Registrar venta" aria-label="Vender ${esc(i.nombre)}" ${i.stock === 0 ? "disabled" : ""}>🛒</button>
        <button class="btn btn-texto btn-icono btn-stock" data-accion="entrada" data-id="${i.id}" title="Agregar stock" aria-label="Agregar stock a ${esc(i.nombre)}">📥</button>
        ${puedeModificar ? `<button class="btn btn-texto btn-icono btn-editar" data-accion="editar" data-id="${i.id}" title="Editar insumo" aria-label="Editar ${esc(i.nombre)}">✏️</button>` : ""}
        ${esAdmin() ? `<button class="btn btn-texto btn-icono btn-baja" data-accion="baja" data-id="${i.id}" title="Dar de baja" aria-label="Dar de baja ${esc(i.nombre)}">🗑️</button>` : ""}
      </td></tr>`;
  }).join("") : `<tr><td colspan="7" class="vacio">No hay insumos que coincidan con la búsqueda.</td></tr>`;
  $("#msg-insumos").textContent = `${lista.length} de ${visibles.length} insumos`;
}

$("#tbody-insumos").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-accion]");
  if (!b) return;
  const insumo = insumos.find((i) => i.id === b.dataset.id);
  if (!insumo) return;
  if (b.dataset.accion === "editar") abrirInsumo(insumo);
  if (b.dataset.accion === "vender") abrirVenta(insumo);
  if (b.dataset.accion === "entrada") abrirEntrada(insumo);
  if (b.dataset.accion === "baja") abrirBaja(insumo);
  if (b.dataset.accion === "reactivar") reactivar(insumo);
});

/* ================= INSUMOS: alta y modificación ================= */
$("#btn-nuevo-insumo").addEventListener("click", () => abrirInsumo(null));

function normalizarNombre(nombre) {
  return String(nombre ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

function normalizarSku(sku) {
  return String(sku ?? "").trim().toLocaleUpperCase("es");
}

function actualizarAvisoSkuDuplicado() {
  const aviso = $("#sku-duplicado-aviso");
  const sku = normalizarSku($("#f-sku").value);
  const existentes = sku
    ? insumos.filter((i) => i.id !== insumoEditandoId && normalizarSku(i.sku) === sku)
    : [];
  aviso.hidden = existentes.length === 0;
  aviso.textContent = existentes.length
    ? `⚠️ Este SKU ya está registrado en: ${existentes.map((i) => `${i.nombre} (SKU: ${i.sku})`).join("; ")}. Elegí un SKU diferente.`
    : "";
}

$("#f-sku").addEventListener("input", actualizarAvisoSkuDuplicado);

function actualizarAvisoNombreDuplicado() {
  const aviso = $("#insumo-duplicado-aviso");
  const nombre = normalizarNombre($("#f-nombre").value);
  const existentes = insumos.filter((i) => i.id !== insumoEditandoId && normalizarNombre(i.nombre) === nombre);
  aviso.hidden = !nombre || existentes.length === 0 || !!insumoEditandoId;
  aviso.textContent = existentes.length
    ? `⚠️Atención!!: Ya existe un insumo con ese nombre: ${existentes.map((i) => `${i.nombre} (SKU: ${i.sku}, stock: ${i.stock})`).join("; ")}. Revisá si corresponde usar el existente en lugar de crear un duplicado.`
    : "";
}

$("#f-nombre").addEventListener("input", actualizarAvisoNombreDuplicado);

function abrirInsumo(insumo) {
  insumoEditandoId = insumo?.id ?? null;
  insumoOriginal = insumo ? { ...insumo } : null;
  $("#dlg-insumo-titulo").textContent = insumo ? "Modificar insumo" : "Agregar insumo";
  $("#form-insumo").reset();
  $("#insumo-error").textContent = "";
  $("#insumo-duplicado-aviso").hidden = true;
  $("#insumo-duplicado-aviso").textContent = "";
  CAMPOS_EDITABLES.forEach((c) => {
    const input = $("#f-" + c);
    input.value = insumo ? insumo[c] : "";
    input.disabled = !puedeEditarCampo(c);   // el usuario solo toca lo que el admin permitió
  });
  // El stock solo se carga al dar de alta; después cambia con ventas y entradas.
  $("#f-stock").value = insumo ? insumo.stock : "";
  $("#f-stock").disabled = !!insumo;
  $("#f-stock-ayuda").textContent = insumo
    ? "El stock no se edita acá: usá Vender o Entrada para que quede registrado."
    : "Se registra como movimiento de alta. Si después llega más mercadería, usá Entrada.";
  actualizarAvisoNombreDuplicado();
  actualizarAvisoSkuDuplicado();
  $("#dlg-insumo").showModal();
}

$("#form-insumo").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#insumo-error");
  error.textContent = "";
  const datos = {
    nombre: $("#f-nombre").value.trim(),
    categoria: $("#f-categoria").value,
    marca: $("#f-marca").value.trim(),
    sku: $("#f-sku").value.trim().toUpperCase(),
    precio: Number($("#f-precio").value)
  };
  if (!datos.nombre || !datos.marca || !datos.sku) { error.textContent = "Completá nombre, marca y SKU."; return; }
  if (!Number.isFinite(datos.precio) || datos.precio < 0) { error.textContent = "El precio debe ser un número mayor o igual a 0."; return; }
  const stockInicial = Number($("#f-stock").value);
  if (!insumoEditandoId && (!Number.isInteger(stockInicial) || stockInicial < 0)) {
    error.textContent = "El stock inicial debe ser un entero mayor o igual a 0."; return;
  }

  try {
    const todosLosInsumosSku = await getDocs(collection(db, "insumos"));
    const skuDuplicado = todosLosInsumosSku.docs.some((d) =>
      d.id !== insumoEditandoId && normalizarSku(d.data().sku) === normalizarSku(datos.sku)
    );
    if (skuDuplicado) {
      actualizarAvisoSkuDuplicado();
      error.textContent = "Ya existe un insumo con ese SKU. Elegí uno diferente.";
      return;
    }
    if (!insumoEditandoId) {
      // Consultar Firestore al momento de guardar evita depender solo del estado local.
      const mismoNombre = todosLosInsumosSku.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((i) => normalizarNombre(i.nombre) === normalizarNombre(datos.nombre));
      if (mismoNombre.length) {
        error.textContent = `No se puede crear el insumo: ya existe uno con ese nombre (${mismoNombre.map((i) => `${i.nombre}, SKU ${i.sku}, stock ${i.stock}`).join("; ")}). Usá el insumo existente.`;
        actualizarAvisoNombreDuplicado();
        return;
      }
    }
    if (insumoEditandoId) {
      // Solo se escriben los campos que cambiaron: así editar un precio nunca pisa el stock.
      const cambios = {};
      CAMPOS_EDITABLES.filter(puedeEditarCampo).forEach((c) => {
        if (datos[c] !== insumoOriginal[c]) cambios[c] = datos[c];
      });
      if (Object.keys(cambios).length) await updateDoc(doc(db, "insumos", insumoEditandoId), cambios);
    } else {
      const ref = doc(collection(db, "insumos"));
      const batch = writeBatch(db);
      batch.set(ref, { ...datos, stock: stockInicial, activo: true });
      batch.set(doc(collection(db, "movimientos")), movimiento(ref.id, datos, "alta", stockInicial, stockInicial, "Alta de producto"));
      await batch.commit();
    }
    $("#dlg-insumo").close();
  } catch (err) {
    console.error(err);
    error.textContent = "No se pudo guardar. Intentá de nuevo.";
  }
});

/* ================= MOVIMIENTOS de stock (todos pasan por acá) ================= */
function movimiento(insumoId, insumo, tipo, cantidad, stockResultante, detalle = "") {
  return {
    insumoId, insumo: insumo.nombre, sku: insumo.sku, tipo, cantidad, stockResultante, detalle,
    usuario: sesion.usuario, fecha: serverTimestamp()
  };
}

// Cambia el stock y registra el movimiento en UNA sola transacción:
// no puede quedar un descuento sin registro (ni al revés), y dos usuarios
// operando el mismo producto a la vez no pueden dejar el stock negativo.
async function moverStock(insumoId, tipo, cantidad, detalle = "") {
  if (!Number.isInteger(cantidad) || cantidad < 1) throw new ReglaError("La cantidad debe ser un entero mayor que cero.");
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "insumos", insumoId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ReglaError("El insumo ya no existe.");
    const ins = snap.data();
    if (!estaActivo(ins)) throw new ReglaError("El insumo está dado de baja.");
    const nuevo = tipo === "salida" || tipo === "baja_stock" ? ins.stock - cantidad : ins.stock + cantidad;
    if (nuevo < 0) throw new ReglaError(`Stock insuficiente: quedan ${ins.stock} unidades.`);
    tx.update(ref, { stock: nuevo });
    tx.set(doc(collection(db, "movimientos")), movimiento(insumoId, ins, tipo, cantidad, nuevo, detalle));
  });
}

// Deshabilita el formulario mientras se procesa, para evitar doble envío.
async function conEspera(form, textoEspera, tarea) {
  const controles = [...form.querySelectorAll("button, input, select")];
  const estadosPrevios = controles.map((control) => control.disabled);
  const botonEnviar = form.querySelector('button[type="submit"]');
  const textoBoton = botonEnviar.textContent;
  form.setAttribute("aria-busy", "true");
  controles.forEach((control) => (control.disabled = true));
  botonEnviar.textContent = textoEspera;
  try { await tarea(); }
  finally {
    controles.forEach((control, indice) => (control.disabled = estadosPrevios[indice]));
    botonEnviar.textContent = textoBoton;
    form.removeAttribute("aria-busy");
  }
}

const mensajeDe = (err, porDefecto) => (err instanceof ReglaError ? err.message : porDefecto);

/* ================= VENTAS (salida de stock) ================= */
function abrirVenta(insumo) {
  ventaInsumoId = insumo.id;
  ventaPrecioUnitario = Number(insumo.precio) || 0;
  $("#venta-detalle").textContent = `${insumo.nombre} · precio unitario: ${pesos(ventaPrecioUnitario)} · stock disponible: ${insumo.stock}`;
  $("#venta-cantidad").value = 1;
  $("#venta-cantidad").max = insumo.stock;
  $("#venta-total").textContent = pesos(ventaPrecioUnitario);
  $("#venta-error").textContent = "";
  $("#dlg-venta").showModal();
}

$("#venta-cantidad").addEventListener("input", () => {
  const campo = $("#venta-cantidad");
  const cantidad = Math.max(0, Number(campo.value) || 0);
  $("#venta-total").textContent = pesos(cantidad * ventaPrecioUnitario);
  const error = $("#venta-error");
  if (campo.value !== "" && cantidad > Number(campo.max)) {
    error.textContent = `No hay suficiente stock. Solo podés vender hasta ${campo.max} unidad${Number(campo.max) === 1 ? "" : "es"}.`;
  } else {
    error.textContent = "";
  }
});

$("#form-venta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const campo = $("#venta-cantidad");
  const cantidad = Number(campo.value);
  const error = $("#venta-error");
  if (!Number.isInteger(cantidad) || cantidad < 1) { error.textContent = "Ingresá una cantidad entera mayor que cero."; campo.focus(); return; }
  if (cantidad > Number(campo.max)) {
    error.textContent = `No hay suficiente stock para realizar esta venta. Stock disponible: ${campo.max} unidad${Number(campo.max) === 1 ? "" : "es"}. Reducí la cantidad e intentá nuevamente.`;
    campo.focus(); return;
  }
  error.textContent = "";
  try {
    await conEspera($("#form-venta"), "Procesando venta…", () => moverStock(ventaInsumoId, "salida", cantidad));
    $("#dlg-venta").close();
    mostrarExito("¡Venta exitosa!");
  } catch (err) {
    console.error(err);
    error.textContent = mensajeDe(err, "No se pudo registrar la venta.");
  }
});

/* ================= ENTRADAS de stock (reposición y devolución) ================= */
function abrirEntrada(insumo) {
  entradaInsumoId = insumo.id;
  $("#entrada-detalle").textContent = `${insumo.nombre} · stock actual: ${insumo.stock}`;
  $("#entrada-tipo").value = "reposicion";
  $("#entrada-cantidad").value = 1;
  $("#entrada-nota").value = "";
  $("#entrada-error").textContent = "";
  $("#dlg-entrada").showModal();
}

$("#form-entrada").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cantidad = Number($("#entrada-cantidad").value);
  const error = $("#entrada-error");
  if (!Number.isInteger(cantidad) || cantidad < 1) { error.textContent = "Ingresá una cantidad válida."; return; }
  error.textContent = "";
  try {
    await conEspera($("#form-entrada"), "Registrando…", () =>
      moverStock(entradaInsumoId, $("#entrada-tipo").value, cantidad, $("#entrada-nota").value.trim()));
    $("#dlg-entrada").close();
    mostrarExito("Operación exitosa");
  } catch (err) {
    console.error(err);
    error.textContent = mensajeDe(err, "No se pudo registrar la entrada.");
  }
});

/* ================= BAJAS: stock defectuoso vs. desactivación comercial ================= */
function abrirBaja(insumo) {
  bajaInsumoId = insumo.id;
  $("#baja-detalle").textContent = `${insumo.nombre} · stock actual: ${insumo.stock}`;
  // Sin stock, la opción predeterminada es retirar de comercialización.
  $("#baja-operacion").value = Number(insumo.stock) === 0 ? "desactivar" : "stock";
  $("#baja-cantidad").value = Number(insumo.stock) > 0 ? 1 : "";
  $("#baja-cantidad").max = Math.max(0, Number(insumo.stock) || 0);
  $("#baja-motivo").value = "rotura";
  $("#baja-otro-detalle").value = "";
  $("#baja-error-carga").checked = false;
  $("#baja-error-carga-detalle").value = "";
  $("#baja-error").textContent = "";
  actualizarFormularioBaja();
  $("#dlg-baja").showModal();
}

function actualizarFormularioBaja() {
  const esRetiro = $("#baja-operacion").value === "desactivar";
  // La casilla especial solo corresponde al retiro de comercialización.
  $("#baja-error-carga-wrap").hidden = !esRetiro;
  if (!esRetiro) $("#baja-error-carga").checked = false;
  const errorCarga = esRetiro && $("#baja-error-carga").checked;
  const esStock = !esRetiro;
  $("#baja-cantidad-wrap").hidden = !esStock;
  $("#baja-motivo-wrap").hidden = !esStock;
  $("#baja-cantidad").disabled = !esStock;
  $("#baja-cantidad").required = esStock;
  $("#baja-motivo").disabled = !esStock;
  $("#baja-otro-wrap").hidden = !esStock || $("#baja-motivo").value !== "otro";
  $("#baja-error-carga-detalle-wrap").hidden = !errorCarga;
  $("#baja-error-carga-detalle").required = errorCarga;
  $("#baja-ayuda").textContent = errorCarga
    ? "Retira este registro por duplicado o error de carga, conserva el stock registrado y deja constancia del motivo en movimientos."
    : esStock
      ? "Descuenta las unidades indicadas y conserva el producto activo."
      : "Retira el producto de comercialización. Solo se permite con stock cero, salvo que marques la opción de error de carga.";
  $("#baja-submit").textContent = errorCarga ? "Retirar por error de carga" : esStock ? "Registrar baja de stock" : "Desactivar producto";
}
$("#baja-operacion").addEventListener("change", actualizarFormularioBaja);
$("#baja-motivo").addEventListener("change", actualizarFormularioBaja);
$("#baja-error-carga").addEventListener("change", actualizarFormularioBaja);

async function cambiarEstado(insumoId, activo, motivo, opciones = {}) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "insumos", insumoId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ReglaError("El insumo ya no existe.");
    const ins = snap.data();
    if (!activo && ins.stock !== 0 && !opciones.permitirConStock) throw new ReglaError("Para retirar un producto de comercialización, primero debe quedar sin stock. Si es un registro duplicado o cargado por error, usá la opción correspondiente.");
    tx.update(ref, activo
      ? { activo: true, motivoBaja: null, fechaBaja: null }
      : { activo: false, motivoBaja: motivo, fechaBaja: serverTimestamp() });
    const tipoMovimiento = activo ? "reactivacion" : (opciones.detalle ? "baja_error" : "baja");
    const detalleMovimiento = activo ? "Reactivado" : (opciones.detalle || MOTIVOS_BAJA[motivo]);
    tx.set(doc(collection(db, "movimientos")), movimiento(
      insumoId, ins, tipoMovimiento, 0, ins.stock, detalleMovimiento));
  });
}

$("#form-baja").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#baja-error");
  error.textContent = "";
  const errorCarga = $("#baja-error-carga").checked;
  const operacion = $("#baja-operacion").value;
  const cantidad = Number($("#baja-cantidad").value);
  const motivo = $("#baja-motivo").value;
  const otroDetalle = $("#baja-otro-detalle").value.trim();
  const detalleErrorCarga = $("#baja-error-carga-detalle").value.trim();
  if (errorCarga && !detalleErrorCarga) {
    error.textContent = "Indicá por qué se da de baja este registro duplicado o cargado por error."; return;
  }
  if (!errorCarga && operacion === "stock" && motivo === "otro" && !otroDetalle) {
    error.textContent = "Indicá brevemente el motivo de la baja."; return;
  }
  if (!errorCarga && operacion === "stock" && (!Number.isInteger(cantidad) || cantidad < 1)) {
    error.textContent = "Ingresá una cantidad entera mayor que cero."; return;
  }
  try {
    await conEspera($("#form-baja"), "Procesando…", async () => {
      if (errorCarga) {
        await cambiarEstado(bajaInsumoId, false, "otro", {
          permitirConStock: true,
          detalle: `Baja por error de carga/duplicado: ${detalleErrorCarga}`
        });
      } else if (operacion === "stock") {
        const detalle = motivo === "otro" ? `Otro: ${otroDetalle}` : (MOTIVOS_BAJA[motivo] || motivo);
        await moverStock(bajaInsumoId, "baja_stock", cantidad, detalle);
      } else {
        await cambiarEstado(bajaInsumoId, false, "fuera_de_comercializacion");
      }
    });
    $("#dlg-baja").close();
    mostrarExito("Operación exitosa");
  } catch (err) {
    console.error(err);
    error.textContent = mensajeDe(err, "No se pudo procesar la baja.");
  }
});

async function reactivar(insumo) {
  if (!confirm(`¿Reactivar "${insumo.nombre}"? Vuelve al listado con su stock actual (${insumo.stock}).`)) return;
  try { await cambiarEstado(insumo.id, true); }
  catch (err) { console.error(err); alert(mensajeDe(err, "No se pudo reactivar el insumo.")); }
}

/* ================= MOVIMIENTOS: historial (solo administrador) ================= */
function actualizarCategoriasMovimientos() {
  const select = $("#filtro-movimientos-categoria");
  if (!select) return;
  const valor = select.value;
  const categorias = [...new Set(insumos.map((i) => i.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  select.innerHTML = '<option value="">Todas las categorías</option>' + categorias.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  select.value = categorias.includes(valor) ? valor : "";
}
function actualizarUsuariosMovimientos() {
  const select = $("#filtro-movimientos-usuario");
  if (!select) return;
  const valor = select.value;
  select.innerHTML = '<option value="">Todos los usuarios</option>' + usuarios.map((u) => `<option value="${esc(u.usuario)}">${esc(u.usuario)}</option>`).join("");
  select.value = usuarios.some((u) => u.usuario === valor) ? valor : "";
}
function renderMovimientos() {
  const categoria = $("#filtro-movimientos-categoria").value;
  const usuario = $("#filtro-movimientos-usuario").value;
  const desde = $("#filtro-movimientos-desde").value;
  const hasta = $("#filtro-movimientos-hasta").value;
  const lista = movimientos.filter((m) => {
    if (usuario && m.usuario !== usuario) return false;
    if (categoria) {
      const insumo = insumos.find((i) => i.id === m.insumoId);
      if (!insumo || insumo.categoria !== categoria) return false;
    }
    const fecha = m.fecha?.toDate?.();
    if ((desde || hasta) && !fecha) return false;
    if (desde) {
      const inicio = new Date(`${desde}T00:00:00`);
      if (fecha < inicio) return false;
    }
    if (hasta) {
      const fin = new Date(`${hasta}T23:59:59.999`);
      if (fecha > fin) return false;
    }
    return true;
  });
  $("#tbody-movimientos").innerHTML = lista.length ? lista.map((m) => {
    const fecha = m.fecha?.toDate?.().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) ?? "—";
    const signo = m.tipo === "salida" || m.tipo === "baja_stock" ? "−" : m.tipo === "baja" || m.tipo === "baja_error" || m.tipo === "reactivacion" ? "" : "+";
    return `<tr>
      <td><small>${esc(fecha)}</small></td>
      <td><span class="mov-tag mov-${esc(m.tipo)}">${esc(({
        salida: "↘ Venta · stock descontado",
        reposicion: "↗ Entrada de stock",
        devolucion: "↗ Devolución · stock sumado",
        alta: "＋ Alta de producto",
        baja_stock: "− Baja de stock",
        baja: "⏸ Desactivación",
        baja_error: "⚠ Error de carga",
        reactivacion: "↻ Reactivación"
      })[m.tipo] ?? TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo)}</span></td>
      <td>${esc(m.insumo)}<br><small>${esc(m.sku)}</small></td>
      <td class="num">${signo}${m.cantidad}</td>
      <td class="num">${m.stockResultante}</td>
      <td>${esc(m.usuario)}</td>
      <td>${m.detalle ? `<small class="movimiento-detalle" title="${esc(m.detalle)}">${esc(m.detalle)}</small>` : "—"}</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="vacio">No hay movimientos para los filtros seleccionados.</td></tr>`;
}
["#filtro-movimientos-categoria", "#filtro-movimientos-usuario", "#filtro-movimientos-desde", "#filtro-movimientos-hasta"].forEach((id) => $(id).addEventListener("change", renderMovimientos));
$("#limpiar-filtro-movimientos").addEventListener("click", () => {
  $("#filtro-movimientos-categoria").value = "";
  $("#filtro-movimientos-usuario").value = "";
  $("#filtro-movimientos-desde").value = "";
  $("#filtro-movimientos-hasta").value = "";
  renderMovimientos();
});

/* ================= USUARIOS (solo administrador) ================= */
function renderUsuarios() {
  $("#tbody-usuarios").innerHTML = usuarios.map((u) => `<tr>
    <td>${esc(u.usuario)}</td>
    <td>${u.rol === "admin" ? "Administrador" : "Usuario"}</td>
    <td>${u.rol === "admin" ? "Todos" : esc(soloEditables(u.permisos).join(", ") || "Ninguno (consulta, ventas y entradas)")}</td>
    <td>${u.activo ? "Activo" : "Inactivo"}</td>
    <td>
      <button class="btn btn-texto btn-icono btn-editar" data-accion="editar" data-id="${esc(u.usuario)}">✏️</button>
      ${u.usuario !== sesion.usuario ? `<button class="btn btn-texto btn-icono btn-baja" data-accion="borrar" data-id="${esc(u.usuario)}">❌</button>` : ""}
    </td></tr>`).join("");
}
$("#tbody-usuarios").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-accion]");
  if (!b) return;
  if (b.dataset.accion === "editar") abrirUsuario(usuarios.find((u) => u.usuario === b.dataset.id));
  if (b.dataset.accion === "borrar" && confirm(`¿Eliminar al usuario "${b.dataset.id}"?`)) {
    await deleteDoc(doc(db, "usuarios", b.dataset.id));
  }
});

$("#btn-nuevo-usuario").addEventListener("click", () => abrirUsuario(null));
$("#u-rol").addEventListener("change", () => ($("#u-permisos").disabled = $("#u-rol").value === "admin"));

function abrirUsuario(u) {
  usuarioEditando = u?.usuario ?? null;
  $("#form-usuario").reset();
  $("#usuario-error").textContent = "";
  $("#dlg-usuario-titulo").textContent = u ? "Modificar usuario" : "Agregar usuario";
  $("#u-usuario").value = u?.usuario ?? "";
  $("#u-usuario").disabled = !!u;
  $("#u-pass").required = !u;
  $("#u-pass-ayuda").textContent = u ? "Dejalo vacío para no cambiar la contraseña." : "Mínimo 6 caracteres.";
  $("#u-rol").value = u?.rol ?? "usuario";
  $("#u-activo").checked = u?.activo ?? true;
  $("#u-permisos").disabled = $("#u-rol").value === "admin";
  document.querySelectorAll("#u-permisos input").forEach((c) => (c.checked = !!u?.permisos?.includes(c.value)));
  $("#dlg-usuario").showModal();
}

$("#form-usuario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#usuario-error");
  const nombre = $("#u-usuario").value.trim().toLowerCase();
  const pass = $("#u-pass").value;
  const rol = $("#u-rol").value;
  const permisos = rol === "admin" ? [...CAMPOS_EDITABLES]
    : [...document.querySelectorAll("#u-permisos input:checked")].map((c) => c.value);
  try {
    const ref = doc(db, "usuarios", nombre);
    if (!usuarioEditando && (await getDoc(ref)).exists()) { error.textContent = "Ese nombre de usuario ya existe."; return; }
    const datos = { usuario: nombre, rol, permisos, activo: $("#u-activo").checked };
    if (pass) datos.passHash = await sha256(pass);
    await setDoc(ref, datos, { merge: true });
    $("#dlg-usuario").close();
  } catch (err) {
    console.error(err);
    error.textContent = "No se pudo guardar el usuario.";
  }
});

/* ================= Arranque ================= */
precargarUsuarios().catch((err) => {
  console.error(err);
  $("#login-error").textContent = "No se pudo conectar con Firebase. Revisá js/firebase-config.js y las reglas de Firestore.";
});
if (sesion) iniciarApp();
