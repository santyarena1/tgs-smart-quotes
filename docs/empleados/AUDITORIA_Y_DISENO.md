# Módulo Empleados / Cuenta Corriente — Auditoría + Diseño (para aprobación)

> Entregable de FASE 0 + diseño. **No se implementó nada todavía.** Verificado contra el código real del repo (auth, roles, locales, schema, guards, UI). Al final, plan por fases.
> Reglas del proyecto que respeto: dinero en **centavos/BigInt** (nunca float), porcentajes en **bps (Int)**, zona `America/Argentina/Buenos_Aires`, español, monorepo existente, migraciones con extremo cuidado, push solo con autorización.

---

## PARTE 1 — Auditoría del sistema actual (real, no de memoria)

### 1.1 Login (`apps/api/src/auth.ts`, `AuthController`)
- `POST /auth/login` (`@Public()`): recibe `{username, password}` (validado con `loginInputSchema`).
- **Rate-limit propio** por tabla `LoginAttempt`: cuenta fallos recientes por `username` **o** `ip` en una ventana (`LOGIN_WINDOW_MINUTES`, `LOGIN_MAX_ATTEMPTS`); si supera, bloquea temporalmente.
- Password verificado con **argon2** (`verify`). Usa un hash dummy constante cuando el usuario no existe → evita *timing enumeration*.
- En éxito: crea `Session` (token `randomBytes(32)` base64url, se guarda **solo el sha256** `tokenHash`), setea cookie **HttpOnly, SameSite=Lax, Secure** (`tgs_session`), actualiza `lastAccessAt`, audita `LOGIN`.
- `POST /auth/logout`: borra la sesión + audita. `GET /auth/me`: devuelve `req.user`.
- **Veredicto:** login sólido y seguro. Reutilizable tal cual. No hace falta tocar nada.

### 1.2 Sesiones / auth (`apps/api/src/infrastructure.ts`, `AuthGuard`)
- **Guards globales** registrados como `APP_GUARD` en `module.ts`: `RateLimitGuard` + `AuthGuard`. → **Todo endpoint exige sesión por defecto** salvo `@Public()`.
- `AuthGuard`: lee cookie → `sha256` → busca `Session` (con `user`), valida existencia + no vencida + `user.active`. Setea `req.user = {id, username, displayName, role, branchId}` y `req.sessionId`. Renueva la sesión si está por vencer.
- Decoradores disponibles: `@Public()`, `@Roles(...UserRole)`, `@SkipRateLimit()`, param `@CurrentUser()`.
- **Veredicto:** infraestructura de auth/sesión correcta y estándar (NestJS guard). Reutilizable.

### 1.3 Roles / cómo se determina "administrador"
- Enum `UserRole` = **`ADMIN` | `VENDEDOR`** (solo dos, default `VENDEDOR`).
- **`@Roles('ADMIN')` SÍ se valida server-side**: el `AuthGuard` compara `req.user.role` contra la metadata `roles` y lanza `ForbiddenException`. **Está en uso real** en `UsersController` y `BranchesController` (nivel de clase).
- `UsersController` incluso protege contra dejar el sistema sin admin activo (no permite bajar el último ADMIN).
- **Veredicto:** hay un mecanismo de autorización por rol **server-side, probado y reutilizable**. Para el módulo nuevo alcanza con `@Roles('ADMIN')` a nivel de controller.

### 1.4 Locales (`Branch`)
- `Branch` = local (id, name, address, phones). `User.branchId` **único y opcional** → **un usuario pertenece a lo sumo a UN local**. NO hay relación muchos-a-muchos.
- **`branchId` NO se usa para scoping de datos** en ningún query (el grep de uso en queries dio vacío). Hoy el local es **solo un atributo informativo** del usuario. No existe lógica "el VENDEDOR solo ve lo de su local".
- Gestión de branches: `BranchesController` (`@Roles('ADMIN')`).
- **Veredicto:** los locales existen como catálogo + atributo de usuario, pero **no como frontera de seguridad**. Reutilizable como catálogo; para el módulo de empleados sirve para **clasificar/filtrar empleados por local**, no para autorización.

### 1.5 Permisos en frontend
- `apps/web/components/App.tsx`: la nav filtra el item `usuarios` con `user.role === "ADMIN"`, y `UsersView` solo se renderiza si `role === "ADMIN"`. `AuthUser` (`lib/types.ts`) trae `role` y `branchId`.
- **Veredicto:** el frontend oculta opciones por rol, **pero eso es solo UX** (ver 1.6).

