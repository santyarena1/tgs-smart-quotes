# TGS Smart Quotes

Sistema interno de solicitudes y presupuestos de The Gamer Shop. Monorepo pnpm/Turborepo con Next.js, NestJS, worker, extension Chrome MV3, PostgreSQL/Prisma y PDFs historicos.

## Inicio

1. Copiar `.env.example` a `.env` y cambiar secretos.
2. Ejecutar `docker compose up -d`.
3. Ejecutar `pnpm install`, `pnpm db:generate`, `pnpm db:migrate` y `pnpm db:seed`.
4. Ejecutar `pnpm dev`.

Usuario inicial: `ADMIN_USERNAME`; la clave es `ADMIN_PASSWORD`. No hay registro publico.

Validacion: `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm extension:zip`.

Produccion: Railway (web, API y worker). En local, `docker compose -f docker-compose.prod.yml up -d --build`. Vercel no se usa: el Next.js está en `apps/web` y los deploys automáticos de Vercel están desactivados.




Actuá como arquitecto principal, desarrollador full stack senior, especialista en bases de datos, UX, extensiones Chrome, generación de PDF, pruebas y despliegue.

Tenés que construir desde cero un sistema interno completo de gestión inteligente de solicitudes y presupuestos para The Gamer Shop.

No debés modernizar, copiar ni reutilizar la arquitectura del prototipo anterior realizado con Google Sheets y Apps Script. Ese prototipo solamente sirvió para explicar de forma vaga la lógica comercial inicial.

El resultado debe ser un producto nuevo, profesional, mantenible, rápido, seguro, documentado y directamente desplegable.

==================================================
1. REGLAS DE EJECUCIÓN INNEGOCIABLES
==================================================

1. Implementá todo el proyecto en una única ejecución integral.

2. No dividas el sistema en fases, MVP, versiones futuras ni roadmap.

3. No declares el trabajo terminado mientras haya:
   - módulos incompletos;
   - pantallas simuladas;
   - botones sin lógica;
   - endpoints falsos;
   - datos hardcodeados que deberían ser configurables;
   - placeholders funcionales;
   - TODO pendientes;
   - tests fallando;
   - errores de TypeScript;
   - migraciones pendientes;
   - builds fallando;
   - funcionalidades descritas en este documento sin implementar.

4. Podés organizar internamente el trabajo mediante una lista de tareas, pero no debés recortar el alcance ni postergar módulos.

5. No inventes funciones comerciales que no estén descriptas en este documento.

6. Cuando una decisión técnica menor no esté definida:
   - elegí la solución más simple y mantenible;
   - documentá la decisión;
   - no agregues nuevas reglas comerciales;
   - no detengas el desarrollo salvo que exista un bloqueo real imposible de resolver.

7. No uses inteligencia artificial donde una regla determinística sea suficiente.

8. Cuando sí se use inteligencia artificial:
   - debe ser una acción explícita o un proceso claramente definido;
   - debe guardar el resultado para no repetir llamadas innecesarias;
   - no debe bloquear las funciones principales si la API no está configurada;
   - no debe modificar precios, estados definitivos ni presupuestos sin confirmación;
   - debe devolver estructuras validadas, no texto arbitrario cuando el sistema necesite datos.

9. Todo el sistema debe usar:
   - idioma español;
   - moneda pesos argentinos;
   - zona horaria America/Argentina/Buenos_Aires;
   - formatos numéricos y de fecha apropiados para Argentina.

10. No uses números de punto flotante para dinero.
    Guardá importes en centavos enteros o un tipo decimal seguro.

==================================================
2. GRAPHIFY DESDE EL COMIENZO
==================================================

Graphify debe formar parte del repositorio desde el momento inicial.

Procedimiento obligatorio:

1. Creá únicamente el scaffold mínimo inicial del monorepo.

2. Verificá que exista Python 3.10 o superior y uv.

3. Instalá Graphify usando el paquete oficial:

   uv tool install graphifyy

4. Instalalo dentro del proyecto y configurá el modo estricto para Claude Code:

   graphify install --project --strict

5. Instalá los hooks de Git:

   graphify hook install

6. En cuanto exista el scaffold mínimo, ejecutá desde Claude Code:

   /graphify .

7. Verificá que se generen:

   graphify-out/graph.html
   graphify-out/GRAPH_REPORT.md
   graphify-out/graph.json

8. Configurá el MCP local de Graphify en .mcp.json para que Claude Code pueda consultar graphify-out/graph.json.

9. Antes de leer grandes cantidades de archivos directamente, consultá el grafo.

10. Después de cada cambio estructural importante ejecutá:

   /graphify . --update

11. Al terminar toda la implementación ejecutá:

   /graphify . --mode deep

12. Usá el reporte final para detectar:
   - módulos huérfanos;
   - dependencias circulares;
   - duplicación;
   - acoplamientos incorrectos;
   - endpoints desconectados;
   - modelos sin uso;
   - flujos incompletos.

13. Graphify no debe quedar solamente instalado. Debe estar generado, actualizado, documentado y utilizable.

==================================================
3. ARQUITECTURA DEL MONOREPO
==================================================

Usá:

- pnpm workspaces;
- Turborepo;
- TypeScript estricto;
- Next.js para la aplicación web;
- NestJS para la API;
- un proceso worker independiente para automatizaciones y tareas;
- PostgreSQL;
- Prisma ORM;
- React para la extensión Chrome;
- Manifest V3;
- validación compartida de contratos;
- Docker;
- almacenamiento S3-compatible para PDFs históricos;
- almacenamiento local compatible para desarrollo;
- Vitest o Jest para pruebas unitarias e integración;
- Playwright para pruebas end-to-end y generación de PDF;
- ESLint y Prettier;
- OpenAPI para documentar la API.

