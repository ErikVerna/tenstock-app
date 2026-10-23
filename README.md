### PP III - IFTS N4 AS

# TenStock — Control de stock de insumos tecnológicos

Proyecto de TecnoNova. Reemplaza el Excel y el papel por un sistema web con stock centralizado: cada venta, entrada o devolución se registra y todos los usuarios conectados ven el stock actualizado sin recargar.

**Tecnologías:** HTML, CSS, JavaScript (módulos ES) y Firebase Firestore.

## Estructura

```
tenstock/
├── index.html              Login, panel de insumos, panel de usuarios y diálogos
├── css/styles.css          Estilos (responsive, modo claro y oscuro)
└── js/
    ├── firebase-config.js  Datos de conexión a Firebase (lo completa cada equipo)
    ├── app.js              Login, insumos, ventas, entradas, bajas, movimientos y usuarios
    └── carga-demo.js       Carga opcional de productos de ejemplo (no se carga sola)
```

## Usuarios precargados

| Perfil | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Usuario | `empleado` | `empleado123` |

Se crean solos la primera vez que se abre la app y la colección `usuarios` está vacía.

## Permisos por perfil

| Acción | Administrador | Usuario |
|---|---|---|
| Consultar / buscar (por nombre, marca o SKU; filtro por categoría) | Sí | Sí |
| Registrar venta (salida de stock) | Sí | Sí |
| Registrar entrada (reposición o devolución de cliente) | Sí | Sí |
| Alta de producto nuevo | Sí | No |
| Modificar datos (nombre, categoría, marca, precio, SKU) | Todos | Solo los que el admin tilde en su ficha (por defecto ninguno) |
| Modificar el stock a mano | No (nadie) | No (nadie) |
| Baja (lógica, con motivo) y reactivación | Sí | No |
| Ver historial de movimientos | Sí | No |
| ABM de usuarios y permisos | Sí | No |

Los permisos de modificación de datos son **configurables**: el admin los tilda por usuario en la pestaña *Usuarios*. El resto de los permisos es fijo por perfil.

## Reglas de negocio

- **Alta vs. entrada.** *Alta* es crear un producto que no existe (la hace el admin, con un stock inicial). *Entrada* es sumar unidades a un producto que ya existe (reposición semanal o devolución): no se vuelve a dar de alta, se suma al stock.
- **Venta.** Descuenta el stock en el momento. Si la cantidad pedida es mayor al stock disponible, **la venta se bloquea** con el mensaje "Stock insuficiente". Con stock 0 el botón *Vender* queda deshabilitado y la fila muestra "Sin stock".
- **Devolución.** Es una entrada con motivo "Devolución": suma al stock del mismo producto, no crea uno nuevo. La puede registrar el vendedor en el mostrador, sin depender del administrador.
- **Caso "última unidad".** Se vende la última unidad (stock 0, "Sin stock") → el cliente la devuelve → el empleado registra una Entrada por devolución (stock 1) → el siguiente cliente ya puede comprarla. Todo queda en el historial.
- **Baja de stock defectuoso.** Descuenta la cantidad rota/defectuosa, registra el movimiento y mantiene activo el producto. Se puede descontar una unidad o un lote completo; no se permite dejar stock negativo.
- **Retiro de comercialización.** Es una operación separada y solo se permite cuando el stock está en cero. Desactiva el producto sin borrar su historial. El administrador puede reactivarlo desde *Ver dados de baja*.
- **Historial.** El administrador puede filtrar los movimientos por un día específico o volver a ver todos.
- **El stock no se edita a mano.** Solo cambia por movimientos (alta, venta, reposición, devolución), así cada cambio queda registrado con usuario y fecha.

---

## Tutorial paso a paso

### Paso 1 — Crear el proyecto en Firebase
1. Entrar a https://console.firebase.google.com con una cuenta de Google.
2. **Agregar proyecto** → nombre `tenstock` → se puede desactivar Google Analytics.
3. En el panel del proyecto, ícono **`</>` (Web)** → registrar la app con el nombre `tenstock-web`. No hace falta Firebase Hosting.
4. Firebase muestra un bloque `firebaseConfig`. Copiar esos valores.