### 1.6 Permisos en backend (lo que importa)
- Salvo `users`/`branches` (que sí tienen `@Roles('ADMIN')`), **el resto de los controllers solo exigen sesión** (cualquier usuario logueado, ADMIN o VENDEDOR, puede llamarlos). Ej.: `products`, `quotes`, `external-module`, etc. no restringen por rol.
- **Esto está bien** para funciones generales, pero significa que **para el módulo de empleados (sensible) hay que poner `@Roles('ADMIN')` explícito**; no alcanza con ocultar el botón.

### 1.7 ¿Hay endpoints que dependen solo de ocultar UI?
- Para **users/branches**: NO, están protegidos server-side.
- Para el resto: no hay nada "admin-only" oculto solo por UI hoy, porque no hay features admin-only más allá de users/branches. El **Módulo Externo** que ya existe es auth-only (no admin-only) — es un dato a tener en cuenta, pero no afecta este módulo.
- **Conclusión:** el patrón correcto (guard server-side) ya existe y hay que aplicarlo al módulo nuevo.

### 1.8 ¿La arquitectura permite agregar permisos/roles de forma limpia?
- **Roles:** sí, agregar un valor al enum `UserRole` es una migración simple (`ALTER TYPE ADD VALUE`) y el guard ya soporta N roles. Pero hoy **no hay sistema de permisos granulares** (solo el rol grueso).
- **Recomendación:** para este módulo NO construir un framework de permisos (sería sobreingeniería, ver pedido §28). Usar `@Roles('ADMIN')` ahora; el portal futuro del empleado se autoriza por **derivación `User → Employee`** (no por rol). Si en el futuro hacen falta permisos finos, se agregan incrementalmente.

### 1.9 Problemas / deuda técnica real encontrada (no inventada)
1. **Locales de un solo valor por usuario** (no multi-local). El pedido menciona "uno o varios locales"; el sistema hoy soporta uno solo.
2. **Sin permisos granulares** (solo ADMIN/VENDEDOR). No es un bug, es una limitación a considerar para "permisos ampliables".
3. **`branchId` no scopea datos** → no hay patrón previo de "aislamiento por local" para reutilizar.
4. **Migraciones sin validación real en CI** y **la API migra al arrancar** (riesgo de tirar prod con SQL malo) — ya documentado en `SYSTEM_OVERVIEW.md`. Aplica a este módulo.
5. **Sin concepto de método de pago** reutilizable.
- **Nada de esto obliga a un refactor grande.** La base de auth/roles es válida y se reutiliza.

### 1.10 Qué reutilizar vs. qué corregir
- **Reutilizar (sin tocar):** login, sesiones, `AuthGuard`, `@Roles`/`@Public`/`@CurrentUser`, `AuditLog`, `db.$transaction`, `jsonSafe` (BigInt→string), contratos zod, helpers de dinero (`money.ts`, `pricing`), componentes UI compartidos, patrón de controller/módulo.
- **Corregir/extender (mínimo):** nada estructural del auth. Solo **agregar** el módulo nuevo siguiendo los patrones. (Ver Parte 2 para las decisiones sobre multi-local y permisos.)

---

## PARTE 2 — Contradicciones entre el pedido y el código real (explícitas)

| # | Pedido | Realidad del código | Propuesta |
|---|--------|---------------------|-----------|
| C1 | "usuarios asociados a **uno o varios** locales" | `User.branchId` es **único** (un local). No hay M-N. | Para **empleados** modelar `Employee.branchId` **único opcional** (igual que el sistema). Multi-local NO se construye ahora; si se necesita, se agrega una tabla `EmployeeBranch` después. **No crear un sistema paralelo.** Confirmame si con un local por empleado alcanza (creo que sí para el Excel actual). |
| C2 | "permisos diferentes según usuario / permisos ampliables" | Solo 2 roles, sin permisos finos. | Ahora: `@Roles('ADMIN')`. Futuro portal: autorización por `User→Employee` (self), no por rol. **No** construir framework de permisos hoy (sobreingeniería, §28). |
| C3 | "usuarios que puedan acceder a info personal de empleados" + "separación estricta administrativa vs. propia del usuario" | Hoy la única frontera es el rol ADMIN. | La separación se logra con: (a) módulo admin-only server-side ahora; (b) portal futuro que **deriva `employeeId` del `req.user`** y nunca del request. Se diseña el modelo para soportarlo desde ya. |
| C4 | "método de pago (efectivo/transferencia/MP/tarjeta/otro)" | No existe enum reutilizable. | Crear enum nuevo `PaymentMethod` en el schema (no es duplicación). |
| C5 | Empleado ↔ usuario | Los "usuarios" son operadores (login). | `Employee` es entidad separada con `userId?` opcional/único. "Crear usuario y asociar" reutiliza el `UsersController` existente (ADMIN), no un flujo paralelo. |

