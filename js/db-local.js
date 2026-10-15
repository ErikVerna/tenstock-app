// Modo demo: imita la parte de Firestore que usa TenStock, guardando en localStorage.
// Los datos viven solo en este navegador. Para reiniciarlos: localStorage.clear() en la consola.
const KEY = "tenstock_db";
const leer = () => JSON.parse(localStorage.getItem(KEY) || "{}");
const oyentes = new Set();
const guardar = (datos) => {
  localStorage.setItem(KEY, JSON.stringify(datos));
  oyentes.forEach((f) => f());
};
const nombreCol = (ref) => ref.col ?? ref.nombre;
const snapDoc = (id, data) => ({ id, exists: () => data !== undefined, data: () => (data === undefined ? undefined : structuredClone(data)) });

export const db = {};
export const collection = (_db, nombre) => ({ tipo: "col", nombre });
export const doc = (_db, col, id) => ({ tipo: "doc", col, id });
export const where = (campo, op, valor) => ({ tipo: "where", campo, op, valor });
export const limit = (n) => ({ tipo: "limit", n });
export const query = (colRef, ...restricciones) => ({ tipo: "query", col: colRef.nombre, restricciones });
export const serverTimestamp = () => new Date().toISOString();

function docsDe(ref) {
  const entradas = Object.entries(leer()[nombreCol(ref)] || {});
  let lista = entradas;
  for (const r of ref.restricciones || []) {
    if (r.tipo === "where") lista = lista.filter(([, d]) => d[r.campo] === r.valor);
    if (r.tipo === "limit") lista = lista.slice(0, r.n);
  }
  return lista.map(([id, d]) => snapDoc(id, d));
}

export const getDoc = async (ref) => snapDoc(ref.id, (leer()[ref.col] || {})[ref.id]);
export const getDocs = async (ref) => { const docs = docsDe(ref); return { docs, empty: docs.length === 0 }; };

function escribir(ref, fn) {
  const datos = leer();
  datos[ref.col] = datos[ref.col] || {};
  fn(datos[ref.col]);
  guardar(datos);
}
export const setDoc = async (ref, data, opciones) =>
  escribir(ref, (c) => { c[ref.id] = opciones?.merge ? { ...(c[ref.id] || {}), ...data } : data; });
export const updateDoc = async (ref, data) =>
  escribir(ref, (c) => { if (c[ref.id]) c[ref.id] = { ...c[ref.id], ...data }; });
export const deleteDoc = async (ref) => escribir(ref, (c) => { delete c[ref.id]; });
export const addDoc = async (colRef, data) => {
  const id = crypto.randomUUID();
  escribir({ col: colRef.nombre, id }, (c) => { c[id] = data; });
  return { id };
};

export function onSnapshot(ref, callback) {
  const avisar = () => callback({ docs: docsDe(ref) });
  oyentes.add(avisar);
  setTimeout(avisar, 0);
  return () => oyentes.delete(avisar);
}

export async function runTransaction(_db, fn) {
  const tx = { get: (ref) => getDoc(ref), update: (ref, data) => updateDoc(ref, data) };
  return fn(tx);
}
