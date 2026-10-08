export type ChangelogEntry = {
  version: string;
  date: string;
  title: string;
  items: string[];
};

/** Historial de novedades de la app. La primera entrada es la versión actual. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.19.3",
    date: "2026-10-08",
    title: "Columnas con IVA en el detallado y cheque a 30 días en el Formal",
    items: [
      "El PDF detallado pasa a las columnas Producto | Cantidad | Precio unitario | IVA | Importe (precio con IVA × cantidad); el precio unitario se muestra sin IVA",
      "El Presupuesto Formal usa las mismas columnas, con el rectángulo de Precio de lista y Efectivo / Transferencia a todo el ancho",
      "El Presupuesto Formal suma debajo el precio de Cheque a 30 días (efectivo/transferencia + 8 %). Aparece solo ahí, no en el simple ni en el detallado",
      "Configuración → Financiación: el recargo del cheque a 30 días y el IVA son editables",
      "Lista de presupuestos: nuevo filtro por tipo (Normal verde, Detallado amarillo, Formal azul) junto a Local, estados como botones y filtros activos como etiquetas que se quitan con un toque; cada presupuesto muestra qué PDFs tiene generados",
      "El IVA ahora es por producto: los ítems de NODO traen la alícuota que informa el distribuidor y el sistema arma una memoria de IVA por categoría (mother, procesador, placa de video…). Al elegir un producto o crear uno propio te sugiere el IVA que corresponde, y lo que elegís a mano también enseña a la memoria",
      "El PDF detallado y el Formal muestran Producto | Cant. | Precio sin IVA | IVA | Precio con IVA | Importe total, cada ítem con su propio IVA",
      "Las colecciones del presupuesto pasan a un bloque con líneas arriba y abajo y etiquetas cuadradas con casilla, para no confundirlas con los distribuidores",
    ],
  },
  {
    version: "0.19.2",
    date: "2026-10-07",
    title: "Presupuesto Formal para empresas",
    items: [
      "Nuevo botón azul \"Presupuesto Formal\" junto a PDF detallado (LITE y sistema completo): PDF de estilo empresarial a nombre de una empresa, con cantidad, precio unitario e importe, y debajo el precio de lista y el efectivo / transferencia. Sin armado, demora, línea de PC armada, cuotas ni textos de la tienda",
      "Si no hay una empresa elegida como cliente, se abre un modal para crearla (razón social, CUIT, condición frente al IVA, domicilio, teléfono, email y contacto); si ya hay una empresa elegida se genera directo",
      "Al crear un cliente se elige si es Consumidor final o Empresa; la empresa suma sus datos fiscales. El CUIT se valida (dígito verificador)",
      "El desplegable de clientes agrupa Empresas y Consumidores finales y se lee bien en tema claro y oscuro",
    ],
  },
  {
    version: "0.19.1",
    date: "2026-10-07",
    title: "Distribuidores conectados entre Configuración y Presupuestos",
    items: [
      "Prender o apagar un distribuidor en los globos del presupuesto y en Configuración → Distribuidores es lo mismo: lo que cambiás en un lado se ve en el otro",
      "Las dos distribuidoras de demostración (Demo Norte y Demo Sur) quedan apagadas por defecto para todos los usuarios; cada uno puede prenderlas si quiere",
      "Los globos de distribuidores se leen bien al pasar el mouse y los colores claros llevan texto oscuro",
    ],
  },
  {
    version: "0.19.0",
    date: "2026-10-07",
    title: "Cada usuario elige sus distribuidores",
    items: [
      "Configuración → Distribuidores ahora es personal: cada usuario (no solo los administradores) elige en cuáles busca. Lo que apaga deja de aparecer solo para esa persona",
    ],
  },
  {
    version: "0.18.9",
    date: "2026-10-07",
    title: "Distribuidores: avisos claros cuando algo falla",
    items: [
      "Si los distribuidores no se pueden cargar, el buscador lo avisa con el motivo en vez de esconder la fila de fuentes",
      "Las claves de NODO se aceptan también con los nombres API_KEY_NODO y API_SECRET_NODO",
      "Configuración → Distribuidores muestra un mensaje claro cuando la cuenta no es de administrador",
    ],
  },
  {
    version: "0.18.8",
    date: "2026-10-07",
    title: "Buscar en distribuidores y en la tienda web",
    items: [
      "Al armar un presupuesto (LITE y sistema completo) hay un selector \"Buscar en\" con Mis productos, Productos web (thegamershop.com.ar) y cada distribuidor de NODO. Se prenden y apagan a gusto y se recuerda la elección",
      "Los distribuidores muestran nombre, stock y costo + IVA en pesos (el dólar se convierte con la cotización de la key de NODO). Cada uno tiene su color",
      "Los productos de la web entran con su precio de venta y el costo en cero para completarlo; los de distribuidores entran con el costo + IVA y margen del 30 %",
      "Todo lo que viene de distribuidores o de la web se agrega al presupuesto en mayúsculas, y en el PDF todos los productos salen siempre en mayúsculas",
      "Funciona también al elegir el producto de cada componente en PC armada",
      "Configuración → Distribuidores: tarjetas con el logo de cada uno y un switch para elegir cuáles aparecen al buscar. Lo que se apaga desaparece para todos los usuarios, en LITE y en el sistema completo",
      "En esa pantalla hay un botón \"Sincronizar ahora\" y se ve cuándo fue la última sincronización de cada distribuidor",
      "Los logos de los distribuidores y de la web se ven en los resultados de la búsqueda",
      "Cada ítem agregado desde un distribuidor o la web lleva una etiqueta con su origen mientras se arma el presupuesto. Es solo para identificarlo: no se guarda ni va al PDF",
    ],
  },
  {
    version: "0.18.7",
    date: "2026-10-07",
    title: "El bot y el CRM pasan a GPT-5.2",
    items: [
      "El modelo de fábrica deja de ser GPT-4o mini (se quedaba corto en la charla de venta) y pasa a GPT-5.2",
      "Si tenías el mini, se actualiza solo. Si ya habías elegido otro modelo, no se toca",
      "Se elige en Configuración → IA, con tarjetas: GPT-5.2 (recomendado), GPT-4o o el mini. El bot puede heredar ese modelo o usar uno propio en Chatbot → Avanzado",
    ],
  },
  {
    version: "0.18.6",
    date: "2026-10-07",
    title: "LITE: más acciones en Colecciones y botones de colores",
    items: [
      "Colecciones (LITE): botón para descargar toda la colección en un .zip con los PDF",
      "Cada presupuesto de la colección se puede renombrar en el lugar, editar (se abre en Presupuestos), duplicar, sacar de la colección (sin borrarlo) o eliminar del sistema",
      "Duplicar crea un presupuesto nuevo fuera de la colección y deja en el nombre \"(copia de colección …)\" para saber de dónde viene",
      "Todos los botones de Colecciones tienen su color: editar azul, renombrar celeste, PDF verde, detallado ámbar, duplicar violeta, sacar naranja, eliminar rojo, descargar índigo",
    ],
  },
  {
    version: "0.18.5",
    date: "2026-10-05",
    title: "El bot no ofrece cosas fuera del presupuesto y se corrige antes de mandar",
    items: [
      "Si el cliente tiene un presupuesto (el que dijo o el del anuncio por el que escribió), el bot solo ve las PCs publicadas que le entran. Si no hay ninguna, pide el presupuesto a medida en vez de ofrecer algo más caro",
      "Cada respuesta se revisa antes de salir: si usa una frase prohibida o menciona un precio por encima del presupuesto (sin que el cliente haya pedido algo mejor), se vuelve a redactar corrigiendo eso",
    ],
  },
  {
    version: "0.18.4",
    date: "2026-10-05",
    title: "Fede habla menos formal",
    items: [
      "El bot imita ejemplos reales de cómo hablamos (\"Jaja ojala pudiera! Pero te armo algo que te quede comodo de precio\"). Se editan en Configuración → Chatbot → Reglas de venta → Ejemplos de cómo habla",
      "Muletillas formales prohibidas: entiendo que, sin embargo, te gustaria que, puedo ayudarte a, no dudes en, con gusto, por supuesto",
      "Las respuestas del chat se redactan con más naturalidad (antes la IA tenía el mismo ajuste rígido que usa para extraer datos)",
    ],
  },
  {
    version: "0.18.3",
    date: "2026-10-05",
    title: "Los avisos de presupuestos llegan a los números entrenadores",
    items: [
      "Cada solicitud nueva que pide el bot avisa por WhatsApp a los mismos números que entrenan al bot. Se cambia en Configuración → Chatbot → Presupuestos y avisos",
    ],
  },
  {
    version: "0.18.2",
    date: "2026-10-05",
    title: "El bot ahora es Fede: reglas nuevas armadas con las charlas reales",
    items: [
      "Personalidad nueva: Fede, del local de Liniers. Amigable, tutea siempre, explica simple y es honesto con lo que conviene",
      "Reglas de venta nuevas: primero muestra lo del anuncio y después pregunta, una pregunta por mensaje, dos opciones con precio, siempre cierra con una pregunta concreta, periféricos recién después de elegir la PC, responde las objeciones de precio e invita al local",
      "Lo que sabe, actualizado: local y horario de Liniers, envíos (pide código postal y localidad), seña y plazos, formas de pago y BBVA, garantía, Windows, que no instalamos programas, usados, sponsoreos y cupón de la silla. Las respuestas anteriores quedan apagadas, no borradas",
      "Palabras prohibidas (querido, papa, posta…), editables en Reglas de venta. Si se le escapa una como apodo, se saca sola antes de enviar",
      "Pasa a una persona para los datos de pago de la seña, la licencia de Windows, cotizar un envío, usados y reclamos. Ignora las respuestas automáticas de otros negocios",
    ],
  },
  {
    version: "0.18.1",
    date: "2026-10-05",
    title: "El presupuesto del cliente se guarda bien",
    items: [
      "Cuando el cliente decía su presupuesto (\"1.5M\", \"un millon y medio\"), a veces quedaba guardado cien veces más chico ($15.000). Ahora la IA lo informa en pesos y el sistema lo convierte",
      "Se corrigieron las fichas y solicitudes que ya habían quedado mal",
    ],
  },
  {
    version: "0.18.0",
    date: "2026-10-05",
    title: "LITE: financiación a la vista, productos del cliente y nueva cara",
    items: [
      "El creador LITE muestra a la izquierda cómo queda financiado lo que se carga: un bloque por plan con el logo del banco, la cuota, el recargo o «Sin interés» y el total. Se calcula como el PDF (precio de lista + interés del plan). Tiene un campo para probar un monto a mano y un engranaje que lleva a Configuración → Financiación",
      "Productos entregados por el cliente: se cargan en un modal con su valor y una casilla para mostrar o no a cuánto se toman. Se restan del total y de las cuotas, se guardan en la versión del presupuesto y el PDF los muestra bajo Efectivo / Transferencia junto al «Precio final con entrega de productos del cliente»",
      "Barra fija del total con costo y ganancia, y un botón para modificar a mano el total de la venta (los precios se ajustan en proporción). Con PC armada el buscador de productos queda deshabilitado",
      "Más rápido: productos recientes, duplicar y deshacer ítems, borrador que se recupera al recargar, atajos (/ para buscar, Enter vuelve al buscador, Ctrl+Enter crea el PDF) y aviso si se vende por debajo del costo",
      "Editor de PDF: se pueden reescribir los rótulos de plantilla (título, encabezados de la tabla, rótulos de totales y de observación)",
      "El PDF se ajusta solo a una hoja cuando se pasa a la segunda por poco",
      "Rediseño minimalista de LITE (claro y oscuro), logo LITE y etiqueta con el local de la sesión en la barra. Requiere la migración que agrega QuoteVersion.tradeIns",
    ],
  },
  {
    version: "0.17.9",
    date: "2026-10-04",
    title: "El bot no da vueltas: si piden el presupuesto, lo pide al equipo",
    items: [
      "Si el cliente dice que se lo manden o que le sumen algo, se crea la solicitud en ese turno. Las frases se editan en Presupuestos y avisos; no volver a preguntar lo mismo está en Reglas de venta y el guion por etapa",
      "Ya no recomienda de memoria un monitor o una PC que no esté en el catálogo, un anuncio o Qué sabe. Las reglas de anuncio dejaron de estar fijas en el código: se ven y se editan en el mismo lugar",
    ],
  },
  {
    version: "0.17.8",
    date: "2026-10-04",
    title: "El bot manda los mensajes y cada anuncio tiene su ficha",
    items: [
      "En Solo sugerir el cliente ya no ve que el bot escribe: esa respuesta no sale hasta que la aprueben. Para que WhatsApp reciba los mensajes, el modo tiene que ser Automático",
      "En Configuración → Chatbot → Anuncios se carga el precio, la información y el presupuesto de cada aviso. El bot lo usa cuando el chat viene de ese anuncio, y en Probar se puede simular",
    ],
  },
  {
    version: "0.17.7",
    date: "2026-10-04",
    title: "La API vuelve a compilar",
    items: [
      "El deploy de Probar el bot no armaba la imagen: el tipo de la respuesta pedía un campo que WhatsApp no manda. Ya compila",
    ],
  },
  {
    version: "0.17.6",
    date: "2026-10-04",
    title: "Probar el bot es una charla de cliente, y se puede editar cómo presenta productos y presupuestos",
    items: [
      "Probar guarda la memoria y la etapa de esa charla, respeta horario y derivación, y no manda nada por WhatsApp. Si el bot está apagado o el local cerrado, se puede pedir ver la respuesta igual",
      "El texto de la foto de un producto y la instrucción del PDF del presupuesto se editan en Configuración → Chatbot. Las reglas de venta ya eran editables; lo estricto de cada respuesta de Qué sabe es el porcentaje de coincidencia",
    ],
  },
  {
    version: "0.17.5",
    date: "2026-10-04",
    title: "Se puede volver a cambiar el horario del bot",
    items: [
      "Al guardar Configuración → Chatbot (horario u otra cosa) salía \"Unrecognized key(s) in object: 'followups'\": el seguimiento de presupuestos se había colado en ese formulario. Ya se guarda el horario; los seguimientos siguen en el CRM",
    ],
  },
  {
    version: "0.17.4",
    date: "2026-10-04",
    title: "La API vuelve a arrancar",
    items: [
      "La migración del sueldo duplicado seguía fallando (Postgres no acepta ese índice) y no se podía entrar. Ya arranca; los sueldos de más de este mes se cancelan igual",
    ],
  },
  {
    version: "0.17.3",
    date: "2026-10-04",
    title: "La API vuelve a arrancar",
    items: [
      "El arreglo del sueldo duplicado dejó una migración que Postgres rechazaba (un índice con zona horaria) y la API no levantaba. Ya arranca; el neto de este mes sigue sin duplicarse",
    ],
  },
  {
    version: "0.17.2",
    date: "2026-10-04",
    title: "Empleados: el sueldo de este mes ya no se duplica",
    items: [
      "Al abrir Empleados el listado y el resumen pedían el sueldo del mes al mismo tiempo y se cargaba dos veces: el neto a pagar salía al doble en todos. Queda un solo sueldo por empleado por mes; los duplicados de este mes se cancelan",
    ],
  },
  {
    version: "0.17.1",
    date: "2026-10-02",
    title: "Al entrar se abre el sistema completo, no LITE",
    items: [
      "Entrar a la app abre el dashboard de siempre. LITE queda si lo elegís con el interruptor de la barra; ya no arranca solo porque la última vez lo usaste",
    ],
  },
  {
    version: "0.17.0",
    date: "2026-10-02",
    title: "El bot agarra al cliente en caliente: pide el presupuesto al equipo y lo manda solo",
    items: [
      "Si lo que busca el cliente no está en el catálogo ni en las PCs publicadas, el bot no sigue preguntando: con el uso y el presupuesto le promete opciones a medida y crea la solicitud en Solicitudes",
      "Promete según la cola del equipo: con 0 o 1 pendientes \"ya te lo mando\", con 2 a 4 \"ahora te lo armo\", con 5 o más \"en un ratito\". Si ya tiene una solicitud en curso, no le vuelve a pedir los datos",
      "Aviso al equipo en la campana del CRM y por WhatsApp desde el número del bot a los vendedores que configures (Configuración → Chatbot → Presupuestos y avisos)",
      "Apenas el vendedor guarda el presupuesto de la solicitud, el bot se lo manda al cliente con el PDF y un mensaje cálido. Si el chat lo tomó un vendedor o pasaron 24 h, avisa para mandarlo a mano",
      "Un chat cuyo último mensaje fue nuestro (del bot o de un vendedor) ya no figura como no leído",
    ],
  },
  {
    version: "0.16.1",
    date: "2026-10-02",
    title: "Arreglos: \"Demasiadas solicitudes\" y el bot que no contestaba un \"Hola\"",
    items: [
      "Con un chat abierto el CRM se recargaba solo unas 40 veces por minuto (marcar como leído contaba como novedad y volvía a recargar): ya no",
      "El límite de pedidos ahora es por usuario y no compartido por toda la empresa, así que nadie se queda sin servicio por lo que hace otro",
      "Un \"Hola\" del cliente se confundía con el mensaje automático de bienvenida de WhatsApp y el bot no lo contestaba",
    ],
  },
  {
    version: "0.16.0",
    date: "2026-10-02",
    title: "Todas las reglas del bot se pueden editar",
    items: [
      "Configuración → Chatbot → Reglas de venta: las reglas de estilo y de venta que el bot cumple en cada respuesta, una por una, para editar, reordenar, quitar o agregar. Botón para volver a las de fábrica",
      "Guion por etapa de la venta (nuevo, calificando, presupuesto, negociación, seña, ganado, perdido), también editable",
      "Interruptores de cómo escribe: sin tildes, sin ¿ ¡, sin punto final y sin formato de documento. Se aplican también al mensaje del PDF del presupuesto y al de recontacto",
      "Las pantallas del CRM y la configuración del bot usan todo el ancho de la ventana (antes se cortaban antes del borde)",
    ],
  },
  {
    version: "0.15.5",
    date: "2026-10-01",
    title: "El bot ofrece PCs con más calidez",
    items: [
      "Cuando recomienda PCs, primero muestra que entendió lo que busca, después cuenta cada opción como un vendedor (\"una con Ryzen 5 5500 y una 1660 Super, sale...\") y cierra con una pregunta para ayudarlo a elegir",
      "Nunca más negritas, títulos en mayúsculas de la tienda, listas tipo documento ni links con corchetes: el link va pegado solo, en su propia burbuja",
    ],
  },
  {
    version: "0.15.4",
    date: "2026-10-01",
    title: "Sin punto final en los mensajes del bot",
    items: [
      "Los mensajes del bot no terminan en punto (\"Dale, te lo armo\"). Los puntos entre oraciones y los puntos suspensivos se mantienen",
    ],
  },
  {
    version: "0.15.3",
    date: "2026-10-01",
    title: "El bot escribe como en el celular",
    items: [
      "Las respuestas del bot salen sin tildes y sin signos de apertura (¿ ¡), como escribe una persona por WhatsApp: \"Que juegos usas?\". La ñ y los links se respetan. Los mensajes de los vendedores no se tocan",
    ],
  },
  {
    version: "0.15.2",
    date: "2026-10-01",
    title: "Chats que el bot atiende a cualquier hora",
    items: [
      "En el panel del chat, en \"Bot en este chat\": casilla \"Responde siempre (ignora el horario)\". Ese chat se atiende aunque el local esté cerrado; el resto sigue la configuración de horario",
      "Activado para el número de prueba 11 4085-9342",
    ],
  },
  {
    version: "0.15.1",
    date: "2026-10-01",
    title: "Registro de por qué el bot no contesta",
    items: [
      "Cuando el bot decide no responder (chat derivado a una persona, tomado por un vendedor, fuera de horario, bot apagado o modo sugerencia) queda registrado el motivo, para diagnosticar al instante",
    ],
  },
  {
    version: "0.15.0",
    date: "2026-10-01",
    title: "CRM nuevo, etapa 7: temperatura de la venta, embudo guiado y reportes",
    items: [
      "Cada chat tiene temperatura (🔥 caliente, 🌡 tibio, ❄ frío, de 0 a 100) e intención del cliente (precio, armar PC, formas de pago, listo para comprar, reclamo…), que el bot actualiza en cada mensaje",
      "Nueva vista 🔥 Calientes en la bandeja: los que están por comprar, para atenderlos primero. La temperatura también se ve en la lista, en el encabezado del chat y en las tarjetas del embudo",
      "El bot sigue un guion de venta según la etapa (nuevo → calificando → presupuesto → negociación) y propone el próximo paso, que aparece en la ficha del cliente. Avanza la etapa solo hacia adelante y nunca marca ganado ni perdido por su cuenta",
      "Pantalla Reportes: quién espera respuesta ahora, tiempo de primera respuesta del bot y de las personas, embudo con conversión entre etapas, qué piden los clientes, por qué se pierden ventas, rendimiento por vendedor, por anuncio y del bot",
      "El simulador muestra la temperatura, la intención y el próximo paso que detectaría",
    ],
  },
  {
    version: "0.14.0",
    date: "2026-10-01",
    title: "CRM nuevo, etapa 6: seguimientos automáticos",
    items: [
      "Pantalla Seguimientos: si se mandó un presupuesto y el cliente no contesta, se le escribe solo a las horas configuradas (de fábrica: 2 h, 23 h y 48 h, con textos editables y {nombre})",
      "Se corta en cuanto el cliente responde, y el reloj vuelve a cero si un vendedor escribe. Con la ventana de 24 h cerrada solo sale si el paso tiene una plantilla aprobada; si no, se saltea",
      "Lista de próximos seguimientos para ver qué va a salir antes de activarlo. Arranca apagado",
      "En el chat, los seguimientos y los mensajes al entrenador se ven marcados como tales",
    ],
  },
  {
    version: "0.13.0",
    date: "2026-10-01",
    title: "El bot responde con datos reales del sistema",
    items: [
      "Antes de cada respuesta el bot consulta el catálogo: si preguntan por un producto (\"¿tienen la 4060?\", \"¿cuánto sale el Ryzen 5 5600?\") ve el precio vigente de contado y si figura con stock",
      "Cuando alguien busca una PC, el bot ve las PCs publicadas en la tienda más cercanas a su presupuesto, con precio, cuotas, juegos que corre y link, y puede recomendar una o dos",
      "Si el chat ya tiene un presupuesto, el bot sabe qué trae, el total y cuánto queda en cuotas",
      "El stock exacto para reservar o cobrar lo sigue confirmando una persona",
    ],
  },
  {
    version: "0.12.1",
    date: "2026-10-01",
    title: "El bot entiende audios y fotos",
    items: [
      "Los audios de los clientes se transcriben y el bot los responde como cualquier mensaje (antes todo audio derivaba a una persona). En el chat se ve el audio y su transcripción",
      "Las fotos que mandan (una PC, una captura con specs o precios, un comprobante) se describen para que el bot y el vendedor sepan de qué habla el cliente",
      "Configuración → Chatbot → Derivar a una persona: interruptores para transcribir audios y describir fotos, cuántos segundos espera a que el cliente termine de escribir y si un chat tomado vuelve solo al bot después de X horas",
    ],
  },
  {
    version: "0.12.0",
    date: "2026-10-01",
    title: "CRM nuevo, etapa 5: embudo de ventas y ficha del cliente",
    items: [
      "Cada chat es un lead con etapa: Nuevo, Calificando, Presupuesto enviado, Negociación, Seña/Pago, Ganado o Perdido (con motivo)",
      "Pantalla Embudo: columnas por etapa con cantidad y monto, tarjetas que se arrastran para cambiar de etapa, filtro \"solo mías\" y tus tareas pendientes",
      "El lead guarda de qué anuncio vino y toma como valor el precio del anuncio (\"PC Completa por $650.000\") o, si no hay, el presupuesto que mencionó el cliente; al mandar un presupuesto toma su total",
      "La etapa avanza sola: a \"Calificando\" cuando el bot ya sabe el uso y el presupuesto, y a \"Presupuesto enviado\" cuando sale un presupuesto",
      "Ficha del cliente que el bot completa sola con la charla: uso, juegos o programas, presupuesto, ciudad, cómo quiere pagar y si es envío o retiro. Se puede corregir a mano",
      "Tareas por chat con vencimiento (\"avisarle cuando llegue la 5070\"); al vencer avisan en la campana",
    ],
  },
  {
    version: "0.11.0",
    date: "2026-10-01",
    title: "CRM nuevo, etapa 4: entrenamiento del bot",
    items: [
      "Número entrenador (arranca con el 11 4870-4101): cuando le escribe al WhatsApp del bot, no lo atiende como cliente. Se le pueden enseñar datos (\"el envío a CABA sale $15.000\") y reglas (\"si preguntan por notebooks, derivá\"), probarlo como cliente (\"probá: ¿hacen envíos a Córdoba?\") o preguntarle qué sabe",
      "Todo lo que aprende queda como propuesta: se aplica recién cuando respondés \"Sí\" por WhatsApp o lo aprobás en el CRM. \"No\" lo descarta",
      "Cuando un cliente pregunta algo que el bot no sabe, lo anota (agrupando las preguntas parecidas) y le consulta al entrenador por WhatsApp, sin insistir más de una vez cada 2 horas",
      "Si un vendedor corrige mucho una sugerencia del bot antes de mandarla, se propone como algo para aprender",
      "Pantalla Entrenamiento en el CRM: propuestas para aprobar (editables), preguntas sin responder con su respuesta, indicaciones vigentes, simulador, números entrenadores e historial",
      "El bot ahora conoce toda la información cargada a la vez (antes solo la respuesta más parecida al mensaje) y sigue las indicaciones aprobadas por encima del resto: si le preguntan dos cosas, responde las dos",
      "Bandeja: el chat del entrenador se marca como tal; la vista activa se lee bien en modo oscuro",
    ],
  },
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