**Ninguna contradicción bloquea el diseño.** Solo C1 pide una confirmación (un local por empleado vs. varios).

---

## PARTE 3 — Diseño de datos propuesto

Principio rector: **el saldo es la suma de un único libro de movimientos (`Movement`) aplicados.** Deudas, cuotas y pagos son estructuras que **generan** movimientos; no duplican el saldo. "Solicitud" es un concepto **separado** de "movimiento".

### 3.1 Entidades

**`Employee`** — persona (no necesariamente usuario).
`id, fullName, docId?, branchId?→Branch, userId?→User (unique), position?, active(bool), notes?, createdById→User, createdAt, updatedAt`.
- `userId` opcional y único → Caso A (sin usuario) y Caso B (con usuario). No habilita el portal todavía.

**`SalaryRecord`** — historial salarial (nunca se sobrescribe).
`id, employeeId, amountCents(BigInt), effectiveFrom(Date), previousAmountCents?(BigInt), changeBps?(Int), reason?, createdById, createdAt`.
- Sueldo vigente = el `SalaryRecord` más reciente por `effectiveFrom`. Cada cambio (incluido el masivo %) crea un registro nuevo.

**`Movement`** — libro de la cuenta corriente (fuente de verdad del saldo).
`id, employeeId, kind(MovementKind), direction(EMPLOYEE_OWES|COMPANY_OWES), amountCents(BigInt, magnitud ≥0), status(PENDING|APPLIED|CANCELLED), occurredAt(Date, default now AR), description?, obligationId?→Obligation, installmentId?→Installment, paymentId?→Payment, requestId?→EmployeeRequest, createdById, appliedById?, appliedAt?, cancelledById?, cancelledAt?, createdAt, updatedAt`.
- El **signo** para el saldo se deriva de `direction` (no se guarda un signed suelto): COMPANY_OWES → `+amount`, EMPLOYEE_OWES → `−amount`.
- `kind` es etiqueta/reporte; `direction` es la verdad contable. Así un `ADJUSTMENT`/`CORRECTION` puede ir en cualquier dirección explícita.

**`Obligation`** — deuda del empleado (con opción de cuotas).
`id, employeeId, kind(MERCHANDISE|CARD_CONSUMPTION|ADVANCE|OTHER), originalAmountCents(BigInt), description?, productId?→Product (opcional, no obligatorio), status(OPEN|SETTLED|CANCELLED), createdById, createdAt, updatedAt`.
- Al crearse, genera **un** `Movement` de cargo (EMPLOYEE_OWES por `originalAmountCents`).
- `pendingCents` = `originalAmountCents − Σ(pagos aplicados a esta obligación)` (derivado, no se guarda desnormalizado salvo caché opcional).

**`InstallmentPlan` + `Installment`** — cuotas de una obligación.
- Plan: `id, obligationId(unique), count(Int), firstPeriod(YYYY-MM o Date)`.
- `Installment`: `id, obligationId, number(Int), amountCents(BigInt), period(YYYY-MM o dueDate), status(PENDING|PAID|PARTIAL|CANCELLED), paidCents(BigInt default 0)`.
- Las cuotas son **expectativas programadas**; NO descuentan solas. En la liquidación del período aparecen y el admin decide aplicarlas (genera pago/movimiento).