Estructura mínima:

apps/
  web/
  api/
  worker/
  extension/

packages/
  database/
  contracts/
  validation/
  ui/
  config/
  pricing/
  pdf/
  ai/
  testing/
  eslint-config/
  typescript-config/

infrastructure/
  docker/
  scripts/

docs/
graphify-out/

La API debe ser consumida tanto por la aplicación web como por la extensión.

No dupliques tipos entre frontend, backend y extensión. Usá contratos compartidos y validación común.

==================================================
4. DESPLIEGUE
==================================================

El monorepo debe quedar desplegable directamente.

Entregar:

- Dockerfile de producción para web;
- Dockerfile de producción para API;
- Dockerfile de producción para worker;
- docker-compose.yml para desarrollo;
- docker-compose.prod.yml para producción;
- PostgreSQL;
- almacenamiento S3-compatible o MinIO en desarrollo;
- health checks;
- migraciones;
- seed inicial;
- volúmenes persistentes;
- variables de entorno;
- .env.example completo;
- logs estructurados;
- manejo centralizado de errores;
- documentación de despliegue;
- script de backup de PostgreSQL;
- script de restauración;
- compilación de la extensión en ZIP;
- configuración de URL de API para cada entorno;
- pipeline CI que ejecute lint, typecheck, tests y build.

No dependas obligatoriamente de Vercel, Railway, Render, AWS ni otro proveedor particular.

==================================================
5. AUTENTICACIÓN
==================================================

El sistema es interno pero estará desplegado en internet.

Implementar:

- login con nombre de usuario y contraseña;
- sin email;
- sin registro público;
- todos los usuarios con los mismos permisos;
- sin sistema complejo de roles;
- usuario administrador inicial creado por seed o variables de entorno;
- contraseñas cifradas con un algoritmo seguro;
- cookies HttpOnly y sesiones seguras;
- cierre de sesión;
- expiración y renovación de sesión;
- protección contra fuerza bruta;
- auditoría del usuario responsable de cada acción.

Campos mínimos de usuario:

- id;
- username;
- passwordHash;
- displayName opcional;
- activo;
- fecha de creación;
- último acceso.

==================================================
6. PRODUCTOS
==================================================

La gestión de productos debe ser simple.

Cada producto tendrá:

- id;
- nombre;
- costo maestro actual;
- precio de venta maestro;
- markup o porcentaje aplicado sobre costo;
- indicador de si usa el markup general o uno individual;
- línea predeterminada opcional;
- activo o inactivo;
- fecha de creación;
- fecha de última actualización;
- usuario que realizó la última actualización.

No implementar:

- stock;
- proveedores;
- monedas extranjeras;
- atributos técnicos completos;
- SKU complejos;
- variantes;
- inventario;
- sincronizaciones externas de productos.

El costo y todos los precios se gestionan en pesos argentinos.

Debe existir una configuración de markup general, inicialmente 30%.

Reglas:

1. Si cambia el costo maestro:
   - conservar el markup efectivo;
   - recalcular el precio de venta.

2. Si cambia el markup:
   - conservar el costo;
   - recalcular el precio de venta.

3. Si cambia directamente el precio de venta:
   - conservar el costo;
   - recalcular el markup.

4. Si cambia el markup general:
   - actualizar los productos que heredan el markup general;
   - no modificar productos con markup individual;
   - no modificar presupuestos ya creados.

5. Guardar historial de modificaciones del producto.

==================================================
7. DETECCIÓN DE PRODUCTOS PARECIDOS
==================================================

Al crear o importar un producto, buscar productos similares antes de confirmar.

Debe existir en configuración un porcentaje mínimo de similitud.

La comparación debe combinar, sin usar IA innecesariamente:

- nombre normalizado;
- eliminación de tildes;
- mayúsculas y minúsculas;
- espacios repetidos;
- signos;
- similitud trigram;
- coincidencia de palabras;
- números y modelos presentes en el nombre.

Cuando haya coincidencias superiores al umbral, mostrar:

- porcentaje de similitud;
- nombre del producto existente;
- costo;
- última modificación.

Acciones:

- usar el existente;
- editar el existente;
- crear el nuevo igualmente;
- marcar que no son duplicados.

La IA puede utilizarse solamente para casos ambiguos cercanos al umbral y debe poder deshabilitarse.

==================================================
8. IMPORTACIÓN INICIAL
==================================================

Crear una herramienta para importar los productos existentes desde el contenido copiado de Google Sheets.

No integrar directamente con Google Sheets en esta implementación.

Permitir:

- pegar filas copiadas;
- pegar CSV;
- reconocer columnas nombre y costo;
- previsualizar;
- validar importes;
- detectar filas inválidas;
- detectar duplicados;
- resolver duplicados antes de confirmar;
- importar masivamente;
- aplicar el markup general;
- mostrar un resumen final.

Importar únicamente:

- nombre;
- costo.

No importar stock, proveedores, fórmulas ni atributos.

==================================================
9. LÍNEAS CONFIGURABLES DE UNA PC
==================================================

Desde configuración se deben crear y ordenar las líneas utilizadas para una PC armada.

Ejemplo inicial editable:

1. Procesador
2. Motherboard
3. Memoria RAM
4. Placa de video
5. Disco SSD
6. Disco HDD
7. Fuente de poder
8. Gab HDD
7. Fuente de poder
8. Gabinete
9. Refrigeración
10. Otros

