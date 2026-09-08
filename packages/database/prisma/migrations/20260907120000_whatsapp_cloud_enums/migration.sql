-- Valores de enum en su propia migración.
-- Postgres no permite USAR un valor de enum recién agregado dentro de la misma
-- transacción que lo creó. Prisma corre cada migración en su propia transacción,
-- así que separarlos garantiza que la siguiente migración pueda referenciarlos
-- (por ejemplo, como DEFAULT de una columna).

-- Estados de entrega que ahora informa el webhook de Meta. Con la extensión no
-- existían: solo se podía inferir el envío mirando el DOM.
ALTER TYPE "ChatbotMessageStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "ChatbotMessageStatus" ADD VALUE IF NOT EXISTS 'READ';

-- Enums nuevos para la cola de salida server-side.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsappQueueStatus') THEN
    CREATE TYPE "WhatsappQueueStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WhatsappQueueKind') THEN
    CREATE TYPE "WhatsappQueueKind" AS ENUM ('TEXT', 'IMAGE', 'DOCUMENT', 'TEMPLATE');
  END IF;
END
$$;