**`Payment`** — pago (puede tener varios métodos vía varias filas / allocations).
`id, employeeId, amountCents(BigInt), method(PaymentMethod), paidAt(Date), reference?, createdById, createdAt`.
- **Pago parcial:** un `Payment` por importe menor. **Múltiples métodos:** varios `Payment` (cada uno con su method) aplicados a la misma obligación/período.
- `PaymentAllocation` (opcional pero recomendado): `id, paymentId, targetType(OBLIGATION|INSTALLMENT|SALARY_PERIOD|GENERAL), targetId?, amountCents`. Permite repartir un pago entre varias obligaciones/cuotas. Cada allocation genera/asocia el `Movement` de crédito.
- Nunca se altera el `originalAmountCents`; el pendiente se deriva.

**`SalaryPeriod`** (Fase 5, liquidación interna simple) — opcional.
`id, employeeId, period(YYYY-MM), baseSalaryCents(snapshot), status(DRAFT|CONFIRMED), lines(Json: deudas/cuotas/adelantos/créditos), netCents, confirmedById?, confirmedAt?`.
- Herramienta de ayuda: propone el neto; el admin **confirma** qué movimientos se aplican. **No** es payroll legal (sin cargas sociales/AFIP).

**`EmployeeRequest`** — solicitud (infra para el portal futuro; separado de `Movement`).
`id, employeeId, kind, amountCents(BigInt), description?, status(PENDING_APPROVAL|APPROVED|REJECTED), createdByUserId→User, reviewedById?, reviewedAt?, resultingMovementId?→Movement, createdAt, updatedAt`.
- Un empleado (futuro) crea la solicitud; el admin aprueba/modifica/rechaza. **Solo al aprobar** se crea/aplica el `Movement`. Se modela ahora; la UI del empleado se implementa después.

### 3.2 Enums nuevos
- `MovementKind`: `SALARY_ACCRUAL, SALARY_PAYMENT, ADVANCE, MERCHANDISE, CARD_CONSUMPTION, DEBT, REPAYMENT, REIMBURSEMENT, INSTALLMENT, ADJUSTMENT`.
- `MovementDirection`: `EMPLOYEE_OWES, COMPANY_OWES`.
- `MovementStatus`: `PENDING, APPLIED, CANCELLED`.
- `PaymentMethod`: `EFECTIVO, TRANSFERENCIA, MERCADO_PAGO, TARJETA, OTRO`.
- `ObligationStatus`, `InstallmentStatus`, `RequestStatus` (según arriba).

### 3.3 Regla EXACTA del saldo (sin ambigüedad)
```
saldoCents = Σ  signo(m) · m.amountCents   para todo m con m.status = APPLIED
donde signo(m) = +1 si m.direction = COMPANY_OWES
                 −1 si m.direction = EMPLOYEE_OWES
```
Presentación en UI (nunca "Saldo: -$50.000" a secas):
- `saldo > 0` → **"Empresa debe al empleado: $saldo"**
- `saldo < 0` → **"Empleado debe a la empresa: $|saldo|"**
- `saldo = 0` → **"Cuenta saldada"**
- Los `PENDING` se muestran aparte ("pendiente de aplicar") y **no** entran al saldo hasta aplicarse. Los `CANCELLED` nunca suman.
- El detalle de una **obligación** muestra su `pendingCents` propio; el **saldo global** es la suma del libro. No se duplica: la obligación y sus pagos SON las entradas del libro.

### 3.4 Estados y su significado
- **Movement:** `PENDING` (existe, no impacta el saldo), `APPLIED` (impacta), `CANCELLED` (se conserva por trazabilidad, no impacta). Nunca borrar un movimiento aplicado: se **anula** (`CANCELLED`) o se hace un **contramovimiento/ajuste**.
- **EmployeeRequest:** `PENDING_APPROVAL → APPROVED | REJECTED`. Aprobar dispara la creación/aplicación del movimiento.

### 3.5 Pagos parciales / múltiples métodos / cuotas
- **Parcial:** `Payment.amountCents` < pendiente → obligación queda `OPEN` con `pending` reducido. Original intacto.
- **Múltiples métodos:** N `Payment` (uno por método) → N `PaymentAllocation` a la misma obligación/período.
- **Cuotas:** `Obligation` + `InstallmentPlan` + `Installment[]`. Total = `originalAmountCents`; cada cuota su `amountCents` y `period`. Al preparar el período, las cuotas de ese período se listan; aplicarlas genera pagos/movimientos. Pendiente por cuota = `amountCents − paidCents`.