### Paso 2 — Activar Firestore
1. Menú **Compilación → Firestore Database → Crear base de datos**.
2. Elegir ubicación (por ejemplo `southamerica-east1`, São Paulo) y modo **prueba**.
3. En la pestaña **Reglas**, pegar lo siguiente y publicar:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

> **Importante:** estas reglas dejan la base abierta. Sirven para desarrollar y presentar el TP, pero no para un sistema real (ver "Limitaciones").

### Paso 3 — Conectar el código
Abrir `js/firebase-config.js` y reemplazar los valores `REEMPLAZAR` por los del paso 1.

### Paso 4 — Probar en la computadora
El proyecto usa módulos ES, por eso **no funciona abriendo el `index.html` con doble clic**. Opciones:
- **VS Code:** instalar la extensión *Live Server* → clic derecho en `index.html` → *Open with Live Server*.
- **Terminal:** dentro de la carpeta, `python -m http.server 8000` y abrir http://localhost:8000.

Ingresar con `admin` / `admin123`, cargar algunos insumos y probar una venta.

**Datos de ejemplo (opcional).** `js/carga-demo.js` carga 30 productos de prueba. Ya no se ejecuta solo porque mostraba un aviso en cada visita. Para cargarlos una vez, agregar temporalmente `<script type="module" src="js/carga-demo.js"></script>` al final de `index.html`, abrir la app, y volver a sacar la línea.

### Paso 5 — Subir a GitHub
Un integrante crea el repositorio y los demás se suman como colaboradores (*Settings → Collaborators*).

```bash
cd tenstock
git init
git add .
git commit -m "Versión inicial de TenStock"
git branch -M main
git remote add origin https://github.com/USUARIO/tenstock.git
git push -u origin main
```

Para trabajar en equipo sin pisarse: cada uno crea una rama (`git checkout -b feature/nombre`), sube sus cambios y abre un *Pull Request*.

### Paso 6 — Publicar con GitHub Pages
1. En el repositorio: **Settings → Pages**.
2. *Source:* `Deploy from a branch` → rama `main`, carpeta `/ (root)` → Save.
3. En un par de minutos queda disponible en `https://USUARIO.github.io/tenstock/`.

Las claves de `firebaseConfig` son públicas por diseño: identifican el proyecto, no lo protegen. La protección real son las reglas de Firestore.

---

## Cómo funciona el código

**Base de datos (Firestore).** Tres colecciones:
- `insumos`: nombre, categoria, marca, precio, stock, sku, activo, motivoBaja, fechaBaja. Los documentos viejos sin el campo `activo` cuentan como activos.
- `usuarios`: usuario, rol, activo, passHash, permisos (lista de campos editables).
- `movimientos`: historial de todo cambio de stock (alta, venta, reposición, devolución, baja, reactivación) con insumo, cantidad, stock resultante, usuario y fecha. La baja de stock defectuoso se registra como `baja_stock`; la desactivación comercial se registra como `baja`.

**Login.** Busca el documento `usuarios/{usuario}`, compara el hash SHA-256 de la contraseña ingresada con el guardado, y guarda el perfil en `sessionStorage`. Las contraseñas nunca se guardan en texto plano.

**Perfiles.** Un administrador ve *Agregar insumo*, *Dar de baja* y las pestañas *Movimientos* y *Usuarios*. Un usuario ve *Vender* y *Entrada*, y *Editar* solo si el admin le habilitó algún campo (los demás quedan deshabilitados). Ver la tabla de permisos más arriba.

**Actualización en vivo.** `onSnapshot` mantiene la tabla sincronizada: si un empleado vende, todos los demás ven el stock nuevo sin recargar. Lo que *no* es automático es la carga de datos: las entradas de mercadería las registra una persona y las ventas se cargan a mano en el sistema.

**Movimientos de stock.** Venta, reposición y devolución pasan por una misma función (`moverStock`) que usa una transacción (`runTransaction`): lee el stock actual, lo modifica y registra el movimiento en un solo paso. Por eso nunca queda un cambio de stock sin registro, y dos usuarios operando el mismo producto a la vez no pueden dejar el stock negativo.

