-- Reglas de financiación:
--   Precio de lista (1 pago, cualquier banco) = efectivo / transferencia + 23 %; 3 y 6 = lista / 3 y / 6.
--   BBVA (1, 3 y 6) = efectivo / transferencia + 8 %.
--   Se baja "3 cuotas sin interés" de Mercado Pago.
-- Los INSERT / UPDATE no hacen nada en una base vacía: ahí manda el seed.

UPDATE "CompanySettings" SET "listInterestBps" = 2300;

UPDATE "FinancingPlan" SET "interestBps" = 800, "updatedAt" = CURRENT_TIMESTAMP
WHERE "bank" ILIKE '%bbva%' OR "bank" ILIKE '%franc_s%';

UPDATE "FinancingPlan" SET "interestBps" = 0, "updatedAt" = CURRENT_TIMESTAMP
WHERE "installments" IN (3, 6) AND ("bank" IS NULL OR "bank" = '' OR "bank" ILIKE '%otros%');

UPDATE "FinancingPlan" SET "active" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "bank" ILIKE '%mercado%' AND "installments" = 3 AND "interestBps" = 0;

-- Calculadora de financiación (tiene sus propias tasas).
UPDATE "CalculatorPlan" p SET "interestBps" = 2300, "updatedAt" = CURRENT_TIMESTAMP
FROM "CalculatorGroup" g WHERE g."id" = p."groupId" AND g."key" = 'list';

UPDATE "CalculatorPlan" p SET "interestBps" = 800, "updatedAt" = CURRENT_TIMESTAMP
FROM "CalculatorGroup" g WHERE g."id" = p."groupId" AND g."key" = 'bbva';

