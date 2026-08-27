#!/bin/sh
# Si un deploy anterior dejó 20260827020000 en failed (unique contra cuotas duplicadas),
# Prisma no reintenta hasta marcarla rolled-back. El SQL va en transacción: si falló,
# el índice no quedó creado. Después de esto, migrate deploy aplica el SQL corregido.
set -eu
cd "$(dirname "$0")/.."

FAILED_MIGRATION="20260827020000_unique_movement_installment"

echo "[migrate] resolviendo $FAILED_MIGRATION si quedó failed..."
if pnpm exec prisma migrate resolve --rolled-back "$FAILED_MIGRATION"; then
  echo "[migrate] marcada rolled-back; se reintenta con el SQL actual"
else
  echo "[migrate] no estaba failed (ok)"
fi

echo "[migrate] prisma migrate deploy..."
pnpm exec prisma migrate deploy