Cada línea tendrá:

- id;
- nombre;
- orden;
- activa o inactiva;
- aliases opcionales para reconocimiento;
- indicador de línea clave para similitud;
- tipo conceptual opcional: CPU, MOTHERBOARD, GPU u OTHER.

Los productos pueden tener una línea predeterminada, pero debe poder cambiarse dentro de un presupuesto.

Esta clasificación simple se utilizará para:

- ordenar componentes;
- identificar procesador;
- identificar motherboard;
- identificar GPU;
- analizar presupuestos similares;
- generar feedback orientativo de IA;
- elaborar el PDF de PC armada.

No crear un sistema de atributos técnicos adicionales.

==================================================
10. CLIENTES
==================================================

Un presupuesto puede existir sin cliente.

Los clientes son mínimos.

Campos:

- id;
- nombre;
- número de teléfono opcional;
- número normalizado para búsquedas;
- DNI opcional;
- fecha de creación;
- fecha de actualización.

El nombre es obligatorio al crear un cliente.

El teléfono:

- puede cargarse manualmente;
- puede detectarse desde WhatsApp;
- debe conservar una versión normalizada y una versión visible.

Detectar posibles clientes duplicados por:

- mismo número;
- nombre parecido;
- mismo DNI.

No crear un CRM complejo.

No agregar email, empresa, domicilio ni campos no solicitados.

==================================================
11. SOLICITUDES DE PRESUPUESTO
==================================================

Una solicitud es una entidad independiente de un presupuesto.

Puede crearse:

- desde el sistema web;
- desde la extensión en WhatsApp.

Debe poder existir con o sin cliente, aunque desde WhatsApp se intentará crear o vincular el cliente.

Campos:

- id;
- título o referencia interna;
- texto original de la solicitud;
- notas internas;
- cliente opcional;
- teléfono detectado opcional;
- presupuesto máximo opcional;
- uso esperado opcional;
- componentes obligatorios opcionales;
- usuario creador;
- usuario encargado opcional;
- estado;
- fecha de creación;
- fecha de actualización;
- presupuestos relacionados.

Estados:

- PENDIENTE;
- EN_PREPARACION;
- LISTA;
- ENVIADA;
- CERRADA.

Cambios automáticos:

- al crear: PENDIENTE;
- al comenzar o asignar: EN_PREPARACION;
- al asociar un presupuesto terminado: LISTA;
- al registrar el envío: ENVIADA;
- al aceptar, rechazar o cerrar la gestión: CERRADA.

Todos los estados deben poder corregirse manualmente.

Al quedar LISTA:

- generar una notificación en el sistema;
- mostrar la notificación en la extensión para el chat relacionado;
- mostrar el presupuesto asociado;
- permitir preparar un mensaje;
- no enviar automáticamente.

==================================================
12. IA PARA INTERPRETAR SOLICITUDES
==================================================

Agregar un botón explícito para analizar una solicitud.

La IA debe extraer mediante respuesta JSON validada:

- tipo de uso;
- juegos o programas mencionados;
- presupuesto máximo;
- componente requerido;
- preferencias expresadas;
- nivel técnico aparente si puede inferirse;
- resumen breve;
- datos faltantes;
- términos importantes para buscar solicitudes similares.

Guardar:

- texto original;
- resultado estructurado;
- modelo utilizado;
- fecha;
- hash del texto;
- costo o uso estimado;
- errores.

No volver a analizar si el texto no cambió, salvo que el usuario pulse regenerar.

La IA no debe generar automáticamente el presupuesto.

==================================================
13. PRESUPUESTOS
==================================================

Un presupuesto debe poder crearse:

- desde cero;
- clonando otro;
- desde una solicitud;
- basándose manualmente en un presupuesto similar;
- desde una colección.

Campos generales:

- id interno;
- número visible único;
- nombre interno obligatorio;
- toggle Es PC armada;
- solicitud opcional;
- cliente opcional;
- notas internas;
- observación pública opcional;
- estado;
- familia de versiones;
- versión actual;
- usuario creador;
- fechas;
- total costo;
- total venta;
- ganancia;
- markup global efectivo;
- configuración congelada del PDF;
- productos;
- PDFs generados.

No debe tener fecha de vencimiento.

No mostrar “válido hasta” en ninguna parte.

Estados:

- BORRADOR;
- ENVIADO;
- ACEPTADO;
- RECHAZADO;
- REEMPLAZADO;
- NO_CONCRETADO.

Todos los estados pueden establecerse manualmente.

==================================================
14. VERSIONADO
==================================================

Toda modificación posterior a un envío debe crear una nueva versión.

Antes del primer envío, el borrador puede editarse directamente.

Modelo:

Presupuesto TGS-1193
- V1
- V2
- V3

Cada versión debe guardar una fotografía completa e inmutable de:

- productos;
- nombres;
- cantidades;
- costos;
- markups;
- precios de venta;
- líneas;
- totales;
- campos visibles;
- financiación;
- notas;
- configuración;
- PDF;
- mensaje enviado;
- fecha;
- usuario;
- motivo del cambio.

Reglas:

1. La última versión enviada es la versión activa.

2. Al enviar V2:
   - V1 pasa automáticamente a REEMPLAZADO;
   - V2 pasa a ENVIADO.

3. Al enviar V3:
   - V2 pasa a REEMPLAZADO;
   - V3 pasa a ENVIADO.

4. Las versiones anteriores nunca se modifican.

5. Para estadísticas generales de conversión:
   - contar la última versión relevante de cada familia;
   - no contar versiones reemplazadas como oportunidades independientes;
   - conservar métricas específicas de versiones para analizar cambios.