INSERT INTO "CalculatorPlan" ("id", "groupId", "installments", "interestBps", "sortOrder", "visible", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, g."id", 1, 800, -1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "CalculatorGroup" g
WHERE g."key" = 'bbva'
  AND NOT EXISTS (SELECT 1 FROM "CalculatorPlan" p WHERE p."groupId" = g."id" AND p."installments" = 1);

UPDATE "CalculatorPlan" p SET "interestBps" = 0, "updatedAt" = CURRENT_TIMESTAMP
FROM "CalculatorGroup" g WHERE g."id" = p."groupId" AND g."key" = 'otros-bancos' AND p."installments" IN (3, 6);

UPDATE "CalculatorPlan" p SET "visible" = false, "updatedAt" = CURRENT_TIMESTAMP
FROM "CalculatorGroup" g
WHERE g."id" = p."groupId" AND g."key" = 'mercadopago' AND p."installments" = 3 AND p."interestBps" = 0;

-- Textos del bot sobre formas de pago que quedaron guardados.
UPDATE "ChatbotSettings" SET "salesRules" = (replace(replace(replace(replace(replace("salesRules"::text, 'Tarjeta de Credito en cuotas (3 / 6 / 12 cuotas con interes)', 'Tarjeta de Credito en cuotas (3 / 6 cuotas sin interes del precio de lista, 12 con interes)'), 'Tarjeta de Credito BBVA (3 Cuotas sin interes del precio del lista)', 'Tarjeta de Credito BBVA (1, 3 o 6 cuotas con precio especial BBVA)'), 'tarjeta de crédito en 3/6/12 cuotas con interés, BBVA 3 cuotas sin interés del precio de lista', 'tarjeta de crédito en 3/6 cuotas sin interés del precio de lista y 12 con interés, BBVA 1, 3 o 6 cuotas con precio especial'), 'Con debito o credito en 1 pago tiene un recargo que se ve en el momento. Con cualquier tarjeta de credito tenes 3, 6 y 12 cuotas con interes. Con BBVA: viernes y sabados 3 cuotas sin interes sobre precio de lista, y una vez al mes 6 sin interes.', 'Con tarjeta de credito en 1 pago es el precio de lista, y con cualquier banco tenes 3 y 6 cuotas sin interes sobre ese precio. Tambien hay 12 cuotas con interes. Con BBVA tenes precio especial: viernes y sabados en 3 cuotas, y una vez al mes en 6. Con debito tiene un recargo que se ve en el momento.'), 'El recargo exacto de débito o 1 pago no lo des: decí que se ve en el momento. De las 6 sin interés de BBVA no prometas fecha', 'El recargo exacto de débito no lo des: decí que se ve en el momento. De las 6 cuotas de BBVA no prometas fecha'))::jsonb WHERE "salesRules" IS NOT NULL;
UPDATE "ChatbotSettings" SET "stagePlaybook" = (replace(replace(replace(replace(replace("stagePlaybook"::text, 'Tarjeta de Credito en cuotas (3 / 6 / 12 cuotas con interes)', 'Tarjeta de Credito en cuotas (3 / 6 cuotas sin interes del precio de lista, 12 con interes)'), 'Tarjeta de Credito BBVA (3 Cuotas sin interes del precio del lista)', 'Tarjeta de Credito BBVA (1, 3 o 6 cuotas con precio especial BBVA)'), 'tarjeta de crédito en 3/6/12 cuotas con interés, BBVA 3 cuotas sin interés del precio de lista', 'tarjeta de crédito en 3/6 cuotas sin interés del precio de lista y 12 con interés, BBVA 1, 3 o 6 cuotas con precio especial'), 'Con debito o credito en 1 pago tiene un recargo que se ve en el momento. Con cualquier tarjeta de credito tenes 3, 6 y 12 cuotas con interes. Con BBVA: viernes y sabados 3 cuotas sin interes sobre precio de lista, y una vez al mes 6 sin interes.', 'Con tarjeta de credito en 1 pago es el precio de lista, y con cualquier banco tenes 3 y 6 cuotas sin interes sobre ese precio. Tambien hay 12 cuotas con interes. Con BBVA tenes precio especial: viernes y sabados en 3 cuotas, y una vez al mes en 6. Con debito tiene un recargo que se ve en el momento.'), 'El recargo exacto de débito o 1 pago no lo des: decí que se ve en el momento. De las 6 sin interés de BBVA no prometas fecha', 'El recargo exacto de débito no lo des: decí que se ve en el momento. De las 6 cuotas de BBVA no prometas fecha'))::jsonb WHERE "stagePlaybook" IS NOT NULL;
UPDATE "ChatbotSettings" SET "knowledgeEntries" = (replace(replace(replace(replace(replace("knowledgeEntries"::text, 'Tarjeta de Credito en cuotas (3 / 6 / 12 cuotas con interes)', 'Tarjeta de Credito en cuotas (3 / 6 cuotas sin interes del precio de lista, 12 con interes)'), 'Tarjeta de Credito BBVA (3 Cuotas sin interes del precio del lista)', 'Tarjeta de Credito BBVA (1, 3 o 6 cuotas con precio especial BBVA)'), 'tarjeta de crédito en 3/6/12 cuotas con interés, BBVA 3 cuotas sin interés del precio de lista', 'tarjeta de crédito en 3/6 cuotas sin interés del precio de lista y 12 con interés, BBVA 1, 3 o 6 cuotas con precio especial'), 'Con debito o credito en 1 pago tiene un recargo que se ve en el momento. Con cualquier tarjeta de credito tenes 3, 6 y 12 cuotas con interes. Con BBVA: viernes y sabados 3 cuotas sin interes sobre precio de lista, y una vez al mes 6 sin interes.', 'Con tarjeta de credito en 1 pago es el precio de lista, y con cualquier banco tenes 3 y 6 cuotas sin interes sobre ese precio. Tambien hay 12 cuotas con interes. Con BBVA tenes precio especial: viernes y sabados en 3 cuotas, y una vez al mes en 6. Con debito tiene un recargo que se ve en el momento.'), 'El recargo exacto de débito o 1 pago no lo des: decí que se ve en el momento. De las 6 sin interés de BBVA no prometas fecha', 'El recargo exacto de débito no lo des: decí que se ve en el momento. De las 6 cuotas de BBVA no prometas fecha'))::jsonb WHERE "knowledgeEntries" IS NOT NULL;
