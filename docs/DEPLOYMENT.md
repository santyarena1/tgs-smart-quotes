# Despliegue

Definir `.env`, cambiar secretos y ejecutar `docker compose -f docker-compose.prod.yml up -d --build`. Aplicar `pnpm db:migrate` y `pnpm db:seed` antes de trafico. API `/api/health` debe responder `ok`. Persistir volúmenes de PostgreSQL y PDFs. El despliegue no depende de un proveedor.