6. Una versión nueva debe sentirse operativamente como un presupuesto nuevo, pero mantener la relación con la familia original.

7. Presupuestos independientes vinculados a la misma solicitud no deben marcarse como reemplazados entre sí salvo que se defina una relación explícita de reemplazo.

==================================================
15. ÍTEMS Y PRECIOS HISTÓRICOS
==================================================

Cada ítem de una versión debe guardar:

- productId opcional;
- nombre congelado;
- línea;
- cantidad;
- costo congelado;
- markup congelado;
- precio de venta congelado;
- subtotal;
- fecha del precio maestro utilizado;
- posición;
- observación opcional.

Un cambio en el producto maestro nunca debe modificar presupuestos existentes.

Dentro de la edición mostrar para cada ítem:

- costo usado;
- precio usado;
- fecha de última actualización del maestro;
- costo maestro actual;
- precio maestro actual;
- indicador de desactualización.

Acciones:

- actualizar solamente este ítem;
- actualizar todos los ítems;
- mantener precios históricos.

Si la versión ya fue enviada, actualizar precios debe crear una nueva versión.

==================================================
16. CAMBIO DE COSTO DENTRO DEL PRESUPUESTO
==================================================

Cuando se modifica el costo de un producto dentro del presupuesto actualmente mostrado:

1. Actualizar el costo de ese ítem.
2. Mantener su markup y recalcular su venta.
3. Actualizar automáticamente el costo del producto maestro.
4. Recalcular el precio de venta maestro manteniendo su markup efectivo.
5. Usar ese nuevo costo maestro en futuros presupuestos.
6. No modificar ningún otro presupuesto existente.
7. Registrar auditoría del cambio.

Si el ítem no está asociado a un producto maestro, actualizar solo el ítem.

==================================================
17. CAMBIO DEL TOTAL DEL PRESUPUESTO
==================================================

Permitir escribir un total objetivo para el presupuesto.

Al hacerlo:

- no modificar costos;
- modificar los precios de venta;
- ajustar los markups proporcionalmente respecto de sus markups originales;
- mantener la proporción relativa entre markups.

Usar conceptualmente:

targetProfit = targetTotal - totalCost
currentProfit = suma de las ganancias actuales
factor = targetProfit / currentProfit
newMarkupItem = originalMarkupItem * factor

Luego:

newSalePrice = cost * (1 + newMarkupItem)

Considerar cantidades.

Mostrar una previsualización antes de aplicar.

Validar:

- total objetivo no inferior al costo;
- markups no negativos;
- currentProfit distinto de cero;
- redondeos;
- diferencias residuales por centavos.

Distribuir de manera determinística la diferencia final por redondeo.

Registrar el cambio en auditoría.

==================================================
18. PC ARMADA
==================================================

Cada presupuesto tiene un toggle Es PC armada.

Desde configuración debe poder definirse:

- título principal;
- descripción breve;
- texto de servicio de armado;
- texto de instalación;
- texto de Windows sin licencia;
- texto de drivers;
- demora estimada;
- orden de las líneas;
- qué textos aparecen por defecto.

Cuando Es PC armada está activo:

- ordenar por líneas configuradas;
- mostrar una línea principal de agrupación;
- mostrar los componentes como subítems.

PDF simple:

- línea principal con el total de la PC;
- descripción configurable;
- componentes como subítems;
- cantidad visible;
- sin precios individuales;
- los subítems pueden figurar con importe cero o sin importe según la plantilla;
- total general al final.

PDF detallado:

- mantener la identificación de PC armada;
- mostrar componentes;
- cantidad;
- precio individual;
- subtotal;
- total.

Cuando Es PC armada está desactivado:

- usar una tabla normal de productos.

==================================================
19. CAMPOS CONFIGURABLES DEL PDF
==================================================

Desde configuración establecer valores predeterminados para:

- mostrar precio de lista;
- mostrar efectivo o transferencia;
- mostrar financiación;
- mostrar promociones BBVA;
- mostrar cuotas de otros bancos;
- mostrar nota de financiación;
- mostrar datos fiscales;
- mostrar bloque de servicios;
- mostrar Windows;
- mostrar drivers;
- mostrar demora;
- mostrar condiciones de RMA;
- mostrar observación extra;
- mostrar precios individuales;
- mostrar detalle de componentes.

Cada presupuesto debe poder sobrescribir cada opción mediante tres estados:

- HEREDAR;
- MOSTRAR;
- OCULTAR.

Al crear una versión, resolver y congelar todos los valores.

Cambiar la configuración general no debe modificar PDFs ni versiones anteriores.

==================================================
20. FINANCIACIÓN
==================================================

Crear un configurador de financiación.

Debe permitir administrar:

- precio de lista;
- relación entre precio base y lista;
- efectivo o transferencia;
- planes BBVA;
- planes de otros bancos;
- número de cuotas;
- porcentaje o coeficiente;
- indicación “sin interés”;
- días de aplicación;
- notas;
- textos comerciales;
- activa o inactiva;
- orden visual.

No hardcodear coeficientes financieros.

La estructura visual debe permitir reproducir:

- Precio de lista;
- Efectivo / Transferencia;
- nota que indique sobre qué precio se calculan las cuotas;
- BBVA 3 cuotas;
- BBVA 6 cuotas;
- otros bancos 3 cuotas;
- otros bancos 6 cuotas;
- otros bancos 12 cuotas;
- texto explicativo de BBVA.

Los importes se calculan desde configuración.

Cada versión guarda los valores exactos utilizados.