**Ventas sin stock.** Regla elegida: **bloquear** la salida si la cantidad pedida supera el stock disponible. Esto ataca directamente el problema del negocio (ventas de productos que no había).

**Búsqueda.** Por nombre, marca o SKU (el SKU permite ubicar rápido un producto cuando hay varios parecidos, por ejemplo dos pendrives de 8 GB de distinta marca), más filtro por categoría. No se implementó código de barras porque el negocio no lo usa hoy.

**Edición segura.** Al modificar un producto solo se escriben los campos que cambiaron, y el stock no es editable: modificar un precio nunca pisa el stock de una venta que ocurrió mientras tanto.

**Validaciones.** SKU único, precio ≥ 0, stock inicial entero ≥ 0, cantidades enteras ≥ 1, y los textos se escapan al mostrarlos para evitar inyección de HTML.

---

## Punto 6 — Uso de IA (texto para el informe)

Utilizamos Claude (Anthropic) como asistente durante el desarrollo. Le entregamos el contexto completo del sistema (problema del negocio, entidad Insumo tecnológico, perfiles, funcionalidades del ABM y herramientas) y lo usamos en estas tareas:

| Tarea | Qué hizo la IA | Qué hicimos nosotros |
|---|---|---|
| Código base del login y ABM | Generó la estructura de archivos, el login con perfiles, el ABM de insumos y el ABM de usuarios con permisos | Revisamos el código, lo probamos y lo conectamos a nuestro proyecto de Firebase |
| Validación de errores | Incorporó validaciones de formulario, control de SKU repetido y bloqueo de ventas sin stock mediante transacciones | Probamos casos límite (stock 0, SKU duplicado, usuario inactivo) |
| Diagramas de flujo | *(pendiente: completar con los diagramas que generemos)* | *(pendiente)* |
| Optimización de interfaz | Propuso una interfaz responsive, con modo claro/oscuro, estados de stock por color y foco visible para teclado | Ajustamos textos y colores a la identidad de TecnoNova |

**Criterio de uso:** la IA propuso y nosotros validamos. Todo el código fue leído, probado y entendido por el equipo antes de incorporarlo, y las decisiones de diseño (perfiles, permisos, reglas de negocio) surgieron del análisis que hicimos en la Parte A.

---

## Limitaciones conocidas y mejoras futuras

- **Seguridad:** el login se valida en el navegador y las reglas de Firestore están abiertas. Para un sistema real se debería usar **Firebase Authentication** y reglas que verifiquen el rol del usuario.
- **Alta masiva:** como el administrador carga mercadería una vez por semana, se podría agregar importación desde CSV.
- **Alertas:** hoy el color marca stock bajo (≤ 5, fijo en el código); se podría avisar automáticamente con un mínimo configurable por producto.
- **Venta con varios productos:** hoy cada venta es de un solo producto; un carrito/ticket con varios ítems sería una mejora.
- **Historial:** el filtro por día está implementado. Para instalaciones con un volumen grande de movimientos, conviene agregar paginación y hacer el filtro de fecha desde la consulta de Firestore.

---

## Login

<img width="1433" height="682" alt="Screen Shot 2026-10-22 at 23 10 06" src="https://github.com/user-attachments/assets/8bddd92f-7273-4d90-86ff-af395eb24459" />

---

## Insumos

<img width="1410" height="764" alt="Screen Shot 2026-10-22 at 23 13 55" src="https://github.com/user-attachments/assets/d5ef5677-931f-447e-8e4e-5ddf62469bac" />

---

## Movimientos

<img width="1413" height="764" alt="Screen Shot 2026-10-22 at 23 15 28" src="https://github.com/user-attachments/assets/4aa99561-e316-4247-aebe-4fc6c83519d7" />

---

## Usuarios

<img width="1439" height="722" alt="Screen Shot 2026-10-22 at 23 29 46" src="https://github.com/user-attachments/assets/55306bc7-aaf6-4be3-a8ca-39e97cf6f6f7" />

