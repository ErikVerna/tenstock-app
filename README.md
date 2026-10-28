# TenStock

Sistema web para administrar el stock de insumos tecnológicos de **TecnoNova**. La aplicación permite registrar productos, controlar entradas y salidas de stock, consultar movimientos y administrar usuarios según sus permisos.

El objetivo es tener la información de los productos centralizada y mantener un registro de los cambios de stock, evitando depender de planillas separadas o anotaciones en papel.

## Funcionalidades principales

- **Gestión de insumos:** alta, consulta, búsqueda, edición y baja lógica de productos.
- **Control de stock:** registro de ventas, reposiciones y devoluciones.
- **Validaciones:** SKU único por producto, precios y cantidades válidas, y bloqueo de ventas cuando no hay stock suficiente.
- **Historial de movimientos:** registro de las operaciones que modifican el stock, con usuario y fecha.
- **Usuarios y permisos:** perfiles de administrador y usuario, con permisos de edición configurables por el administrador.
- **Búsqueda y filtros:** búsqueda por nombre, marca o SKU y filtro por categoría.
- **Actualización en tiempo real:** los cambios de stock se reflejan en las sesiones conectadas.
- **Interfaz adaptable:** diseño responsive y opciones de tema claro y oscuro.

## Perfiles de usuario

| Funcionalidad | Administrador | Usuario |
|---|---|---|
| Consultar y buscar insumos | Sí | Sí |
| Registrar ventas y entradas | Sí | Sí |
| Dar de alta productos | Sí | No |
| Editar datos del producto | Sí | Solo si tiene permisos habilitados |
| Dar de baja o reactivar productos | Sí | No |
| Consultar historial de movimientos | Sí | No |
| Administrar usuarios y permisos | Sí | No |

El stock no se modifica directamente desde la edición del producto. Se actualiza mediante movimientos para conservar el registro de las operaciones.

## Reglas de funcionamiento

- **Alta de producto:** permite registrar un insumo nuevo e indicar su stock inicial.
- **SKU único:** cada producto debe tener un SKU diferente. Si se ingresa uno que ya está registrado, la aplicación muestra una advertencia y no debería permitir guardar el duplicado.
- **Venta:** descuenta las unidades vendidas. Si la cantidad solicitada supera el stock disponible, la operación se bloquea.
- **Entrada:** suma unidades a un producto existente. Se utiliza para reposiciones y devoluciones.
- **Baja de stock defectuoso:** descuenta las unidades dañadas sin dar de baja el producto completo.
- **Baja de producto:** desactiva el producto cuando su stock está en cero, sin borrar su historial. El administrador puede reactivarlo.
- **Registro de movimientos:** las operaciones de stock dejan un registro para poder consultar qué ocurrió.

## Tecnologías utilizadas

- HTML
- CSS
- JavaScript (módulos ES)
- Firebase Firestore para almacenar y sincronizar los datos

## Estructura del proyecto

```text
tenstock/
├── index.html              Pantalla principal y formularios de la aplicación
├── css/
│   └── styles.css          Estilos, diseño responsive y temas
├── img/                    Imágenes y recursos visuales
└── js/
    ├── firebase-config.js  Configuración de conexión con Firebase
    ├── app.js              Lógica principal, productos, stock, usuarios y movimientos
    └── carga-demo.js       Carga opcional de productos de ejemplo
```

## Cómo ejecutar el proyecto

1. Configurar un proyecto de Firebase y habilitar Firestore.
2. Completar los datos de conexión en `js/firebase-config.js`.
3. Abrir la carpeta del proyecto con Visual Studio Code y ejecutar `index.html` mediante una extensión como **Live Server**. También se puede iniciar un servidor local desde la carpeta con:

   ```bash
   python -m http.server 8000
   ```

4. Abrir `http://localhost:8000` en el navegador.

La aplicación utiliza módulos de JavaScript, por lo que no se recomienda abrir `index.html` directamente con doble clic.

## Datos de prueba

En una base vacía, la aplicación puede crear estos usuarios iniciales:

| Perfil | Usuario | Contraseña |
|---|---|---|
| Administrador | `admin` | `admin123` |
| Usuario | `empleado` | `empleado123` |

Son credenciales de demostración. Si se cambia la lógica de usuarios o se utiliza otra base de datos, pueden no estar disponibles.

El archivo `js/carga-demo.js` permite cargar productos de ejemplo de manera opcional. No es necesario utilizarlo para ejecutar la aplicación.

## Alcance y consideraciones

TenStock es un proyecto académico y de demostración. La configuración de Firebase debe corresponder al entorno utilizado para probar la aplicación. Las reglas de acceso abiertas pueden servir para pruebas controladas, pero no son adecuadas para un sistema publicado o con información real.

Entre las posibles mejoras futuras se encuentran la importación de productos desde CSV, la configuración de alertas de stock mínimo y la creación de ventas con varios productos en un mismo comprobante.
