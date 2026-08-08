# BLOCK-4 — Fase 4: Enriquecimiento del presupuesto

> Traducir un presupuesto a items+precios estructurados (texto, no PDF), y enriquecerlo: descripción con IA, estimación de potencia (determinística), y rendimiento en juegos/programas (IA, con disclaimer). Todo editable y persistido, listo para que Fase 5 lo publique.
>
> Español, ARS, centavos (BigInt→string con jsonSafe). NO romper nada. Secretos nunca en respuestas/logs.

## LECCIONES DEL INCIDENTE (obligatorias)
- Migración: identificadores entre comillas dobles; timestamp posterior a `20260808020000`; **sin statements duplicados**. Mirrorear una migración existente.
- NO agregar paquetes de workspace nuevos (reusar `@tgs/ai`, `@tgs/database`, etc.) → así no se tocan Dockerfiles.
- Archivos en UTF-8 válido (sin mojibake).
- Verificar `pnpm build` verde.

## Alcance
1. Modelo `QuoteEnrichment` (per `QuoteVersion`, unique) + migración.
2. Serialización del presupuesto (endpoint payload determinístico desde la DB).
3. Descripción + rendimiento con IA vía un service nuevo en `@tgs/ai`.
4. Estimación de potencia determinística (heurística por TDP, marcada "estimado").
5. Endpoints de enriquecimiento (generar por sección + editar) en `ExternalModuleController`.
6. UI: tab "Presupuesto" en el módulo (selector de versión + generar/editar).

## 1. Modelo `QuoteEnrichment`
Per `QuoteVersion` (`quoteVersionId @unique`, onDelete Cascade). Campos:
- descriptionHtml String?
- powerWatts Int?  recommendedPsuWatts Int?  powerNote String?  (texto "estimado")
- gamesJson Json @default("[]")   // [{name, tier}]
- programsJson Json @default("[]")// [{name, note}]
- compatibilityJson Json @default("[]") // [string]
- updatedAt DateTime @default(now()) @updatedAt, createdAt DateTime @default(now())
Migración `<timestamp>_quote_enrichment/migration.sql` (CREATE TABLE + unique index + FK a QuoteVersion). `pnpm db:generate`.

## 2. Serialización del presupuesto
`GET external-module/quotes/:versionId/payload` → arma desde la DB (sin PDF):
- items: de `QuoteItem` de esa versión → `{ name (frozenName), quantity, unitPriceCents, subtotalCents }`.
- precios: `listCents/cashCents/transferCents` según la lógica ya existente del presupuesto (mirar cómo `quotes.ts`/`pdf` resuelven precios efectivo/transferencia/lista; reusar esa lógica, NO reinventar reglas de dinero).
- financiación: de `financingSnapshot` / planes.
Devolver todo con `jsonSafe` (BigInt→string). Este endpoint es la base del payload que Fase 5 mandará a WordPress.

## 3. IA (service nuevo en `@tgs/ai`)
Mirrorear un service existente (`packages/ai/src/services/request-analysis.ts` + `runner.ts` + `client.ts` + `schemas.ts`): crear `services/quote-enrichment.ts` que, dado el resumen de items del presupuesto, devuelve validado con zod:
```
{ descriptionHtml: string, games: {name:string, tier:string}[], programs: {name:string, note:string}[], compatibility: string[] }
```
- Prompt en español, tono comercial para The Gamer Shop. Para juegos/programas: **estimaciones cualitativas con disclaimer** (ej. tier "1080p Alto (estimado)"), NUNCA FPS exactos inventados.
- Reusar el runner con cache/costos (AiRequest) igual que los demás services. Key/model desde AiSettings (ya configurado).
Exportar el service desde `@tgs/ai`.

## 4. Potencia (determinística)
Helper `estimatePower(items: {name:string; quantity:number}[]): {watts:number; recommendedPsuWatts:number; note:string}`:
- Tabla chica de TDP por patrones de GPU/CPU comunes (regex sobre el nombre): p.ej. RTX 40/30 series, RX 7000/6000, Ryzen, Core i, con un TDP aproximado; sumar TDP de CPU+GPU + un overhead fijo (placa/discos/fans ~150W). `recommendedPsuWatts` = redondeo hacia arriba de `watts*1.4` a múltiplos de 50.
- Si no matchea nada, `watts` conservador y `note` aclarando que es aproximado. `note` SIEMPRE incluye "estimado".
- Ubicarlo donde sea testeable (p.ej. un archivo en la API o en `@tgs/pricing` si encaja). Es heurístico y aproximado: dejarlo claro en el `note`. No inventar cifras exactas de rendimiento.

## 5. Endpoints (`ExternalModuleController`)
- `GET  quotes/:versionId/payload` (sección 2).
- `GET  quotes/:versionId/enrichment` → devuelve el `QuoteEnrichment` (o null).
- `POST quotes/:versionId/enrich` → corre IA (sección 3) + potencia (sección 4) sobre los items del presupuesto y hace upsert del `QuoteEnrichment`. Devuelve el enrichment.
- `PUT  quotes/:versionId/enrichment` → edición manual (todos los campos), con zod. Upsert.
Validar que la versión exista. Auth normal, jsonSafe, audit `entityType:'QuoteEnrichment'`.

## 6. Contracts
Schemas `.strict()` para el PUT del enrichment (descriptionHtml?, powerWatts?, recommendedPsuWatts?, powerNote?, games?, programs?, compatibility?) + tipos.

## 7. UI: tab "Presupuesto"
- Agregar tab `'presupuesto'` (sin romper las existentes).
- Selector de presupuesto/versión: reusar la API existente de quotes para listar (mirar qué endpoint lista versiones; si es complejo, pedir un id de versión por input y traer el payload). Mantenerlo simple.
- Mostrar el payload (items + precios). Botón **"Generar enriquecimiento (IA + potencia)"** → POST enrich. Mostrar descripción, potencia, juegos, programas, compatibilidad, **todo editable** (textarea/inputs) y **Guardar** (PUT).
- Loading/error, componentes compartidos, botones `btn-dark`/`btn-ghost`/`btn-sm`, Alert tone `'error'|'ok'|'info'`. UTF-8 válido.

## Verificación (obligatoria)
1. `pnpm db:generate` ok.
2. Migración: comillas, sin duplicados, timestamp correcto.
3. `pnpm build` verde (Next puede fallar por `spawn EPERM` del sandbox; lo corro yo). Typecheck de ai/api/web/contracts.
NO commit / NO push. Resumen: archivos, endpoints, migración, service de IA agregado, y pendientes.
