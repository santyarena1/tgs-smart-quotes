-- Lista de juegos que la IA analiza en cada PC publicada (uno por línea).
ALTER TABLE "AiSettings" ADD COLUMN IF NOT EXISTS "gamesToAnalyze" TEXT;
