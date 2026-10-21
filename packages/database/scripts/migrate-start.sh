#!/bin/sh
# Si un deploy anterior dejó una migración en failed, Prisma no reintenta hasta
# marcarla rolled-back. El SQL va en transacción: si falló, el índice no quedó.
# Después de esto, migrate deploy aplica el SQL actual (corregido).
set -eu
cd "$(dirname "$0")/.."

resolve_failed() {
  name="$1"
  echo "[migrate] chequeando $name..."
  # Prisma imprime "Error: P3012" si la migración no está failed. Eso no es un
  # fallo real, pero Railway lo pinta en rojo en cada arranque. Se captura.
  if out=$(pnpm exec prisma migrate resolve --rolled-back "$name" 2>&1); then
    echo "[migrate] $name marcada rolled-back; se reintenta con el SQL actual"
  else
    echo "[migrate] $name no estaba failed (ok)"
  fi
}

# Unique de cuotas: el SQL original chocaba con duplicados.
resolve_failed "20260827020000_unique_movement_installment"
# Sueldo/mes: el CREATE INDEX (to_char / AT TIME ZONE) no es IMMUTABLE (42P17).
resolve_failed "20261004120000_unique_salary_accrual_month"

echo "[migrate] prisma migrate deploy..."
pnpm exec prisma migrate deploy