==================================================
21. GENERACIÓN DE PDF
==================================================

Generar PDFs desde HTML/CSS mediante Chromium o Playwright.

Guardar el archivo exacto en almacenamiento persistente.

No regenerar un PDF histórico para representar lo que se envió: conservar el archivo original.

Crear PDF simple y detallado.

La referencia visual es una hoja A4 de The Gamer Shop con:

- logo y nombre arriba a la izquierda;
- condición fiscal debajo;
- título PRESUPUESTO arriba a la derecha;
- número y fecha;
- dos tarjetas:
  - datos del presupuesto;
  - datos fiscales;
- bloque destacado de servicios;
- tabla con encabezado negro;
- sección de precio de lista;
- efectivo o transferencia destacado;
- financiación;
- bloque BBVA;
- condiciones de RMA;
- pie de página con datos del local.

Eliminar completamente:

- Válido hasta;
- fecha de vencimiento.

Todo debe ser configurable:

- logo;
- colores;
- nombre;
- condición fiscal;
- CUIT;
- ingresos brutos;
- inicio de actividad;
- domicilio;
- teléfonos;
- textos;
- URL de RMA;
- footer.

Crear pruebas visuales o snapshots del PDF.

==================================================
22. BÚSQUEDA DE PRESUPUESTOS
==================================================

Crear una pantalla central de todos los presupuestos.

Implementar búsqueda rápida desde backend por:

- nombre interno;
- número de presupuesto;
- nombre de producto incluido;
- cliente;
- número de teléfono;
- DNI;
- texto de solicitud;
- mensaje original;
- colección;
- fecha.

La búsqueda debe:

- ignorar tildes;
- tolerar mayúsculas;
- normalizar teléfonos;
- permitir coincidencia parcial;
- usar índices PostgreSQL;
- usar full-text search y trigram;
- evitar cargar todos los resultados en el navegador;
- tener paginación.

Filtros:

- fecha exacta;
- rango de fechas;
- fecha de creación;
- fecha de última modificación;
- fecha de último envío;
- estado;
- PC armada o presupuesto normal;
- cliente vinculado o sin cliente;
- solicitud vinculada o sin solicitud;
- colección;
- usuario;
- nunca enviado;
- precios desactualizados;
- PDF simple generado;
- PDF detallado generado.

Ordenar por:

- más recientes;
- más antiguos;
- última modificación;
- último envío;
- número;
- nombre;
- total ascendente;
- total descendente;
- más enviados;
- más reutilizados;
- estado.

Cada resultado debe mostrar:

- número;
- nombre;
- versión activa;
- total;
- estado;
- cliente;
- teléfono;
- último envío;
- última modificación;
- colecciones;
- indicador de precios desactualizados.

Acciones rápidas:

- ver;
- editar;
- crear versión;
- clonar;
- generar PDF;
- actualizar precios;
- añadir a colección;
- ver trazabilidad.

==================================================
23. COLECCIONES O CARPETAS
==================================================

Crear colecciones para organizar presupuestos.

En la interfaz pueden llamarse Carpetas o Colecciones.

Ejemplos:

- PROMOS ACTIVAS;
- PC GAMER;
- PC OFICINA;
- PROMOS BBVA;
- ARMADOS AM5;
- PRESUPUESTOS FRECUENTES.

Un presupuesto puede pertenecer a varias colecciones.

Una colección tendrá:

- id;
- nombre;
- descripción opcional;
- orden;
- icono opcional;
- activa o archivada;
- favorita;
- visible en extensión;
- presupuestos relacionados;
- orden interno de presupuestos.

Funciones:

- crear;
- editar;
- archivar;
- ordenar;
- añadir o quitar presupuestos;
- agregar varios presupuestos;
- buscar dentro de una colección;
- fijar favoritas.

La colección no duplica presupuestos.

La extensión debe mostrar prioritariamente:

- favoritas;
- Promos activas;
- recientes;
- presupuestos del cliente;
- solicitudes listas;
- resto de colecciones.

==================================================
24. SIMILITUD ENTRE SOLICITUDES Y PRESUPUESTOS
==================================================

Cuando se analiza una solicitud, buscar solicitudes y presupuestos anteriores similares.

No generar un presupuesto automáticamente.

La similitud debe combinar:

- texto original;
- resumen estructurado;
- presupuesto máximo;
- productos;
- línea de procesador;
- línea de motherboard;
- línea de GPU;
- resultado comercial.

Prioridad:

Si existe GPU:
- GPU alta;
- procesador alta;
- motherboard media;
- texto y rango medios.

Sin GPU:
- procesador alta;
- motherboard alta;
- texto y rango medios.

Usar:

- filtros determinísticos;
- similitud estructural;
- embeddings almacenados cuando OpenAI esté habilitado;
- resultados en caché.

Mostrar:

- porcentaje o nivel de similitud;
- solicitud anterior;
- presupuesto relacionado;
- procesador;
- motherboard;
- GPU;
- total;
- resultado;
- fecha.

Acciones:

- ver;
- comparar;
- crear un nuevo borrador basado manualmente en ese presupuesto;
- descartar sugerencia.

No llamar a esto generación automática.

==================================================
25. SUGERENCIAS DE COMPONENTES HABITUALES
==================================================

Dentro del creador, mostrar una sección discreta:

“Usados frecuentemente en configuraciones similares”.

Basarla en presupuestos históricos según:

- procesador;
- motherboard;
- GPU cuando exista;
- líneas;
- rango aproximado;
- tipo de solicitud.

Mostrar solamente cuando haya historial suficiente.