### 3.6 Actualización salarial masiva por % (seguro, sin float)
- Porcentaje en **bps** (Int): +2,1% → `210` bps (reusar `pctToBps`).
- Cálculo por empleado con BigInt (patrón existente `saleFromCostAndPct`):
  `nuevoCents = redondear( oldCents · (10000 + bps) / 10000 )` con **redondeo determinístico** (half-up al centavo). Ej.: `1.000.000 (100000000cents) · 10210 / 10000 = 102142000cents = $1.021.420` (ojo: el ejemplo del pedido "$1.021.000" es redondeo a mil pesos; **confirmar** si el redondeo es al centavo o a un paso de pesos configurable — hay helper `roundCentsToPesosStep`).
- Flujo obligatorio: **vista previa** (anterior / % / resultante por empleado) → excluir/editar individuales → **confirmación** → aplica creando un `SalaryRecord` por empleado (con `changeBps` y `reason`). Nunca aplicar en silencio.

### 3.7 Auditoría / borrado
- Campos `createdById` / `appliedById` / `cancelledById` / `reviewedById` + timestamps en las entidades económicas. Además se puede registrar en el `AuditLog` global existente para operaciones clave.
- **Borrado:** nada de `DELETE` sobre movimientos aplicados/pagos. Objetos aún `PENDING`/borradores pueden eliminarse si es seguro. Correcciones históricas → anulación o contramovimiento.

---

## PARTE 4 — Endpoints propuestos (`@Controller('employees')`, **`@Roles('ADMIN')` a nivel de clase**)
Prefijo real `/api/employees/...`. Todos server-side admin-only en Fase 1.
- Empleados: `GET /employees`, `GET /employees/:id` (incluye saldo + resumen), `POST /employees`, `PUT /employees/:id`, `POST /employees/:id/link-user` (asocia userId), `POST /employees/:id/create-user` (reusa lógica de UsersController).
- Saldo/historial: `GET /employees/:id/movements` (filtros: período, estado, tipo, dirección), `GET /employees/:id/balance`.
- Movimientos: `POST /employees/:id/movements` (carga rápida: kind+amount, defaults), `POST /movements/:id/apply`, `POST /movements/:id/cancel`, `PUT /movements/:id` (solo PENDING).
- Sueldos: `GET /employees/:id/salary`, `GET /employees/:id/salary/history`, `PUT /employees/:id/salary`, `POST /employees/salary/bulk-preview` (%), `POST /employees/salary/bulk-apply`.
- Deudas/cuotas: `POST /employees/:id/obligations` (con opción de cuotas), `GET /obligations/:id`, `POST /obligations/:id/cancel`.
- Pagos: `POST /employees/:id/payments` (con allocations opcionales), `POST /obligations/:id/payments`.
- Período: `GET /employees/:id/period/:yyyymm` (propuesta), `POST /employees/:id/period/:yyyymm/confirm`.
- Solicitudes (admin ahora): `GET /employee-requests?status=PENDING_APPROVAL`, `POST /employee-requests/:id/approve|reject`. (El `POST` de creación por el empleado queda para el portal futuro, con auth por `User→Employee`.)
- Resumen: `GET /employees/summary` (totales para el dashboard).

Todos: validación con **zod (contracts)**, `db.$transaction` en operaciones económicas, montos en centavos, `jsonSafe` en la salida.

---

## PARTE 5 — UI administrativa (tab en la nav, solo ADMIN)
- **Resumen:** total a pagar a empleados, total que deben a la empresa, movimientos pendientes, solicitudes pendientes, próximos pagos/cuotas. Sin dashboards de más.
- **Lista de empleados:** nombre, local, sueldo actual, **saldo con "quién debe a quién"**, pendientes, link a detalle.
- **Detalle:** datos básicos, usuario asociado / "sin usuario", sueldo actual, saldo claro, próximos movimientos/cuotas, **acciones rápidas**, historial filtrable.
- **Movimiento rápido:** modal con solo `empleado (contexto) + concepto + monto` → guardar. Fecha=hoy (editable), estado=PENDIENTE (editable), descripción opcional; lo avanzado detrás de "Más opciones".
- **Actualizar sueldos:** wizard con vista previa (anterior/%/resultante), exclusión/edición individual, confirmación.
- Reutiliza componentes de `apps/web/components/shared.tsx` y helpers de `lib/money.ts`. Gating de nav por `role === 'ADMIN'` (UI) **respaldado por el guard server-side**.

