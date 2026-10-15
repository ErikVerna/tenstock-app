import { getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const db = getFirestore(getApp());

const productos = [
  {nombre:"GeForce RTX 4060",categoria:"Hardware / Placas de video",marca:"MSI",sku:"DEMO-GPU-001",precio:520000,stock:8},
  {nombre:"GeForce RTX 4070 Super",categoria:"Hardware / Placas de video",marca:"Gigabyte",sku:"DEMO-GPU-002",precio:980000,stock:3},
  {nombre:"Radeon RX 7600",categoria:"Hardware / Placas de video",marca:"Sapphire",sku:"DEMO-GPU-003",precio:450000,stock:0},
  {nombre:"Core i5-14400F",categoria:"Hardware / Procesadores",marca:"Intel",sku:"DEMO-CPU-001",precio:310000,stock:12},
  {nombre:"Ryzen 5 5600",categoria:"Hardware / Procesadores",marca:"AMD",sku:"DEMO-CPU-002",precio:185000,stock:5},
  {nombre:"Ryzen 7 7800X3D",categoria:"Hardware / Procesadores",marca:"AMD",sku:"DEMO-CPU-003",precio:620000,stock:2},
  {nombre:"RAM Fury Beast 8GB DDR4",categoria:"Hardware / Memorias RAM",marca:"Kingston",sku:"DEMO-RAM-001",precio:28000,stock:20},
  {nombre:"RAM Fury Beast 16GB DDR4",categoria:"Hardware / Memorias RAM",marca:"Kingston",sku:"DEMO-RAM-002",precio:48000,stock:14},
  {nombre:"RAM Vengeance 32GB DDR5",categoria:"Hardware / Memorias RAM",marca:"Corsair",sku:"DEMO-RAM-003",precio:125000,stock:4},
  {nombre:"SSD SATA 480GB",categoria:"Hardware / Almacenamiento",marca:"Kingston",sku:"DEMO-SSD-001",precio:42000,stock:18},
  {nombre:"SSD NVMe 1TB",categoria:"Hardware / Almacenamiento",marca:"WD",sku:"DEMO-SSD-002",precio:95000,stock:7},
  {nombre:"SSD NVMe 2TB",categoria:"Hardware / Almacenamiento",marca:"Samsung",sku:"DEMO-SSD-003",precio:210000,stock:2},
  {nombre:"Motherboard B550M",categoria:"Hardware / Motherboards",marca:"Gigabyte",sku:"DEMO-MB-001",precio:145000,stock:6},
  {nombre:"Motherboard B760",categoria:"Hardware / Motherboards",marca:"MSI",sku:"DEMO-MB-002",precio:220000,stock:3},
  {nombre:"Motherboard B650",categoria:"Hardware / Motherboards",marca:"ASUS",sku:"DEMO-MB-003",precio:265000,stock:0},
  {nombre:"Fuente 550W 80 Plus Bronze",categoria:"Hardware / Fuentes y gabinetes",marca:"Corsair",sku:"DEMO-FU-001",precio:85000,stock:9},
  {nombre:"Fuente 750W 80 Plus Gold",categoria:"Hardware / Fuentes y gabinetes",marca:"XPG",sku:"DEMO-FU-002",precio:145000,stock:4},
  {nombre:"Gabinete Mid Tower",categoria:"Hardware / Fuentes y gabinetes",marca:"DeepCool",sku:"DEMO-GAB-001",precio:90000,stock:6},
  {nombre:"Teclado mecánico TKL",categoria:"Periféricos",marca:"Redragon",sku:"DEMO-PER-001",precio:65000,stock:11},
  {nombre:"Mouse gamer 12000 DPI",categoria:"Periféricos",marca:"Logitech",sku:"DEMO-PER-002",precio:42000,stock:15},
  {nombre:"Auriculares USB",categoria:"Periféricos",marca:"HyperX",sku:"DEMO-PER-003",precio:78000,stock:3},
  {nombre:"Webcam Full HD",categoria:"Periféricos",marca:"Logitech",sku:"DEMO-PER-004",precio:55000,stock:0},
  {nombre:"Monitor IPS 24 pulgadas",categoria:"Monitores",marca:"LG",sku:"DEMO-MON-001",precio:185000,stock:8},
  {nombre:"Monitor gaming 27 pulgadas",categoria:"Monitores",marca:"Samsung",sku:"DEMO-MON-002",precio:340000,stock:2},
  {nombre:"Router Wi-Fi 6",categoria:"Redes",marca:"TP-Link",sku:"DEMO-RED-001",precio:95000,stock:7},
  {nombre:"Switch Gigabit 8 puertos",categoria:"Redes",marca:"TP-Link",sku:"DEMO-RED-002",precio:38000,stock:12},
  {nombre:"Cable de red Cat 6 5m",categoria:"Redes",marca:"Genérico",sku:"DEMO-RED-003",precio:6500,stock:30},
  {nombre:"Notebook Ryzen 5 16GB",categoria:"Notebooks",marca:"Lenovo",sku:"DEMO-NB-001",precio:890000,stock:2},
  {nombre:"Notebook Core i5 8GB",categoria:"Notebooks",marca:"Dell",sku:"DEMO-NB-002",precio:780000,stock:5},
  {nombre:"Pasta térmica 4g",categoria:"Otros",marca:"Arctic",sku:"DEMO-OTR-001",precio:12000,stock:1}
];

async function cargarProductosDemo() {
  let batch = writeBatch(db);
  let operaciones = 0;
  let creados = 0;
  let existentes = 0;

  for (const producto of productos) {
    const id = producto.sku.toLowerCase();
    const ref = doc(db, "insumos", id);
    const actual = await getDoc(ref);

    if (actual.exists()) {
      existentes++;
      continue;
    }

    batch.set(ref, producto);
    operaciones++;
    creados++;

    if (operaciones === 450) {
      await batch.commit();
      batch = writeBatch(db);
      operaciones = 0;
    }
  }

  if (operaciones > 0) await batch.commit();

  console.log("Carga finalizada", {
    creados,
    existentes,
    total: productos.length
  });

  alert(`Carga finalizada.\nNuevos: ${creados}\nYa existentes: ${existentes}`);
}

cargarProductosDemo().catch((error) => {
  console.error("Error al cargar productos:", error);
  alert("No se pudieron cargar los productos. Revisá la consola y las reglas de Firestore.");
});