El umbral de soporte debe ser configurable.

No sugerir:

- productos ya incluidos;
- productos inactivos;
- líneas ya cubiertas cuando la sugerencia sea redundante;
- configuraciones completas generadas por IA.

La sugerencia debe informar:

- producto;
- frecuencia;
- cantidad de antecedentes;
- presupuestos similares de origen.

==================================================
26. FEEDBACK INTERNO DE COMPATIBILIDAD
==================================================

Al guardar un presupuesto, permitir ejecutar automáticamente un feedback conciso de IA si la función está habilitada.

La IA recibe:

- nombres de productos;
- líneas;
- cantidades;
- solicitud;
- uso esperado.

Debe intentar detectar:

- incompatibilidades evidentes;
- socket explícito;
- DDR4 o DDR5 explícito;
- ausencia evidente de componentes;
- combinación CPU/GPU;
- posibles cuellos de botella;
- fuente potencialmente insuficiente;
- dudas que deben verificarse manualmente.

Resultado breve:

- observaciones;
- advertencias;
- nivel de certeza;
- verificaciones manuales recomendadas.

Debe mostrarse internamente.

Nunca declarar compatibilidad garantizada.

Mostrar:

“Análisis orientativo generado por IA. Verificar manualmente antes de confirmar.”

Cachear el resultado usando un hash de componentes y cantidades.

No volver a llamar a la API si el presupuesto no cambió.

Agregar botón Regenerar.

==================================================
27. RESPUESTAS SUGERIDAS POR IA
==================================================

Desde el sistema y la extensión debe existir el botón:

“Sugerir respuesta”.

Tonos:

- amigable y simple;
- intermedio;
- técnico.

La IA recibe:

- mensaje original;
- uso esperado;
- presupuesto máximo;
- componentes;
- precio;
- análisis interno;
- tono;
- textos comerciales permitidos.

Debe explicar por qué la PC sirve para lo solicitado.

No debe:

- inventar FPS exactos sin datos confiables;
- inventar stock;
- inventar descuentos;
- prometer compatibilidad absoluta;
- cambiar condiciones comerciales;
- enviar el mensaje.

El vendedor puede:

- editar;
- copiar;
- insertar en WhatsApp;
- regenerar.

Guardar el mensaje finalmente utilizado.

==================================================
28. EXTENSIÓN CHROME PARA WHATSAPP WEB
==================================================

Crear una extensión Chrome Manifest V3.

No debe enviar mensajes automáticamente.

Debe inyectar un mini panel profesional dentro de WhatsApp Web.

Arquitectura:

- content script;
- background service worker;
- panel React;
- cliente API;
- almacenamiento seguro de sesión;
- adaptador centralizado para selectores y detección del DOM;
- manejo de cambios de interfaz;
- logs de diagnóstico.

Funciones del panel:

1. Detectar el chat actual.
2. Intentar detectar número y nombre visible.
3. Buscar cliente.
4. Crear cliente mediante modal.
5. Mostrar trazabilidad resumida.
6. Crear solicitud.
7. Ver solicitudes.
8. Ver presupuestos del cliente.
9. Ver solicitudes listas.
10. Buscar presupuestos.
11. Navegar colecciones.
12. Seleccionar una versión.
13. Elegir PDF simple o detallado.
14. Generar PDF si todavía no existe.
15. Ver un resumen.
16. Editar rápidamente.
17. Sugerir mensaje.
18. Insertar mensaje.
19. Adjuntar PDF.
20. Registrar envío.
21. Registrar aceptación.
22. Registrar rechazo.
23. Crear una nueva versión.
24. Ver notificaciones.

No leer ni almacenar masivamente todas las conversaciones.

Guardar solamente la información necesaria para la trazabilidad:

- mensaje de solicitud seleccionado;
- mensaje de envío;
- mensajes utilizados para justificar aceptación o rechazo si el usuario los registra;
- número;
- fecha;
- presupuesto;
- versión.

==================================================
29. EDICIÓN RÁPIDA DESDE WHATSAPP
==================================================

Antes de enviar, permitir abrir un modal rápido.

Funciones:

- cambiar cantidad;
- eliminar un producto;
- reemplazar un producto;
- cambiar costo;
- cambiar markup;
- cambiar venta;
- cambiar línea;
- actualizar precios;
- modificar total;
- activar o desactivar campos del PDF;
- añadir observación;
- generar PDF.

Si la versión nunca fue enviada:
- modificar el borrador.

Si ya fue enviada:
- crear una nueva versión.

Para cambios grandes:
- botón que abre el editor completo del sistema.

==================================================
30. PREPARACIÓN Y ADJUNTO
==================================================

La extensión debe:

- descargar el PDF autenticado desde la API;
- preparar el archivo para el input de WhatsApp;
- adjuntarlo mediante la interfaz de WhatsApp;
- insertar el texto;
- dejar el envío bajo control del vendedor.

No ejecutar el clic final de enviar.

Si el adjunto automático no es posible por un cambio de WhatsApp:

- ofrecer descarga o apertura del archivo;
- mantener el mensaje preparado;
- mostrar advertencia clara.

==================================================
31. DETECCIÓN AUTOMÁTICA DEL ENVÍO
==================================================

Después de preparar mensaje y PDF:

1. Crear un intento de envío pendiente en la API.
2. Observar el chat mediante MutationObserver y selectores centralizados.
3. Detectar un mensaje saliente coincidente.
4. Detectar el archivo o nombre del PDF cuando sea posible.
5. Verificar que el chat no haya cambiado.
6. Registrar:
   - presupuesto;
   - versión;
   - número;
   - cliente;
   - solicitud;
   - mensaje;
   - PDF;
   - fecha;
   - usuario.

