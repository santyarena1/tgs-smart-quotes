export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

/** Historial de novedades de la app. La primera entrada es la versión actual. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.3.8",
    date: "2026-08-28",
    title: "Calculadora de financiación",
    items: [
      "Nuevo módulo Calculadora, suelto en el menú, para armar una tarjeta linda de cuotas y sacarle una captura",
      "Dashboard, Solicitudes, Presupuestos, Colecciones y Mi cuenta quedan siempre visibles, fuera del acordeón de Operación",
      "Los intereses arrancan con los de Configuración → Financiación; el engranaje deja subir iconos (Mercado Pago, BBVA, Visa, Master, Go Cuotas) y ajustar tasas sin pisar los presupuestos",
    ],
  },
  {
    version: "0.3.7",
    date: "2026-08-28",
    title: "Importes en pesos, sin centavos",
    items: [
      "En el editor de presupuestos (y en el resto de la app) los montos se muestran y se cargan en pesos enteros, sin decimales: $ 50.000, no $ 50.000,00",
    ],
  },
  {
    version: "0.3.6",
    date: "2026-08-28",
    title: "Sueldo mensual automático",
    items: [
      "Al cambiar de mes se actualiza el sueldo de todos los empleados con el IPC de hace 2 meses y se devenga en la cuenta corriente",
      "Lo que no se pagó (sueldo, deudas, cuotas) se arrastra al mes siguiente",
      "El botón ahora es Actualizar sueldo: se puede sumar un aumento extra en % o en pesos, encima del IPC",
    ],
  },
  {
    version: "0.3.5",
    date: "2026-08-28",
    title: "IPC de hace 2 meses al cargar sueldo",
    items: [
      "El aumento por IPC usa el índice de hace 2 meses: en agosto, el de junio; en septiembre, el de julio",
    ],
  },
  {
    version: "0.3.4",
    date: "2026-08-27",
    title: "Pago con el neto ya cargado",
    items: [
      "Al tocar Pagar, el monto viene preescrito con el 100% del neto a pagar (se puede cambiar)",
    ],
  },
  {
    version: "0.3.3",
    date: "2026-08-27",
    title: "Eliminar cuotas sin que vuelvan a aparecer",
    items: [
      "Eliminar una cuota la saca del saldo de verdad: ya no se recrea al recargar la ficha",
      "Si la deuda es en dos o más cuotas, se pregunta si querés borrar solo ese mes o toda la deuda",
      "Los movimientos eliminados ya no aparecen mezclados en la lista",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-08-27",
    title: "Deudas de The Gamer Shop al empleado",
    items: [
      "Al cargar una deuda se elige quién debe: el empleado a TGS, o TGS al empleado",
      "Si la empresa le debe, el importe suma al neto a pagar (igual que el sueldo)",
      "En cuotas, el saldo solo se mueve por la cuota del mes: se ve cuántas quedan y cuál era el total",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-08-25",
    title: "Empleados: cuenta corriente, sueldos y pagos más claros",
    items: [
      "La carga de sueldo (con IPC) y deudas es más simple, con montos formateados en tiempo real y neto a pagar",
      "El sueldo devengado entra a la cuenta corriente, con desglose al registrar un pago",
      "Se corrigió el costo del catálogo para que se sincronice al editarlo desde un presupuesto",
      "La lista de presupuestos se puede filtrar por local, y el historial de versiones muestra los nombres de componentes",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-08-18",
    title: "Impresión por local, buscador más rápido y datos de cliente en el PDF",
    items: [
      "El PDF ahora muestra el local de quien imprime, no el de quien creó el presupuesto",
      "El buscador de productos ordena por precio de menor a mayor y ya no se traba con resultados viejos",
      "En PC armada, al elegir una línea el buscador se enfoca automáticamente",
      "Se corrigió un bug que creaba versiones de más al generar el PDF sin editar nada",
      "Restaurar una versión ahora vuelve a esa versión sin crear una copia nueva, como corresponde",
      "Al guardar cambios se puede poner un nombre de referencia, y se pueden borrar versiones borrador viejas desde el historial",
      "El listado de presupuestos muestra el local donde se creó cada uno, y el dashboard filtra por local",
      "Los clientes pueden tener dirección y condición fiscal, mostradas en el PDF cuando hay cliente vinculado",
      "Se ajustaron tamaños y espaciados del PDF para que se vea más prolijo",
    ],
  },
  {
    version: "0.2.9",
    date: "2026-07-27",
    title: "Líneas en el presupuesto, ocultas en el PDF si vacías",
    items: [
      "En PC armada las líneas se listan en el presupuesto para cargar productos",
      "Si una línea queda vacía no se guarda ni aparece en el PDF",
      "Se quitó la preview duplicada de arriba; el aprendizaje de líneas se mantiene",
    ],
  },
  {
    version: "0.2.8",
    date: "2026-07-27",
    title: "Preview de líneas, redondeo y total claro",
    items: [
      "En PC armada vuelve el orden de armado (preview) con estado vacío/completo",
      "Opción para redondear precios de venta a $100 / $500 / $1.000 / $5.000",
      "El total del presupuesto queda más visible al pie de la tabla y del editor",
    ],
  },
  {
    version: "0.2.7",
    date: "2026-07-27",
    title: "Líneas PC opcionales",
    items: [
      "En PC armada las líneas vacías ya no aparecen en el presupuesto",
      "Se agregan productos con botones por línea; ninguna línea es obligatoria",
    ],
  },
  {
    version: "0.2.6",
    date: "2026-07-27",
    title: "PC armada por líneas",
    items: [
      "Al marcar PC armada aparecen todas las líneas como ranuras para elegir producto",
      "Al asignar un producto a una línea, el sistema recuerda esa asociación",
      "Sugerencias por línea (historial + usos previos) y componentes habituales clickeables",
      "Base lista para futuras sugerencias de armado y detección de compatibilidad",
    ],
  },
  {
    version: "0.2.5",
    date: "2026-07-27",
    title: "Líneas PC solo como referencia",
    items: [
      "Líneas PC: solo nombre, orden y activa (sin concepto/aliases/clave en la UI)",
      "Ya no se asocia línea por defecto a productos",
      "En presupuestos de PC armada se muestra el orden de referencia; los ítems se ordenan a mano",
      "Se quitó el campo duplicado de orden de líneas en Configuración → PDF",
    ],
  },
  {
    version: "0.2.4",
    date: "2026-07-26",
    title: "Buscadores con teclado",
    items: [
      "En pickers de productos/combos/presupuestos: ↑↓ para moverse y Enter para seleccionar",
      "Escape cierra el desplegable",
    ],
  },
  {
    version: "0.2.3",
    date: "2026-07-26",
    title: "Solicitudes: asociar y arrastrar",
    items: [
      "Asociar un presupuesto existente a una solicitud, con 3 sugerencias según el pedido",
      "Arrastrar tarjetas del kanban entre columnas",
      "Seguir creando un presupuesto nuevo desde la solicitud",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-07-26",
    title: "Último uso de productos",
    items: [
      "Cada producto muestra la fecha de último uso en presupuestos",
      "Al abrir un producto se listan los presupuestos donde aparece",
      "El buscador de presupuestos también muestra cuándo se usó por última vez",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-07-26",
    title: "Productos: borrado masivo y unificación",
    items: [
      "Selección múltiple y eliminación masiva de productos",
      "Buscar duplicados por similitud de nombre y unificar eligiendo cuál conservar",
      "Al unificar, los ítems de presupuestos y combos pasan al producto elegido",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-07-26",
    title: "Combos y novedades",
    items: [
      "Nuevo módulo Combos en Catálogo para agrupar productos frecuentes",
      "En el buscador de presupuestos podés elegir un combo y se expanden los productos individuales con su precio actual",
      "Changelog visible en el menú lateral con el historial de versiones",
    ],
  },
  {
    version: "0.1.0",
    date: "2026-07-26",
    title: "Suite base",
    items: [
      "Presupuestos, solicitudes, productos, clientes y colecciones",
      "Logo de empresa, PDF y extensión Chrome",
      "Crear presupuesto desde una solicitud de WhatsApp",
    ],
  },
];

export function currentAppVersion(): string {
  return CHANGELOG[0]?.version ?? "0.0.0";
}
