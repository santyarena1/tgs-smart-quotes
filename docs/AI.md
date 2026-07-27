# IA

La API es el unico consumidor del SDK OpenAI. Servicios separados cubren analisis, compatibilidad, respuesta y similitud. La clave vive en entorno. Cada entrada se identifica por SHA-256 y debe persistirse para cache. Sin clave, la funcion devuelve error configurable sin bloquear presupuestos. Nunca se guardan razonamientos ni se envia o cambia un estado definitivo automaticamente.
