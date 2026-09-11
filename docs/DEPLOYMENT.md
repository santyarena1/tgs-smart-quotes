# Despliegue

Definir `.env`, cambiar secretos y ejecutar `docker compose -f docker-compose.prod.yml up -d --build`. Aplicar `pnpm db:migrate` y `pnpm db:seed` antes de trafico. API `/api/health` debe responder `ok`. Persistir volúmenes de PostgreSQL y PDFs. El despliegue no depende de un proveedor.

## Variables del worker en Railway

El worker es un servicio aparte y **no hereda** las variables de la API. Necesita, además de :

-  = la misma clave que la API (descifra el secreto HMAC de WordPress y las API keys del módulo externo). Sin ella el resync horario fallaba con "SETTINGS_ENC_KEY debe contener 32 bytes" y dejaba ese error en cada publicación.
-  = la URL pública de la API (igual que en el servicio api). Sin ella las imágenes republicadas apuntarían a .

Están configuradas como referencias (, ) para que no se desincronicen. Si faltan, el worker lo loguea al arrancar y saltea la republicación automática en vez de operar a ciegas.
