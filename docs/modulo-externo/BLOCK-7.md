# BLOCK-7 — Fase 6: Editor de layout de la landing (bloques configurables)

> Un `layout` (orden + visibilidad de bloques + tokens de estilo) editable en el módulo, guardado en la config, incluido en el payload de publish, y renderizado por el plugin según esa config. Base del "100% posicionable".
>
> Español. NO romper nada. Reusa `ExternalModuleConfig`. Secretos nunca en respuestas/logs.

## LECCIONES DEL INCIDENTE (obligatorias)
- Migración: comillas dobles, timestamp posterior a `20260808030000`, **sin duplicados**. Es un `ALTER TABLE "ExternalModuleConfig" ADD COLUMN`.
- NO paquetes de workspace nuevos. Archivos UTF-8. `pnpm build` verde.

## Alcance
1. Campo `landingLayoutJson` en `ExternalModuleConfig` + migración.
2. Schema del layout (contracts) + endpoints GET/PUT del layout.
3. Incluir `layout` en el payload de publish (BLOCK-6) y en el meta del producto (`_tgs_layout`).
4. Plugin: renderizar la landing según el `layout` (orden/visibilidad/tokens).
5. UI: tab "Layout de landing" con editor (reordenar, mostrar/ocultar, tokens) + preview aproximado.

## 1. Schema del layout
Bloques disponibles (type): `hero3d`, `gallery`, `priceBox`, `addToCartSticky`, `specs`, `description`, `power`, `games`, `compatibility`.
Forma (zod `.strict()` en contracts, `landingLayoutSchema`):
```
{ version: 1,
  tokens: { accent:string, bg:string, text:string, radius:number, font?:string },
  blocks: [ { type: <uno de los de arriba>, visible: boolean } ]   // el ORDEN del array = orden de render
}
```
Default (si no hay guardado): todos los bloques visibles en un orden sensato (hero3d, priceBox, addToCartSticky arriba, gallery, specs, description, power, games, compatibility) + tokens por defecto (acento rojo TGS `#E31B23`, etc.). Definí una constante `DEFAULT_LANDING_LAYOUT`.

## 2. Backend
- Migración: `ALTER TABLE "ExternalModuleConfig" ADD COLUMN "landingLayoutJson" JSONB;` (nullable; si es null se usa el default).
- Endpoints en `ExternalModuleController`:
  - `GET external-module/landing-layout` → devuelve el layout guardado o `DEFAULT_LANDING_LAYOUT`.
  - `PUT external-module/landing-layout` (`@Body ZodPipe(landingLayoutSchema)`) → guarda en `ExternalModuleConfig.landingLayoutJson`. Audit `entityType:'ExternalModuleConfig'`.
- En `POST quotes/:v/publish` (BLOCK-6): incluir `layout` (el guardado o default) en el payload que se manda al plugin.

## 3. Plugin (WordPress)
- En `tgs_sq_publish` (rest.php): guardar `_tgs_layout` = `wp_json_encode($p['layout'] ?? [])`.
- En `templates/single-landing.php` + `includes/render.php`: leer `_tgs_layout`; si tiene `blocks`, renderizar los bloques **en ese orden** y solo los `visible`. Aplicar `tokens` como CSS variables inline en el contenedor raíz (`--tgs-accent`, `--tgs-bg`, `--tgs-text`, `--tgs-radius`) y usarlas en `tgs-landing.css`. Si no hay layout, usar el orden por defecto actual. Mantener escaping.

## 4. UI: tab "Layout de landing"
- Reemplazar el placeholder de la tab `'layout'`.
- Cargar `GET external-module/landing-layout`.
- Editor:
  - Lista de bloques en orden, cada uno con: nombre, checkbox visible, botones **subir/bajar** (reordenar el array).
  - Tokens: inputs (color accent/bg/text, radius, font opcional).
  - Botón **Guardar** (PUT).
  - **Preview aproximado**: un recuadro que muestre los bloques visibles en orden con los colores (no hace falta que sea pixel-perfect; una maqueta con los tokens aplicados).
- Loading/error, componentes compartidos, botones `btn-dark`/`btn-ghost`/`btn-sm`, Alert tone `'error'|'ok'|'info'`. UTF-8.

## Verificación (obligatoria)
1. `pnpm db:generate` ok.
2. Migración: comillas, sin duplicados, timestamp posterior.
3. `pnpm build` verde (Next puede fallar por `spawn EPERM` del sandbox; lo corro yo). Typecheck api/web/contracts.
4. Revisar el PHP a mano (orden/visibilidad/escaping).
NO commit / NO push. Resumen: archivos, endpoints, migración, y pendientes.
