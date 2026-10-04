#!/bin/sh
# Si un deploy anterior dejó una migración en failed, Prisma no reintenta hasta
# marcarla rolled-back. El SQL va en transacción: si falló, el índice no quedó.
# Después de esto, migrate deploy aplica el SQL actual (corregido).
set -eu
cd "$(dirname "$0")/.."

resolve_failed() {
  name="$1"
  echo "[migrate] resolviendo $name si quedó failed..."
  if pnpm exec prisma migrate resolve --rolled-back "$name"; then
    echo "[migrate] $name marcada rolled-back; se reintenta con el SQL actual"
  else
    echo "[migrate] $name no estaba failed (ok)"
  fi
}

# Unique de cuotas: el SQL original chocaba con duplicados.
resolve_failed "20260827020000_unique_movement_installment"
# Unique de sueldo/mes: AT TIME ZONE no es IMMUTABLE (índice rechazado).
resolve_failed "20261004120000_unique_salary_accrual_month"

echo "[migrate] prisma migrate deploy..."
pnpm exec prisma migrate deploy