Si la detección es confiable:
- confirmar automáticamente el envío;
- cambiar el presupuesto a ENVIADO;
- cambiar la solicitud a ENVIADA.

Si es ambigua o falla:
- dejar el intento pendiente;
- mostrar:

“No pudimos confirmar automáticamente el envío. ¿Se envió correctamente?”

Opciones:

- Confirmar envío;
- No se envió;
- Revisar.

El usuario siempre debe poder corregir un registro automático.

No usar el clic del botón como única prueba.

==================================================
32. ACEPTACIÓN Y RECHAZO
==================================================

Desde el panel permitir marcar:

- aceptado;
- rechazado;
- reemplazado;
- no concretado;
- volver a enviado.

Guardar:

- fecha;
- usuario;
- mensaje o nota relacionada opcional;
- presupuesto;
- versión;
- cliente;
- solicitud.

La extensión puede analizar el último mensaje entrante y sugerir:

- posible aceptación;
- posible rechazo;
- solicitud de modificación.

No cambiar silenciosamente a ACEPTADO o RECHAZADO si existe ambigüedad.

Mostrar una acción de confirmación rápida.

==================================================
33. TRAZABILIDAD
==================================================

Crear una línea temporal por solicitud, presupuesto y cliente.

Eventos:

- solicitud creada;
- solicitud asignada;
- análisis IA;
- presupuesto creado;
- versión creada;
- precios actualizados;
- PDF generado;
- mensaje preparado;
- envío detectado;
- envío confirmado manualmente;
- aceptación;
- rechazo;
- reemplazo;
- no concretado;
- cambio de estado;
- cliente creado;
- producto modificado;
- colección modificada.

Cada evento debe guardar:

- entidad;
- usuario;
- fecha;
- tipo;
- datos anteriores;
- datos nuevos;
- metadata relevante.

La trazabilidad se ve:

- en la aplicación;
- resumida en la extensión.

==================================================
34. NO CONCRETADO AUTOMÁTICO
==================================================

No existe el estado INACTIVO.

Implementar un worker idempotente que revise presupuestos ENVIADOS.

Después de más de 10 días desde la última actividad relevante, si no ocurrió:

- aceptación;
- rechazo;
- reemplazo;
- nueva versión enviada;
- interacción registrada;

cambiar a NO_CONCRETADO.

Debe:

- registrar el evento;
- permitir corrección manual;
- permitir reactivación;
- no impedir reutilizar el presupuesto;
- no eliminar nada.

Si luego se vuelve a enviar:
- pasar nuevamente a ENVIADO;
- reiniciar la referencia de actividad.

==================================================
35. DASHBOARD
==================================================

Crear un dashboard útil para decisiones comerciales.

Filtros:

- hoy;
- últimos 7 días;
- mes;
- rango personalizado;
- colección;
- usuario;
- tipo de presupuesto.

Indicadores:

- presupuestos creados;
- enviados;
- aceptados;
- rechazados explícitamente;
- reemplazados;
- no concretados;
- pendientes;
- tasa de aceptación;
- total presupuestado;
- total aceptado;
- promedio de presupuesto aceptado;
- promedio de presupuesto rechazado;
- promedio de no concretado;
- tiempo solicitud a presupuesto listo;
- tiempo envío a aceptación.

Agrupación:

“No convertidos” =
- rechazados;
- reemplazados;
- no concretados.

Siempre permitir abrir el detalle separado.

Productos:

- presentes en aceptados;
- presentes en rechazados;
- presentes en no concretados;
- tasa de aceptación cuando aparece;
- cantidad total de casos;
- productos más sustituidos entre versiones;
- productos más usados;
- productos más reutilizados;
- valor promedio de presupuestos que los contienen.

No presentar un producto como 100% efectivo con una muestra insignificante.

Mostrar cantidad de casos y calcular tasas sobre casos cerrados.

Colecciones:

- presupuestos enviados;
- aceptados;
- no convertidos;
- tasa de aceptación;
- valor promedio;
- colección más utilizada.

Versiones:

- usar la última versión relevante de cada familia para conversión general;
- no inflar estadísticas con versiones reemplazadas;
- conservar métricas específicas de cambios entre versiones.

==================================================
36. NOTIFICACIONES
==================================================

Sistema sencillo de notificaciones internas.

Mostrar:

- solicitud nueva;
- solicitud asignada;
- presupuesto listo;
- fallo de detección de envío;
- envío pendiente de confirmar;
- presupuesto aceptado;
- presupuesto rechazado;
- presupuesto marcado no concretado;
- error de IA;
- error de PDF.

La extensión debe consultar y mostrar las notificaciones relevantes al chat actual.

No crear un sistema complejo de seguimiento obligatorio.

==================================================
37. CONFIGURACIÓN
==================================================

Crear un módulo de configuración para:

Empresa:
- logo;
- nombre;
- condición fiscal;
- CUIT;
- ingresos brutos;
- inicio de actividad;
- domicilio;
- teléfono;
- texto de footer;
- URL de RMA;
- colores.

Productos:
- markup general;
- umbral de similitud;
- uso de IA para similitud ambigua.

PC armada:
- líneas;
- orden;
- título;
- descripción;
- textos de armado;
- Windows;
- drivers;
- demora.

PDF:
- valores predeterminados de visibilidad;
- formato simple;
- formato detallado;
- colores;
- logo.

Financiación:
- planes;
- coeficientes;
- cuotas;
- textos;
- BBVA;
- otros bancos.

