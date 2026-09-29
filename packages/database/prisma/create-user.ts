import { PrismaClient } from '@prisma/client';
import { hash, argon2id } from 'argon2';

/**
 * Crea o actualiza un usuario VENDEDOR asignado a un local. Pensado para correr una vez contra la
 * base real (DATABASE_URL) sin dejar contraseñas en el repo:
 *
 *   NEW_USERNAME=alejandro NEW_PASSWORD=... NEW_DISPLAY_NAME=Alejandro \
 *   NEW_BRANCH_MATCH=naon NEW_BRANCH_NAME="Naon" NEW_BRANCH_ADDRESS="Carhué 1409" \
 *   pnpm --filter @tgs/database create-user
 *
 * Busca el local por nombre (contiene NEW_BRANCH_MATCH, sin distinguir mayúsculas); si no existe lo
 * crea con NEW_BRANCH_NAME. A diferencia de la pantalla Usuarios, no exige 8 caracteres mínimos.
 */
const db = new PrismaClient();

async function main() {
  const username = process.env.NEW_USERNAME?.trim();
  const password = process.env.NEW_PASSWORD;
  if (!username || !password) throw new Error('NEW_USERNAME y NEW_PASSWORD son obligatorios');
  const match = process.env.NEW_BRANCH_MATCH?.trim();
  const branchName = process.env.NEW_BRANCH_NAME?.trim() || match;

  let branch = null;
  if (match) {
    branch = await db.branch.findFirst({ where: { name: { contains: match, mode: 'insensitive' } } });
    if (!branch && branchName) {
      branch = await db.branch.create({
        data: { name: branchName, address: process.env.NEW_BRANCH_ADDRESS?.trim() || null },
      });
    }
  }

  const passwordHash = await hash(password, { type: argon2id });
  const displayName = process.env.NEW_DISPLAY_NAME?.trim() || null;
  const user = await db.user.upsert({
    where: { username },
    update: { passwordHash, displayName, branchId: branch?.id ?? null, active: true },
    create: { username, passwordHash, displayName, role: 'VENDEDOR', branchId: branch?.id ?? null },
  });
  console.log(JSON.stringify({ userId: user.id, username, branch: branch?.name ?? null }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
