import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  deleteDoc, onSnapshot, runTransaction, writeBatch, query, where, orderBy, limit, serverTimestamp
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
  baja: "Baja", reactivacion: "Reactivación"
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesos = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

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
let entradaInsumoId = null;
let bajaInsumoId = null;
let usuarioEditando = null;

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

function iniciarApp() {
  $("#vista-login").hidden = true;
  $("#vista-app").hidden = false;
  $("#sesion-info").textContent = `${sesion.usuario} · ${esAdmin() ? "Administrador" : "Usuario"}`;
  $("#tab-usuarios").hidden = !esAdmin();
  $("#tab-movimientos").hidden = !esAdmin();
  $("#wrap-ver-bajas").hidden = !esAdmin();
  $("#btn-nuevo-insumo").hidden = !esAdmin();
  mostrarPanel("panel-insumos");

  // onSnapshot = tiempo real: si otro empleado vende, la tabla se actualiza sola
  desuscribir.push(onSnapshot(collection(db, "insumos"), (snap) => {
    insumos = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    renderInsumos();
  }, () => { $("#msg-insumos").textContent = "No se pudieron cargar los insumos."; }));

  if (esAdmin()) {
    desuscribir.push(onSnapshot(collection(db, "usuarios"), (snap) => {
      usuarios = snap.docs.map((d) => d.data()).sort((a, b) => a.usuario.localeCompare(b.usuario));
      renderUsuarios();
    }));
    desuscribir.push(onSnapshot(
      query(collection(db, "movimientos"), orderBy("fecha", "desc"), limit(50)),
      (snap) => renderMovimientos(snap.docs.map((d) => d.data()))
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
$("#ver-bajas").addEventListener("change", renderInsumos);

function renderInsumos() {
  if (!sesion) return;
  const texto = $("#buscar").value.trim().toLowerCase();
  const cat = $("#filtro-categoria").value;
  const verBajas = esAdmin() && $("#ver-bajas").checked;
  const visibles = insumos.filter((i) => verBajas || estaActivo(i));
  const lista = visibles.filter((i) =>
    (!cat || i.categoria === cat) &&
    (!texto || [i.nombre, i.marca, i.sku].some((v) => v.toLowerCase().includes(texto))));

  const puedeModificar = esAdmin() || sesion.permisos.length > 0;
  $("#tbody-insumos").innerHTML = lista.length ? lista.map((i) => {
    if (!estaActivo(i)) {
      return `<tr class="fila-baja">
        <td>${esc(i.nombre)}<br><small>Baja: ${esc(MOTIVOS_BAJA[i.motivoBaja] ?? "sin motivo")}</small></td>
        <td>${esc(i.categoria)}</td><td>${esc(i.marca)}</td>
        <td><small>${esc(i.sku)}</small></td>
        <td class="num">${pesos(i.precio)}</td>
        <td class="num">${i.stock}</td>
        <td><button class="btn btn-texto" data-accion="reactivar" data-id="${i.id}">Reactivar</button></td></tr>`;
    }
    const clase = i.stock === 0 ? "stock-cero" : i.stock <= STOCK_BAJO ? "stock-bajo" : "stock-ok";
    const sinStock = i.stock === 0 ? ` <span class="etiqueta etiqueta-cero">Sin stock</span>` : "";
    return `<tr>
      <td>${esc(i.nombre)}</td><td>${esc(i.categoria)}</td><td>${esc(i.marca)}</td>
      <td><small>${esc(i.sku)}</small></td>
      <td class="num">${pesos(i.precio)}</td>
      <td class="num ${clase}">${sinStock} ${i.stock}</td>
      <td>
        <button class="btn btn-texto" data-accion="vender" data-id="${i.id}" ${i.stock === 0 ? "disabled" : ""}>Vender</button>
        <button class="btn btn-texto" data-accion="entrada" data-id="${i.id}">Entrada</button>
        ${puedeModificar ? `<button class="btn btn-texto" data-accion="editar" data-id="${i.id}">Editar</button>` : ""}
        ${esAdmin() ? `<button class="btn btn-texto btn-peligro" data-accion="baja" data-id="${i.id}">Dar de baja</button>` : ""}
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

function abrirInsumo(insumo) {
  insumoEditandoId = insumo?.id ?? null;
  insumoOriginal = insumo ? { ...insumo } : null;
  $("#dlg-insumo-titulo").textContent = insumo ? "Modificar insumo" : "Agregar insumo";
  $("#form-insumo").reset();
  $("#insumo-error").textContent = "";
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
    const repetido = await getDocs(query(collection(db, "insumos"), where("sku", "==", datos.sku)));
    if (repetido.docs.some((d) => d.id !== insumoEditandoId)) {
      error.textContent = "Ya existe un insumo con ese SKU.";
      return;
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
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "insumos", insumoId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ReglaError("El insumo ya no existe.");
    const ins = snap.data();
    if (!estaActivo(ins)) throw new ReglaError("El insumo está dado de baja.");
    const nuevo = tipo === "salida" ? ins.stock - cantidad : ins.stock + cantidad;
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
  $("#venta-detalle").textContent = `${insumo.nombre} · stock disponible: ${insumo.stock}`;
  $("#venta-cantidad").value = 1;
  $("#venta-cantidad").max = insumo.stock;
  $("#venta-error").textContent = "";
  $("#dlg-venta").showModal();
}

$("#form-venta").addEventListener("submit", async (e) => {
  e.preventDefault();
  const cantidad = Number($("#venta-cantidad").value);
  const error = $("#venta-error");
  if (!Number.isInteger(cantidad) || cantidad < 1) { error.textContent = "Ingresá una cantidad válida."; return; }
  error.textContent = "";
  try {
    await conEspera($("#form-venta"), "Procesando venta…", () => moverStock(ventaInsumoId, "salida", cantidad));
    $("#dlg-venta").close();
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
  } catch (err) {
    console.error(err);
    error.textContent = mensajeDe(err, "No se pudo registrar la entrada.");
  }
});

/* ================= INSUMOS: baja lógica (solo administrador) ================= */
function abrirBaja(insumo) {
  bajaInsumoId = insumo.id;
  $("#baja-detalle").textContent = `${insumo.nombre} · stock actual: ${insumo.stock}`;
  $("#baja-motivo").value = "fuera_de_comercializacion";
  $("#baja-error").textContent = "";
  $("#dlg-baja").showModal();
}

async function cambiarEstado(insumoId, activo, motivo) {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "insumos", insumoId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ReglaError("El insumo ya no existe.");
    const ins = snap.data();
    tx.update(ref, activo
      ? { activo: true, motivoBaja: null, fechaBaja: null }
      : { activo: false, motivoBaja: motivo, fechaBaja: serverTimestamp() });
    tx.set(doc(collection(db, "movimientos")), movimiento(
      insumoId, ins, activo ? "reactivacion" : "baja", ins.stock, ins.stock,
      activo ? "Reactivado" : MOTIVOS_BAJA[motivo]));
  });
}

$("#form-baja").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#baja-error");
  error.textContent = "";
  try {
    await conEspera($("#form-baja"), "Procesando…", () => cambiarEstado(bajaInsumoId, false, $("#baja-motivo").value));
    $("#dlg-baja").close();
  } catch (err) {
    console.error(err);
    error.textContent = mensajeDe(err, "No se pudo dar de baja el insumo.");
  }
});

async function reactivar(insumo) {
  if (!confirm(`¿Reactivar "${insumo.nombre}"? Vuelve al listado con su stock actual (${insumo.stock}).`)) return;
  try { await cambiarEstado(insumo.id, true); }
  catch (err) { console.error(err); alert(mensajeDe(err, "No se pudo reactivar el insumo.")); }
}

/* ================= MOVIMIENTOS: historial (solo administrador) ================= */
function renderMovimientos(lista) {
  $("#tbody-movimientos").innerHTML = lista.length ? lista.map((m) => {
    const fecha = m.fecha?.toDate?.().toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) ?? "—";
    const signo = m.tipo === "salida" ? "−" : m.tipo === "baja" || m.tipo === "reactivacion" ? "" : "+";
    return `<tr>
      <td><small>${esc(fecha)}</small></td>
      <td class="mov-${esc(m.tipo)}">${esc(TIPOS_MOVIMIENTO[m.tipo] ?? m.tipo)}</td>
      <td>${esc(m.insumo)}<br><small>${esc(m.sku)}</small></td>
      <td class="num">${signo}${m.cantidad}</td>
      <td class="num">${m.stockResultante}</td>
      <td>${esc(m.usuario)}</td>
      <td><small>${esc(m.detalle)}</small></td></tr>`;
  }).join("") : `<tr><td colspan="7" class="vacio">Todavía no hay movimientos.</td></tr>`;
}

/* ================= USUARIOS (solo administrador) ================= */
function renderUsuarios() {
  $("#tbody-usuarios").innerHTML = usuarios.map((u) => `<tr>
    <td>${esc(u.usuario)}</td>
    <td>${u.rol === "admin" ? "Administrador" : "Usuario"}</td>
    <td>${u.rol === "admin" ? "Todos" : esc(soloEditables(u.permisos).join(", ") || "Ninguno (consulta, ventas y entradas)")}</td>
    <td>${u.activo ? "Activo" : "Inactivo"}</td>
    <td>
      <button class="btn btn-texto" data-accion="editar" data-id="${esc(u.usuario)}">Editar</button>
      ${u.usuario !== sesion.usuario ? `<button class="btn btn-texto btn-peligro" data-accion="borrar" data-id="${esc(u.usuario)}">Eliminar</button>` : ""}
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
