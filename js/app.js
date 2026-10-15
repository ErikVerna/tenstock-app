import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc,
  deleteDoc, onSnapshot, runTransaction, query, where, limit, serverTimestamp
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
const CAMPOS = ["nombre", "categoria", "marca", "precio", "sku", "stock"];
const STOCK_BAJO = 5;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pesos = (n) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);

async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

let sesion = JSON.parse(sessionStorage.getItem("sesion") || "null");
let insumos = [];
let usuarios = [];
let desuscribir = [];
let insumoEditandoId = null;
let ventaInsumoId = null;
let usuarioEditando = null;

const esAdmin = () => sesion?.rol === "admin";
const puedeEditarCampo = (campo) => esAdmin() || sesion.permisos.includes(campo);

/* ================= Usuarios precargados ================= */
async function precargarUsuarios() {
  const snap = await getDocs(query(collection(db, "usuarios"), limit(1)));
  if (!snap.empty) return;
  await setDoc(doc(db, "usuarios", "admin"), {
    usuario: "admin", rol: "admin", activo: true,
    passHash: await sha256("admin123"), permisos: [...CAMPOS]
  });
  await setDoc(doc(db, "usuarios", "empleado"), {
    usuario: "empleado", rol: "usuario", activo: true,
    passHash: await sha256("empleado123"), permisos: ["stock"]
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
    sesion = { usuario: d.usuario, rol: d.rol, permisos: d.permisos || [] };
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

function renderInsumos() {
  const texto = $("#buscar").value.trim().toLowerCase();
  const cat = $("#filtro-categoria").value;
  const lista = insumos.filter((i) =>
    (!cat || i.categoria === cat) &&
    (!texto || [i.nombre, i.marca, i.sku].some((v) => v.toLowerCase().includes(texto))));

  const puedeModificar = esAdmin() || sesion.permisos.length > 0;
  $("#tbody-insumos").innerHTML = lista.length ? lista.map((i) => {
    const clase = i.stock === 0 ? "stock-cero" : i.stock <= STOCK_BAJO ? "stock-bajo" : "stock-ok";
    return `<tr>
      <td>${esc(i.nombre)}</td><td>${esc(i.categoria)}</td><td>${esc(i.marca)}</td>
      <td><small>${esc(i.sku)}</small></td>
      <td class="num">${pesos(i.precio)}</td>
      <td class="num ${clase}">${i.stock}</td>
      <td>
        <button class="btn btn-texto" data-accion="vender" data-id="${i.id}" ${i.stock === 0 ? "disabled" : ""}>Vender</button>
        ${puedeModificar ? `<button class="btn btn-texto" data-accion="editar" data-id="${i.id}">Editar</button>` : ""}
        ${esAdmin() ? `<button class="btn btn-texto btn-peligro" data-accion="baja" data-id="${i.id}">Dar de baja</button>` : ""}
      </td></tr>`;
  }).join("") : `<tr><td colspan="7" class="vacio">No hay insumos que coincidan con la búsqueda.</td></tr>`;
  $("#msg-insumos").textContent = `${lista.length} de ${insumos.length} insumos`;
}

$("#tbody-insumos").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-accion]");
  if (!b) return;
  const insumo = insumos.find((i) => i.id === b.dataset.id);
  if (b.dataset.accion === "editar") abrirInsumo(insumo);
  if (b.dataset.accion === "vender") abrirVenta(insumo);
  if (b.dataset.accion === "baja") darDeBaja(insumo);
});

/* ================= INSUMOS: alta y modificación ================= */
$("#btn-nuevo-insumo").addEventListener("click", () => abrirInsumo(null));

function abrirInsumo(insumo) {
  insumoEditandoId = insumo?.id ?? null;
  $("#dlg-insumo-titulo").textContent = insumo ? "Modificar insumo" : "Agregar insumo";
  $("#form-insumo").reset();
  $("#insumo-error").textContent = "";
  CAMPOS.forEach((c) => {
    const input = $("#f-" + c);
    input.value = insumo ? insumo[c] : "";
    input.disabled = !puedeEditarCampo(c);   // el usuario solo toca lo que el admin permitió
  });
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
    precio: Number($("#f-precio").value),
    stock: Number($("#f-stock").value)
  };
  if (!datos.nombre || !datos.marca || !datos.sku) { error.textContent = "Completá nombre, marca y SKU."; return; }
  if (!Number.isFinite(datos.precio) || datos.precio < 0) { error.textContent = "El precio debe ser un número mayor o igual a 0."; return; }
  if (!Number.isInteger(datos.stock) || datos.stock < 0) { error.textContent = "El stock debe ser un entero mayor o igual a 0."; return; }

  try {
    const repetido = await getDocs(query(collection(db, "insumos"), where("sku", "==", datos.sku)));
    if (repetido.docs.some((d) => d.id !== insumoEditandoId)) {
      error.textContent = "Ya existe un insumo con ese SKU.";
      return;
    }
    if (insumoEditandoId) {
      const cambios = {};
      CAMPOS.filter(puedeEditarCampo).forEach((c) => (cambios[c] = datos[c]));
      await updateDoc(doc(db, "insumos", insumoEditandoId), cambios);
    } else {
      await addDoc(collection(db, "insumos"), datos);
    }
    $("#dlg-insumo").close();
  } catch (err) {
    console.error(err);
    error.textContent = "No se pudo guardar. Intentá de nuevo.";
  }
});

/* ================= INSUMOS: baja ================= */
async function darDeBaja(insumo) {
  if (!confirm(`¿Dar de baja "${insumo.nombre}"? Deja de comercializarse y se elimina del listado.`)) return;
  try { await deleteDoc(doc(db, "insumos", insumo.id)); }
  catch { alert("No se pudo dar de baja el insumo."); }
}

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
  try {
    // La transacción lee el stock real y lo descuenta en un solo paso:
    // dos empleados vendiendo lo mismo a la vez no pueden dejar stock negativo.
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "insumos", ventaInsumoId);
      const snap = await tx.get(ref);
      const stock = snap.data().stock;
      if (cantidad > stock) throw new Error(`Stock insuficiente: quedan ${stock} unidades.`);
      tx.update(ref, { stock: stock - cantidad });
    });
    await addDoc(collection(db, "movimientos"), {
      insumoId: ventaInsumoId, tipo: "salida", cantidad,
      usuario: sesion.usuario, fecha: serverTimestamp()
    });
    $("#dlg-venta").close();
  } catch (err) {
    error.textContent = err.message.startsWith("Stock") ? err.message : "No se pudo registrar la venta.";
  }
});

/* ================= USUARIOS (solo administrador) ================= */
function renderUsuarios() {
  $("#tbody-usuarios").innerHTML = usuarios.map((u) => `<tr>
    <td>${esc(u.usuario)}</td>
    <td>${u.rol === "admin" ? "Administrador" : "Usuario"}</td>
    <td>${u.rol === "admin" ? "Todos" : esc(u.permisos.join(", ") || "Solo consulta y ventas")}</td>
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
  const permisos = rol === "admin" ? [...CAMPOS]
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
