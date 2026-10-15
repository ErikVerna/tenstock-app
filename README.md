### PP III - IFTS N4 AS

# TenStock — Control de stock de insumos tecnológicos

Proyecto de TecnoNova. Reemplaza el Excel y el papel por un sistema web con stock en tiempo real.

**Tecnologías:** HTML, CSS, JavaScript (módulos ES) y Firebase Firestore.

## Estructura

```
tenstock/
├── index.html              Login, panel de insumos, panel de usuarios y diálogos
├── css/styles.css          Estilos (responsive, modo claro y oscuro)
└── js/
    ├── firebase-config.js  Datos de conexión a Firebase (lo completa cada equipo)
    └── app.js              Login, ABM de insumos, ventas y ABM de usuarios
```

## Usuarios precargados

| Perfil | Usuario | Contraseña | Puede |
|---|---|---|---|
| Administrador | `admin` | `admin123` | Todo: ABM de insumos, ABM de usuarios y permisos |
| Usuario | `empleado` | `empleado123` | Consultar, registrar ventas y editar solo los campos que permita el admin (por defecto: stock) |

Se crean solos la primera vez que se abre la app y la colección `usuarios` está vacía.

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

## Cómo funciona el código (para explicarle al equipo)

**Base de datos (Firestore).** Tres colecciones:
- `insumos`: nombre, categoria, marca, precio, stock, sku.
- `usuarios`: usuario, rol, activo, passHash, permisos (lista de campos editables).
- `movimientos`: historial de salidas por venta (insumo, cantidad, usuario, fecha).

**Login.** Busca el documento `usuarios/{usuario}`, compara el hash SHA-256 de la contraseña ingresada con el guardado, y guarda el perfil en `sessionStorage`. Las contraseñas nunca se guardan en texto plano.

**Perfiles.** Un administrador ve el botón *Agregar insumo*, *Dar de baja* y la pestaña *Usuarios*. Un usuario solo ve *Vender* y *Editar*, y en el formulario de edición quedan deshabilitados los campos que el admin no le permitió.

**Tiempo real.** `onSnapshot` mantiene la tabla sincronizada: si un empleado vende, todos los demás ven el stock nuevo sin recargar.

**Ventas sin stock.** El descuento usa una transacción (`runTransaction`): lee el stock actual y lo descuenta en un solo paso. Si se pide más de lo disponible, la venta se rechaza, y dos ventas simultáneas no pueden dejar el stock en negativo. Esto ataca directamente el problema del negocio.

**Validaciones.** SKU único, precio ≥ 0, stock entero ≥ 0, y los textos se escapan al mostrarlos para evitar inyección de HTML.

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
- **Baja:** elimina el documento. Una alternativa es una baja lógica (`activo: false`) para conservar el historial.
- **Alta masiva:** como el administrador carga mercadería una vez por semana, se podría agregar importación desde CSV.
- **Movimientos:** hoy se registran las salidas; las entradas (altas y reposiciones) podrían registrarse igual para tener trazabilidad completa.
- **Alertas:** avisar automáticamente cuando un insumo baja de un stock mínimo configurable.
