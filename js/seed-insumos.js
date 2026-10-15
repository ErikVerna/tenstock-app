// Datos de ejemplo para TenStock.
// Los modelos son reales; los precios (ARS) y el stock son INVENTADOS para pruebas.
// Se cargan solos la primera vez, si no hay insumos. Para desactivarlo: false.
export const CARGAR_DATOS_DE_EJEMPLO = true;

const P = "Hardware / Placas de video", C = "Hardware / Procesadores", R = "Hardware / Memorias RAM",
  A = "Hardware / Almacenamiento", M = "Hardware / Motherboards", F = "Hardware / Fuentes y gabinetes";

export const INSUMOS_EJEMPLO = [
  { nombre: "Placa de Video ASUS Dual GeForce RTX 4060 8GB", categoria: P, marca: "ASUS", precio: 1543000, stock: 12, sku: "ASUS-RTX4060-O8G-V2" },
  { nombre: "Placa de Video MSI GeForce RTX 4060 Ti Ventus 2X 8GB", categoria: P, marca: "MSI", precio: 1890000, stock: 6, sku: "MSI-RTX4060TI-V2X-8G" },
  { nombre: "Placa de Video Gigabyte Radeon RX 7600 Gaming OC 8GB", categoria: P, marca: "Gigabyte", precio: 1250000, stock: 9, sku: "GIGA-RX7600-GOC-8G" },
  { nombre: "Placa de Video PNY GeForce RTX 4070 Super 12GB", categoria: P, marca: "PNY", precio: 2850000, stock: 3, sku: "PNY-RTX4070S-12G" },

  { nombre: "Procesador AMD Ryzen 5 5600 AM4", categoria: C, marca: "AMD", precio: 215000, stock: 20, sku: "AMD-R5-5600-AM4" },
  { nombre: "Procesador AMD Ryzen 7 5700X AM4", categoria: C, marca: "AMD", precio: 330000, stock: 11, sku: "AMD-R7-5700X-AM4" },
  { nombre: "Procesador AMD Ryzen 5 7600 AM5", categoria: C, marca: "AMD", precio: 395000, stock: 8, sku: "AMD-R5-7600-AM5" },
  { nombre: "Procesador Intel Core i5-12400F LGA1700", categoria: C, marca: "Intel", precio: 205000, stock: 15, sku: "INTEL-I5-12400F" },
  { nombre: "Procesador Intel Core i7-14700K LGA1700", categoria: C, marca: "Intel", precio: 720000, stock: 4, sku: "INTEL-I7-14700K" },

  { nombre: "Memoria RAM Kingston Fury Beast 16GB DDR4 3200MHz", categoria: R, marca: "Kingston", precio: 62000, stock: 40, sku: "KNG-FURY-16G-D4-3200" },
  { nombre: "Memoria RAM Corsair Vengeance 32GB (2x16) DDR5 6000MHz", categoria: R, marca: "Corsair", precio: 210000, stock: 10, sku: "CORS-VENG-32G-D5-6000" },
  { nombre: "Memoria RAM Crucial 8GB DDR4 3200MHz", categoria: R, marca: "Crucial", precio: 34000, stock: 28, sku: "CRU-8G-D4-3200" },
  { nombre: "Memoria RAM Patriot Viper Steel 16GB DDR4 3600MHz", categoria: R, marca: "Patriot", precio: 68000, stock: 0, sku: "PAT-VIPER-16G-D4-3600" },

  { nombre: "SSD NVMe WD Blue SN580 1TB", categoria: A, marca: "Western Digital", precio: 118000, stock: 18, sku: "WD-SN580-1TB" },
  { nombre: "SSD NVMe Kingston NV2 500GB", categoria: A, marca: "Kingston", precio: 62000, stock: 25, sku: "KNG-NV2-500G" },
  { nombre: "SSD Kingston A400 480GB SATA", categoria: A, marca: "Kingston", precio: 48000, stock: 30, sku: "KNG-A400-480G" },
  { nombre: "SSD NVMe Samsung 980 Pro 1TB", categoria: A, marca: "Samsung", precio: 195000, stock: 5, sku: "SAM-980PRO-1TB" },
  { nombre: "Disco Rígido Seagate Barracuda 2TB 3.5\"", categoria: A, marca: "Seagate", precio: 95000, stock: 14, sku: "SEA-BARRA-2TB" },

  { nombre: "Motherboard ASUS Prime B550M-A AM4", categoria: M, marca: "ASUS", precio: 175000, stock: 9, sku: "ASUS-PRIME-B550M-A" },
  { nombre: "Motherboard MSI PRO B650M-P AM5", categoria: M, marca: "MSI", precio: 235000, stock: 7, sku: "MSI-B650M-P" },
  { nombre: "Motherboard Gigabyte B760M DS3H DDR4", categoria: M, marca: "Gigabyte", precio: 190000, stock: 3, sku: "GIGA-B760M-DS3H" },

  { nombre: "Fuente Corsair CV650 650W 80 Plus Bronze", categoria: F, marca: "Corsair", precio: 98000, stock: 16, sku: "CORS-CV650" },
  { nombre: "Fuente Gigabyte P750GM 750W 80 Plus Gold", categoria: F, marca: "Gigabyte", precio: 165000, stock: 5, sku: "GIGA-P750GM" },
  { nombre: "Gabinete Cooler Master MasterBox MB520 ARGB", categoria: F, marca: "Cooler Master", precio: 112000, stock: 8, sku: "CM-MB520-ARGB" },

  { nombre: "Mouse Logitech G203 Lightsync", categoria: "Periféricos", marca: "Logitech", precio: 32000, stock: 35, sku: "LOGI-G203" },
  { nombre: "Teclado Mecánico Redragon Kumara K552", categoria: "Periféricos", marca: "Redragon", precio: 52000, stock: 22, sku: "RED-K552" },
  { nombre: "Auriculares HyperX Cloud Stinger 2", categoria: "Periféricos", marca: "HyperX", precio: 58000, stock: 12, sku: "HYPX-CLOUD-ST2" },

  { nombre: "Router TP-Link Archer AX23 Wi-Fi 6", categoria: "Redes", marca: "TP-Link", precio: 72000, stock: 17, sku: "TPL-AX23" },
  { nombre: "Switch TP-Link TL-SG108 8 puertos Gigabit", categoria: "Redes", marca: "TP-Link", precio: 38000, stock: 4, sku: "TPL-SG108" },

  { nombre: "Notebook Lenovo IdeaPad 3 15\" Ryzen 5 8GB 512GB", categoria: "Notebooks", marca: "Lenovo", precio: 1150000, stock: 6, sku: "LEN-IP3-R5-8-512" },

  { nombre: "Monitor LG 24MR400 24\" IPS 100Hz", categoria: "Monitores", marca: "LG", precio: 165000, stock: 10, sku: "LG-24MR400" },
  { nombre: "Monitor Samsung Odyssey G3 27\" 165Hz", categoria: "Monitores", marca: "Samsung", precio: 340000, stock: 2, sku: "SAM-ODY-G3-27" },

  { nombre: "Pendrive Kingston DataTraveler 64GB USB 3.2", categoria: "Otros", marca: "Kingston", precio: 14000, stock: 60, sku: "KNG-DT-64G" }
];
