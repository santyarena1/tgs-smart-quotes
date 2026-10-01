export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

/** Historial de novedades de la app. La primera entrada es la versión actual. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.10.0",
    date: "2026-10-01",
    title: "CRM nuevo, etapa 3: bandeja y conversación rediseñadas",
    items: [
      "CRM con barra lateral propia (Bandeja, Respuestas rápidas, Plantillas, Bot) y tema claro, oscuro o automático que se guarda por usuario",
      "Bandeja con vistas y contadores: Todas, Mías, Sin asignar, Derivadas, Con el bot, Sin leer, Esperando al cliente, Pospuestas y Resueltas. Búsqueda por nombre, número, mensaje o etiqueta",
      "Cada chat muestra quién lo atiende (bot o vendedor), si está derivado, la ventana de 24 h, sus etiquetas y quién más lo está mirando o escribiendo",
      "Resolver, reabrir y posponer chats (1 h, 3 h, mañana, lunes, una semana o fecha a elección). Un mensaje del cliente reabre solo lo resuelto o pospuesto",
      "Notas internas con @menciones (el mencionado recibe un aviso) y respuestas rápidas que se insertan escribiendo \"/\"",
      "Se ven y escuchan las fotos, audios, videos y documentos que manda el cliente",
      "Nombre del cliente editable, etiquetas con sugerencias, asignación al equipo, modo del bot y solicitudes en la ficha de la derecha",
      "Ctrl+K para buscar cualquier chat o acción; J/K para pasar de chat, E para resolver, I para la ficha. Sonido y aviso del navegador cuando entra un mensaje",
      "Las plantillas se pueden mandar con la ventana cerrada sin depender de los recontactos, y en el historial queda el texto que recibió el cliente",
      "Funciona en el celular: lista o chat a pantalla completa y barra de navegación abajo",
    ],
  },
  {
    version: "0.9.1",
    date: "2026-10-01",
    title: "CRM nuevo, etapa 2: tiempo real",
    items: [
      "La bandeja se actualiza al instante (en ~1 segundo) cuando entra un mensaje, se entrega o se lee, el bot responde o se pausa, o alguien asigna un chat. Antes se refrescaba cada 10 segundos",
      "Si la conexión en vivo se corta, vuelve sola y mientras tanto la bandeja se refresca como antes",
      "Un mensaje que llega con el chat abierto se marca como leído al momento",
      "Base de presencia: el servidor ya sabe quién está mirando o escribiendo en cada chat (se muestra en la bandeja nueva)",
    ],
  },
  {
    version: "0.9.0",
    date: "2026-10-01",
    title: "CRM nuevo, etapa 1: el bot no se pisa con los vendedores",
    items: [
      "Cada chat lo atiende el bot o un vendedor, nunca los dos. Si un vendedor escribe desde el CRM (texto, plantilla, presupuesto o producto), el bot se pausa en ese chat y se cancela lo que tenía en cola",
      "Panel derecho del chat: \"Quién atiende\", con \"Tomar conversación\" y \"Devolver al bot\". El bot vuelve solo con el botón (o con la vuelta automática, si se configura)",
      "El bot espera a que el cliente termine de escribir (10 s por defecto) y responde una sola vez a todo junto, en vez de contestar mensaje por mensaje",
      "Mientras redacta, el cliente ve los tildes azules y \"escribiendo…\", y entre burbuja y burbuja vuelve a aparecer. Las pausas entre burbujas dependen del largo del texto",
      "Si el cliente escribe de nuevo o un vendedor toma el chat mientras el bot redacta, esa respuesta se descarta: nunca sale algo viejo",
      "Los mensajes de los vendedores ya no se bloquean cuando el bot está apagado o el chat fue derivado",
      "La bandeja se ordena por el último mensaje: abrir, asignar o cambiar el modo de un chat ya no lo mueve de lugar",
      "Si la IA falla al responder, queda registrado en el chat en vez de perderse en silencio",
    ],
  },
  {
    version: "0.8.5",
    date: "2026-09-30",
    title: "Simulador: saludo una sola vez",
    items: [
      "Probar el bot: el saludo fijo (\"Hola! Somos The Gamer Shop!\") sale solo en la primera respuesta de la charla de prueba, igual que en un chat real. Antes se repetía en cada mensaje",
      "Si la IA parte una lista en varias burbujas, se reúne en un solo mensaje con su título (\"Las formas de pago son:\" + los renglones)",
    ],
  },
  {
    version: "0.8.4",
    date: "2026-09-30",
    title: "Chatbot: reutiliza solo respuestas vigentes",
    items: [
      "La reutilización de respuestas (para no gastar IA) solo toma respuestas a clientes reales generadas con la configuración actual: después de cambiar la configuración el bot ya no repite respuestas viejas, y las pruebas del simulador no se reutilizan",
      "Una respuesta reutilizada conserva sus burbujas originales",
    ],
  },
  {
    version: "0.8.3",
    date: "2026-09-30",
    title: "Chatbot: burbujas más naturales",
    items: [
      "Si la IA repite el saludo o el cierre fijos, se quitan: el saludo sale una sola vez",
      "Una lista (medios de pago, locales, etc.) sale entera en un mensaje con sus renglones, como la manda el equipo, en vez de aplastarse en una línea",
      "El link de una respuesta configurada (por ejemplo, Google Maps) sale como mensaje aparte",
    ],
  },
  {
    version: "0.8.2",
    date: "2026-09-30",
    title: "Chatbot: palabras clave por palabra completa",
    items: [
      "Las palabras que derivan a una persona y los activadores de las respuestas ahora se comparan por palabra completa y sin importar tildes: \"rma\" ya no se activa con \"información\" ni \"formas\", y \"seña\" no se activa con \"diseñar\"",
    ],
  },
  {
    version: "0.8.1",
    date: "2026-09-30",
    title: "Chatbot: no inventa precios ni stock",
    items: [
      "El bot ya no afirma precios, stock, plazos, cuotas ni promociones que no estén en una respuesta configurada: si le preguntan eso sin datos, deriva a una persona. El ejemplo de formato del prompt tenía un precio y lo inducía a inventar",
    ],
  },
  {
    version: "0.8.0",
    date: "2026-09-30",
    title: "Chatbot: configuración nueva, simulador y burbujas en sugerencias",
    items: [
      "Configuración → Chatbot rediseñada: el estado (encendido y modo Apagado / Solo sugerir / Automático) queda siempre arriba con un resumen de horario, burbujas, respuestas y derivación. Pestañas nuevas: Probar, Cómo habla, Mensajes y burbujas, Qué sabe, Horario, Derivar a una persona y Avanzado",
      "Probar: simulador de chat que muestra qué contestaría el bot, en cuántas burbujas, qué respuesta configurada usó, qué adjuntaría y si derivaría. No manda nada por WhatsApp ni aparece en la bandeja",
      "Mensajes y burbujas: vista previa en vivo de cómo le llega la respuesta al cliente, con las esperas entre burbujas",
      "Qué sabe: respuestas plegables con resumen, buscador, duplicar y pausar. Horario con atajos (Lun a Vie 9–18, copiar el lunes) y resumen legible",
      "Barra fija de guardado con aviso de cambios sin guardar y opción de descartarlos. Los ajustes que solo usaba la extensión de Chrome quedan aparte en Avanzado",
      "Bandeja: al aprobar una sugerencia sale en varias burbujas (igual que en Automático), cada una editable por separado, e incluye los adjuntos de la respuesta configurada (imagen, PDF y seguimiento), que antes se perdían",
      "Bandeja: las respuestas en varias burbujas se ven separadas en el hilo, y los mensajes muestran el PDF o la foto que se adjuntó",
    ],
  },
  {
    version: "0.7.13",
    date: "2026-09-30",
    title: "CRM: buscador de productos",
    items: [
      "Bandeja → Producto: el buscador del catálogo ya no falla con \"Invalid enum value… price-asc\" y vuelve a listar productos para enviar",
    ],
  },
  {
    version: "0.7.12",
    date: "2026-09-30",
    title: "CRM: modo del bot por conversación",
    items: [
      "Bandeja: en el panel derecho se elige el modo del bot solo para ese chat (Modo general, Apagado, Solo sugerir o Automático), como hacía la extensión",
      "Si el chat está escalado aparece \"Reanudar el bot\" para quitar la escalación",
    ],
  },
  {
    version: "0.7.11",
    date: "2026-09-30",
    title: "WhatsApp: Sugerir sin duplicar y bot automático",
    items: [
      "Bandeja: \"Sugerir\" ya no vuelve a agregar el último mensaje del cliente (aparecía duplicado); usa el que llegó por el webhook",
      "Chatbot en modo automático: responde a los mensajes que llegan por la Cloud API. Antes el motor los tomaba como duplicados y no contestaba",
    ],
  },
  {
    version: "0.7.10",
    date: "2026-09-30",
    title: "WhatsApp: solo el número configurado",
    items: [
      "El webhook de WhatsApp procesa únicamente los mensajes y estados del Phone Number ID configurado. Si la app de Meta recibe eventos de otros números de la empresa, se ignoran y no entran a la bandeja ni al chatbot",
    ],
  },
  {
    version: "0.7.9",
    date: "2026-09-29",
    title: "Colecciones, PDF y local del empleado",
    items: [
      "Colecciones: click en la tarjeta abre un preview con los presupuestos asociados, Descargar y Ver más",
      "Presupuestos: filtros con etiquetas, contador, Limpiar, y se recuerdan al recargar la página",
      "PDF: estilo global del documento, presets (TGS rojo, azul, oscuro, etc.), más opciones por bloque, deshacer/rehacer y zoom en el editor",
      "Sidebar: se ve el local del usuario y se puede pasar a modo oscuro (queda guardado)",
      "Empleados: al crear o editar se puede asignar el local",
    ],
  },
  {
    version: "0.7.8",
    date: "2026-09-29",
    title: "Deploys de Railway más cortos",
    items: [
      "Railway: cada servicio instala solo lo que usa (la API ya no buildea la extensión ni el plugin en cada push). Chromium queda cacheado con el lockfile, no se vuelve a bajar por un cambio chico",
      "Worker: el Dockerfile ya no compila @tgs/contracts (el worker no lo usa); ese paso tumbaba el deploy",
    ],
  },
  {
    version: "0.7.7",
    date: "2026-09-29",
    title: "Deploy de la API en Railway",
    items: [
      "API: el ZIP de colecciones no compilaba (un texto partido) y el deploy de Railway fallaba; la web se quedaba colgada esperando a la API",
    ],
  },
  {
    version: "0.7.6",
    date: "2026-09-29",
    title: "Gastos: monto, pagado y mes siguiente en un paso",
    items: [
      "Gastos mensuales: al agregar un gasto ya se puede cargar el monto y marcar si está pago, sin pasos extra. En cada fila el tilde Pagado confirma o da de baja el pago",
      "Se puede registrar un pago del mes siguiente (por ejemplo el 29, como si ya fuera el día 1): botón Mes siguiente, aviso en el mes actual, y tilde en el alta",
    ],
  },
  {
    version: "0.7.5",
    date: "2026-09-23",
    title: "Ver una colección como lista de presupuestos",
    items: [
      "Colecciones: las tarjetas muestran el número y nombre reales (ya no 'undefined'). El botón es Ver: entra a la colección, ves sus presupuestos y podés editar, imprimir, crear uno similar y lo demás igual que en Presupuestos. Editar colección está en esa vista",
    ],
  },
  {
    version: "0.7.4",
    date: "2026-09-23",
    title: "Colecciones: solo los presupuestos asociados",
    items: [
      "Colecciones: cada tarjeta lista los presupuestos que tiene (no todos los del sistema). Al lado de Eliminar hay Editar; adentro se buscan para agregar y se ven solo los asociados, con Quitar",
    ],
  },
  {
    version: "0.7.3",
    date: "2026-09-22",
    title: "Margen fijo al editar el costo",
    items: [
      "Presupuestos: al cambiar el costo de un ítem se mantiene el % de ganancia y se recalcula el precio de venta. El margen solo cambia si lo editás vos, redondeás o usás el ajuste de precio final objetivo",
    ],
  },
  {
    version: "0.7.2",
    date: "2026-09-17",
    title: "Total objetivo libre y totales en vivo",
    items: [
      "Ajustar total: acepta cualquier valor, también por debajo del costo (queda ganancia negativa y márgenes negativos por ítem). Si la ganancia actual es cero, reparte el mismo % a todos. Ya no tira \"El total objetivo no puede ser menor al costo total\"",
      "Márgenes negativos permitidos en los ítems (vender por debajo del costo); el piso es -100 % (venta /usr/bin/bash)",
      "Totales del presupuesto (costo, venta, ganancia y markup efectivo) siempre visibles debajo de la lista de componentes y calculados en vivo con lo que hay en pantalla; antes aparecían arriba y solo después de guardar. La fila del pie dice \"Total de venta\"",
    ],
  },
  {
    version: "0.7.1",
    date: "2026-09-17",
    title: "Crear uno similar",
    items: [
      "Presupuestos: \"Duplicar\" pasa a llamarse \"Crear uno similar\" (nuevo presupuesto con los mismos productos y precios). El botón \"Versiones\" se muestra solo si el presupuesto tiene más de una versión (ahora \"Historial\"), y el panel del editor explica que guardar no crea versiones",
    ],
  },
  {
    version: "0.7.0",
    date: "2026-09-17",
    title: "Versiones con sentido, tienda al día y ganancia general",
    items: [
      "Guardar un borrador ya no crea una versión: se edita en el lugar. Solo editar un presupuesto ya enviado o aceptado crea una versión nueva (la versión es \"qué se le mandó al cliente\", no cuántas veces se apretó guardar). Las fotos y descripciones cargadas a mano en cada componente se conservan al guardar",
      "Publicación web: el estado pasa a \"Publicada · al día\" o \"Publicada · cambios sin publicar\" según el contenido (ítems, totales, título, miniatura) haya cambiado después de la última publicación, no según el número de versión. El botón dice \"Actualizar la tienda\"",
      "Actualización automática de precios desde el catálogo: republica solo los precios y las cuotas sobre la foto de lo último publicado; una edición a medias no se sube hasta que la actualices",
      "Presupuestos: \"Ganancia general\" aplica un % a todos los ítems de una vez; el % de cada línea y el general se eligen de un desplegable (10, 15, 20… 60 %) o se escriben a mano",
    ],
  },
  {
    version: "0.6.2",
    date: "2026-09-17",
    title: "Presupuestos: precios exactos, ajustes que se quedan y numeración correlativa",
    items: [
      "Redondeo y \"Total de venta objetivo\" ahora se mantienen: los precios guardados vuelven exactos al reabrir (antes el editor los recalculaba desde el % de ganancia truncado y 50.000 volvía como 49.998,50 en la siguiente guardada) y, después de ajustar el total o sincronizar precios, ya no se pisa el resultado con el borrador viejo del navegador",
      "\"Error interno\" al guardar (ej. TGS-20260804-0005): el borrador guardado en el navegador traía un cliente que se había borrado; ahora se avisa \"El cliente elegido ya no existe\" y el borrador recuperado no lo manda. El aviso de borrador recuperado es más claro y explica que el nombre/cliente/precios pueden diferir de lo guardado",
      "Número de presupuesto: TGS-fecha-correlativo con correlativo único para todo el sistema (antes arrancaba de 1 cada día y se repetían -0003 en distintas fechas). Sigue desde el mayor existente",
    ],
  },
  {
    version: "0.6.1",
    date: "2026-09-15",
    title: "Miniatura de combos con la plantilla TGS",
    items: [
      "Combos: la miniatura usa la plantilla TGS (logo, fondo, badges) con el título completo en capitalize, una fila por producto incluido, collage con las fotos recortadas de los productos (hasta 4) y etiqueta −X % de descuento; tanto en Preparar y publicar como en Generar del editor (antes salía la plantilla de PC con un gabinete)",
      "El título de los combos se guarda en capitalize (Combo Gamer Esencial: Teclado + Mouse) y no en mayúsculas",
    ],
  },
  {
    version: "0.6.0",
    date: "2026-09-15",
    title: "Potenciá tu setup, combos y publicación más prolija",
    items: [
      "Preparar y publicar: el título y la miniatura se rehacen solos cuando cambian los componentes (antes quedaban con el procesador o el gabinete de la versión anterior); lo que cargaste a mano se respeta siempre",
      "Editor web: selector \"Versión a publicar\" para preparar y subir cualquier versión del presupuesto (por ejemplo, volver a la que está en la tienda si en la nueva se deshabilitó algo); los botones dicen qué versión suben",
      "Miniatura y foto principal: el gabinete es el de la línea Gabinete; si no tiene foto ya no se usa otro componente (avisa para cargarla)",
      "Quitar fondo: el modelo decide también los huecos blancos encerrados; ya no se agujerea el frente blanco de la caja de un procesador",
      "Combos para la tienda: presupuesto con \"Es combo para la tienda\" (Presupuestos → Nuevo), % de descuento inverso (el precio del presupuesto es el final; el tachado sale de precio / (1 − %)) y visible u oculto en la tienda, todo desde Publicación web → pestaña Combos; título, textos y miniatura collage con IA/sistema",
      "Combos por PC: en el editor web de cada PC, \"Combos para esta PC\" elige cuáles se le ofrecen y en qué orden; si la PC está publicada, se re-publica sola",
      "Plugin de WordPress 2.23.4 (hay que subirlo): sección \"Potenciá tu setup\" en la ficha con una pestaña por categoría (monitores, teclados, mouse, auriculares, red, sillas, escritorios, mouse pads y dos libres), un producto por categoría, descuento \"fuego\" de N extras × % calculado en el carrito, guía lateral de secciones (hoja inferior en celular), aviso post-carrito con los combos de esa PC, combos ocultos solo comprables desde ahí",
    ],
  },
  {
    version: "0.5.0",
    date: "2026-09-11",
    title: "Publicación web: un botón que prepara todo",
    items: [
      "\"Preparar y publicar\": busca las fotos que falten, describe los componentes, genera textos con IA, arma la miniatura y publica, mostrando cada paso",
      "La publicación ya no se pierde al crear una versión nueva: la tienda sigue mostrando la que publicaste hasta que la actualices con \"Actualizar a vN\"",
      "Título de la tienda con formato fijo: PC GAMER | procesador - RAM - disco - placa | WINDOWS 11, armado solo desde los componentes; botón para regenerarlo con IA",
      "Bajada, descripción corta, puntos fuertes y para quién es la PC; juegos con resolución y calidad estimadas",
      "Las fotos automáticas tienen que coincidir con el modelo del componente; antes traía cualquier cosa",
      "Un fallo de WordPress al actualizar ya no saca la PC de \"Publicados\"; se reintenta solo cada hora",
      "Borrar un presupuesto lo despublica de la tienda; se arregló el worker que fallaba cada hora con \"SETTINGS_ENC_KEY debe contener 32 bytes\"",
      "Ficha de la tienda rediseñada (diseño Landing Gamer): barra de compra más limpia, juegos como tarjetas con barra de rendimiento, fotos de componentes grandes y hero proporcionado",
      "Quitar fondo híbrido: el recorte por color de siempre (respeta los blancos internos del producto) más un modelo de segmentación local solo en los bordes, que saca la sombra del piso, halos y escalones",
      "Detección del gabinete por puntaje (línea, nombre, marcas; los accesorios como fans o kits restan), y búsqueda de fotos más precisa: Serper en Argentina/español, tipo de componente en la consulta, tiendas y fabricantes con fotos de catálogo primero, y se prefiere la primera foto con fondo liso",
      "Quitar fondo más prolijo: borra también los huecos blancos encerrados (aro del cooler, entre ventiladores) y limpia el filete claro del borde",
      "Ficha: asterisco de condiciones en toda mención a cuotas sin interés (texto editable en la variante), aviso de \"generado con IA\" al pie de cada sección y tipografías Inter + Rajdhani cargadas por el plugin",
      "Ficha en celular: la barra de compra va en dos filas (precio + cuotas arriba, botón a lo ancho abajo) y ya nada desborda la pantalla",
      "Juegos: la IA analiza la lista de la tienda (Fortnite, CS2, Valorant, GTA V, FC 25… 20 títulos), editable en Ajustes → IA",
      "Ficha: visor de fotos al tocar el gabinete o un componente, sección Envíos y retiro con las zonas y costos reales de WooCommerce, y datos estructurados para Google",
      "Plugin de WordPress 2.14.0 (hay que subirlo): migra los productos viejos sin duplicar, no pisa el slug, carga descripción, galería y puntos fuertes",
      "Miniaturas automáticas (Ajustes → Miniaturas): plantilla TGS armada por el sistema (logo, título con procesador o placa de video según el precio, filas de specs con ícono, gabinete y badges), opción de rellenar el gabinete con IA, y modo alternativo de escena generada con IA; botón \"Generar miniatura\" en Publicación Web",
      "Juegos: además de resolución y calidad, la IA estima un rango de FPS por juego (editable en Publicación Web); las PCs ya publicadas se regeneran al volver a preparar",
      "Ficha: sección \"Sumale un monitor\" con los monitores de una categoría de WooCommerce; al elegir uno, \"Agregar al carrito\" suma la PC y el monitor",
      "Plugin: Publicar/Despublicar desde Productos, diseño predeterminado para las PCs nuevas (con opción de aplicarlo a todas) y lista de métodos de envío a ocultar, categoría predeterminada para las PCs nuevas y monitores elegidos a mano para \"Sumale un monitor\"; las tarifas planas que solo aplican a otras clases de envío ya no se muestran",
      "Checklist de WhatsApp: el paso del webhook se marca cuando llega el primer evento real de Meta",
      "Publicación Web ya no tira \"Demasiadas solicitudes\": el listado y el editor piden todo en una sola llamada",
    ],
  },
  {
    version: "0.4.0",
    date: "2026-09-08",
    title: "CRM propio y WhatsApp por API oficial",
    items: [
      "Nuevo CRM en /crm: bandeja de conversaciones, historial, envío y estados reales de entrega",
      "WhatsApp pasa a la API oficial de Meta: se terminan el escaneo del navegador y la extensión",
      "Ahora se ve si el cliente recibió y leyó cada mensaje, algo que antes había que adivinar",
      "Aviso claro de la ventana de 24 h: pasado ese plazo solo se puede escribir con plantillas",
      "Plantillas de WhatsApp con variables, para retomar conversaciones frías",
      "El sistema ahora usa páginas de verdad: cada sección carga solo su código y abre más rápido",
    ],
  },
  {
    version: "0.3.11",
    date: "2026-08-28",
    title: "Calculadora más ordenada para capturar",
    items: [
      "La tarjeta arma una grilla pareja: 4 medios en 2×2, cada uno en su recuadro, sin huecos",
      "Efectivo y lista van en dos bloques claros; las leyendas quedan abajo de cada medio",
    ],
  },
  {
    version: "0.3.10",
    date: "2026-08-28",
    title: "Vercel vuelve a desplegar la web",
    items: [
      "Vercel otra vez dispara en cada push: buildea solo Next.js (`apps/web`), no todo el monorepo",
      "El build de la base genera Prisma antes de TypeScript, para no fallar por InputJsonValue",
    ],
  },
  {
    version: "0.3.9",
    date: "2026-08-28",
    title: "Calculadora compacta para captura",
    items: [
      "La tarjeta de financiación entra en una captura: medios en grilla, no uno abajo del otro",
      "Cada cuota muestra el valor y, abajo en chiquito, el total",
      "Leyendas por medio (días de BBVA sin interés, promos, etc.) editables en el engranaje",
      "Visa, Mastercard y otros bancos van juntos en un solo recuadro, con los dos logos",
      "El interés de cada medio es sobre el efectivo, una sola vez: 13% de $ 10 es $ 11, no $ 13",
    ],
  },
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