IA:
- habilitada;
- modelo configurado por variable;
- análisis de solicitudes;
- similitud semántica;
- compatibilidad;
- respuestas;
- registro de consumo;
- caché;
- límites de uso configurables.

No guardar claves de API en texto visible en la base.
Usar secretos de entorno.

==================================================
38. OPENAI
==================================================

Usar el SDK oficial de OpenAI desde el backend.

Nunca llamar OpenAI directamente desde frontend o extensión.

Usar la Responses API o la API oficial recomendada actualmente.

Usar Structured Outputs con JSON Schema para:

- análisis de solicitud;
- compatibilidad;
- detección de intención;
- datos de similitud.

La clave se obtiene de OPENAI_API_KEY.

Separar servicios:

- RequestAnalysisService;
- CompatibilityFeedbackService;
- ResponseSuggestionService;
- SemanticSimilarityService.

Registrar:

- tipo de tarea;
- modelo;
- duración;
- éxito;
- error;
- tokens o uso disponible;
- entidad;
- hash de entrada.

No guardar razonamientos internos del modelo.

==================================================
39. AUDITORÍA
==================================================

Registrar acciones críticas:

- login;
- producto creado;
- costo modificado;
- markup modificado;
- presupuesto creado;
- total ajustado;
- precios actualizados;
- versión creada;
- PDF generado;
- envío;
- estado;
- cliente;
- solicitud;
- colección;
- configuración.

Guardar:

- usuario;
- fecha;
- entidad;
- acción;
- valor anterior;
- valor nuevo;
- metadata.

No ocultar silenciosamente errores de auditoría.

==================================================
40. UX Y DISEÑO
==================================================

La interfaz no debe parecer una planilla.

Debe sentirse como una aplicación moderna interna de The Gamer Shop.

Prioridades:

- velocidad;
- claridad;
- pocas acciones por flujo;
- búsqueda inmediata;
- edición rápida;
- desktop first;
- responsive;
- estados visibles;
- modales claros;
- loaders no bloqueantes;
- mensajes de error útiles;
- confirmaciones solamente en acciones delicadas;
- navegación lateral;
- dashboard útil;
- tablas paginadas;
- vistas rápidas;
- diseño consistente con TGS.

No saturar la interfaz con sugerencias de IA.

Las sugerencias deben aparecer en zonas discretas y bajo demanda.

==================================================
41. MODELO DE DATOS
==================================================

Diseñar como mínimo entidades equivalentes a:

- User
- Session
- Product
- ProductPriceHistory
- PcLine
- Customer
- QuoteRequest
- QuoteFamily
- QuoteVersion
- QuoteItem
- QuotePdf
- QuoteSendAttempt
- QuoteDelivery
- QuoteStatusEvent
- Collection
- CollectionQuote
- FinancingPlan
- CompanySettings
- PdfSettings
- AiRequest
- AiSuggestion
- Notification
- AuditLog

Agregar índices para:

- número;
- nombre;
- producto;
- teléfono;
- cliente;
- fecha;
- estado;
- colección;
- texto de solicitud;
- búsqueda trigram.

Usar transacciones para:

- guardar presupuesto;
- crear versión;
- actualizar maestro desde presupuesto;
- confirmar envío;
- cambiar estados relacionados.

==================================================
42. API
==================================================

Crear API documentada y validada para:

- auth;
- users;
- products;
- import;
- customers;
- requests;
- quotes;
- versions;
- items;
- prices;
- PDFs;
- collections;
- financing;
- settings;
- AI;
- search;
- dashboard;
- notifications;
- audit;
- extension;
- delivery attempts.

Implementar:

- paginación;
- filtros;
- orden;
- validación;
- control de errores;
- rate limiting;
- OpenAPI;
- tests de contratos.

==================================================
43. PRUEBAS
==================================================

Crear pruebas unitarias para:

- costo, venta y markup;
- cambio bidireccional;
- cambio de markup general;
- total objetivo;
- redondeos;
- versiones;
- estados;
- no concretado;
- similitud;
- financiación;
- visibilidad heredada;
- búsqueda.

Pruebas de integración:

- crear producto;
- crear presupuesto;
- editar borrador;
- enviar;
- crear versión;
- actualizar maestro;
- preservar histórico;
- generar PDF;
- registrar envío;
- solicitud automática;
- colección;
- dashboard.

Pruebas end-to-end web:

- login;
- productos;
- importación;
- solicitud;
- presupuesto;
- PDF;
- búsqueda;
- colecciones;
- configuración;
- dashboard.

Pruebas de extensión con fixtures del DOM:

- detección de chat;
- preparación;
- inserción;
- adjunto;
- detección exitosa;
- detección ambigua;
- confirmación manual.

No automatizar contra una cuenta real de WhatsApp en CI.

==================================================
44. DOCUMENTACIÓN
==================================================

Crear:

- README.md;
- CLAUDE.md;
- docs/ARCHITECTURE.md;
- docs/BUSINESS_RULES.md;
- docs/DATABASE.md;
- docs/API.md;
- docs/EXTENSION.md;
- docs/GRAPHIFY.md;
- docs/AI.md;
- docs/PDF.md;
- docs/DEPLOYMENT.md;
- docs/BACKUP_RESTORE.md;
- docs/QA_CHECKLIST.md;
- docs/DECISIONS.md.

Documentar específicamente:

- cálculo de markup;
- total objetivo;
- versionado;
- estadísticas;
- detección de envío;
- fallback manual;
- no concretado;
- uso de IA;
- limitaciones de compatibilidad;
- estructura del PDF.