---

## PARTE 6 — Seguridad
- Fase 1: `EmployeesController` con `@Roles('ADMIN')`. **Ningún** endpoint del módulo accesible a VENDEDOR ni a empleados-usuarios. Aunque un `Employee` tenga `userId`, ese user NO ve nada todavía.
- Portal futuro (no ahora): endpoints tipo `/me/employee/...` que **derivan `employeeId` de `req.user.id → Employee.userId`** y filtran server-side; nunca aceptan `employeeId` del request. Un empleado jamás ve datos de otro. Se diseña el modelo para esto desde ya (relación `Employee.userId` unique).

---

## PARTE 7 — Migraciones, riesgos, archivos a tocar
- **Migraciones (Prisma):** varias tablas + enums nuevos. Reglas: identificadores **entre comillas dobles**, **sin statements duplicados**, timestamp posterior al último (`20260809010000`), revisar SQL a mano. La API migra al arrancar en Railway → una migración rota tira prod (ver `SYSTEM_OVERVIEW.md`). Idealmente aplicar en pocas migraciones limpias.
- **Sin paquetes de workspace nuevos** → todo en `apps/api` (controller + servicios), `apps/web` (vista), `packages/database` (schema/migraciones), `packages/contracts` (zod). No toca Dockerfiles.
- **Archivos a modificar (estimado):** `packages/database/prisma/schema.prisma` (+ migraciones + seed opcional), `packages/contracts/src/index.ts`, `apps/api/src/employees.ts` (nuevo) + registro en `apps/api/src/module.ts`, `apps/web/lib/types.ts`, `apps/web/components/EmployeesView.tsx` (nuevo) + item de nav en `apps/web/components/App.tsx`. Reuso: `infrastructure.ts` (guards), `money.ts`, `shared.tsx`.
- **Riesgos:** (a) redondeo de %/dinero → definir regla y testear; (b) consistencia del saldo → todo con `db.$transaction`; (c) no duplicar contabilidad (saldo = libro); (d) migraciones en prod; (e) no filtrar datos de empleados a no-admins.

---

## PARTE 8 — Plan de implementación por fases (ajustado a la arquitectura real)
- **FASE 0 (este doc):** auditoría + diseño. ✅ *Requiere tu aprobación / respuestas a C1 y al redondeo salarial.*
- **FASE 1 — Auth/roles:** **no requiere refactor.** Solo confirmar que el módulo usa `@Roles('ADMIN')` y `@CurrentUser()`. (Opcional: dejar preparada la derivación `User→Employee` como helper, sin exponer portal.)
- **FASE 2 — Modelo de datos:** `Employee`, `SalaryRecord`, `Movement`, `Obligation`, `InstallmentPlan/Installment`, `Payment/PaymentAllocation`, `EmployeeRequest` + enums + migraciones. Mostrar/aplicar tras tu OK.
- **FASE 3 — Backend:** servicios + endpoints (Parte 4) con validación, autorización y `$transaction`.
- **FASE 4 — UI admin base:** lista, detalle, saldo, movimiento rápido, historial, pagos.
- **FASE 5 — Sueldos:** vigente + historial + actualización masiva % (preview/confirm) + período.
- **FASE 6 — Deudas/cuotas/pagos:** total/parcial, múltiples pagos, cuotas, consumos, mercadería, adelantos.
- **FASE 7 — Solicitudes:** modelo + administración (aprobar/rechazar/modificar). UI del empleado deshabilitada.

---

## Preguntas para vos antes de avanzar
1. **Locales por empleado:** ¿alcanza con **un** local por empleado (como el sistema hoy), o necesitás varios desde el inicio? (C1)
2. **Redondeo del ajuste salarial:** ¿al **centavo** exacto, o a un **paso de pesos** (ej. redondear a $1.000, como sugiere tu ejemplo $1.021.000)? Hay helper para ambos.
3. **Liquidación de período (Fase 5):** ¿la querés como herramienta de propuesta+confirmación (recomendado), o por ahora solo cargar movimientos sueltos?
4. ¿Confirmás el diseño de **saldo único = suma del libro de movimientos** (con obligaciones/pagos como generadores, sin doble contabilidad)?

Con tu OK a esto (y las respuestas), arranco por FASE 2 (modelo) mostrándote el schema antes de migrar.
