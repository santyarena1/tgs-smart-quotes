-- La IA devolvía a veces el presupuesto en pesos y se guardaba como centavos
-- ("1.5M" quedaba en $15.000). Ningún presupuesto real es menor a $10.000: se corrige x100.
UPDATE "ChatbotConversation"
   SET "leadValueCents" = "leadValueCents" * 100
 WHERE profile ? 'budgetCents'
   AND (profile->>'budgetCents')::bigint < 1000000
   AND "leadValueCents" = (profile->>'budgetCents')::bigint;

UPDATE "ChatbotConversation"
   SET profile = jsonb_set(profile, '{budgetCents}', to_jsonb((profile->>'budgetCents')::bigint * 100))
 WHERE profile ? 'budgetCents'
   AND jsonb_typeof(profile->'budgetCents') = 'number'
   AND (profile->>'budgetCents')::bigint > 0
   AND (profile->>'budgetCents')::bigint < 1000000;

UPDATE "QuoteRequest"
   SET "maximumBudgetCents" = "maximumBudgetCents" * 100
 WHERE "maximumBudgetCents" > 0 AND "maximumBudgetCents" < 1000000;
