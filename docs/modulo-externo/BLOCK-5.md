# BLOCK-5 — Fase 3: Miniatura (plantillas + compositing + Higgsfield opcional)

> Generar la miniatura cuadrada de un producto: recorte real del producto (imagen sin fondo) compuesto sobre una plantilla (con reglas + tipografías), usando `sharp` (determinístico). Fondo generado por Higgsfield = opcional/configurable (aislado; si no hay key/impl, se usa la plantilla).
>
> Español. NO romper nada. Secretos nunca en respuestas/logs. Reusa el modelo `ThumbnailTemplate` (ya existe) + `@tgs/storage`.

## LECCIONES DEL INCIDENTE (obligatorias)
- Migración (si hace falta): comillas dobles, timestamp posterior a `20260808030000`, **sin duplicados**. `ThumbnailTemplate` YA existe (no recrear); solo agregar campos si hiciera falta.
- NO agregar paquetes de **workspace** nuevos. `sharp` sí (dep npm en `apps/api`, ya está pre-aprobado en `onlyBuiltDependencies`) — NO corras `pnpm install`, lo corro yo.
- Archivos UTF-8 válido. Verificar `pnpm build` verde.

## Alcance
1. CRUD de `ThumbnailTemplate` (plantillas + reglas + tipografías).
2. Compositing con `sharp` en la API.
3. Endpoint para generar la miniatura de un producto con una plantilla.
4. Higgsfield: cliente aislado + opción de fondo generado (best-effort; si falla/no hay key, usar la plantilla). NO frenar el resto por Higgsfield.
5. UI: tab "Miniatura" (reemplaza el placeholder "Plantillas").

## 1. `ThumbnailTemplate` (ya existe: id, name, templateImageUrl, templateKey, fontsJson, rulesJson, active)
Definir la forma de `rulesJson` (documentar en el schema zod de contracts):
```
{ width:number, height:number,            // ej. 1080 x 1080
  background: { type:'template'|'color', color?:string },
  product: { x:number, y:number, w:number, h:number },   // caja donde va el recorte (contain)
  texts: [ { source:'title'|'literal', value?:string, x:number, y:number, fontSize:number, color:string, fontFamily?:string, align?:'left'|'center'|'right' } ] }
```
Endpoints:
- `GET  external-module/thumbnail-templates` → lista.
- `POST external-module/thumbnail-templates` (JSON: name, rules) → crea.
- `POST external-module/thumbnail-templates/:id/image` (multipart) → sube imagen de plantilla a R2, set templateImageUrl/templateKey.
- `PUT  external-module/thumbnail-templates/:id` (JSON: name?, rules?, active?, fonts?) → update.
- `DELETE external-module/thumbnail-templates/:id` → borra (best-effort borrar imagen R2).
Validar `rules` con zod (contracts). Auth normal, jsonSafe, audit `entityType:'ThumbnailTemplate'`.

## 2. Compositing con `sharp` (nuevo archivo en apps/api, ej. `thumbnail-render.ts`)
`renderThumbnail(opts:{ rules, backgroundBuffer:Buffer|null, productBuffer:Buffer, texts:{...resueltos...} }): Promise<Buffer>` (PNG o JPEG):
- Base: canvas `width×height`. Fondo: si `background.type==='color'` → fondo sólido; si `'template'` y hay `backgroundBuffer` → resize cover al canvas; si no hay → color por defecto.
- Producto: resize `productBuffer` a `contain` dentro de la caja `product` (respetando transparencia PNG) y componer en `{x,y}`.
- Textos: renderizar cada texto como overlay SVG (sharp compone un buffer SVG) con `fontSize`/`color`/`align`. Tipografías custom = best-effort (si es complejo, usar familias estándar y dejar el hook para fuentes; NO romper). El `source:'title'` toma el título pasado; `literal` usa `value`.
- Salida: JPEG calidad ~90 (cuadrada).
`sharp` como dep de `apps/api/package.json`.

## 3. Generar miniatura de un producto
`POST external-module/products/:productId/thumbnail` JSON `{ templateId, title?, useHiggsfield?:boolean, higgsfieldPrompt?:string }`:
- Carga la imagen **principal** (ProductAsset con isPrimary, o la más reciente READY) del producto → su `url` (recorte sin fondo). Descarga esos bytes.
- Carga la plantilla + su imagen (si `templateImageUrl`).
- Fondo: si `useHiggsfield` y hay key + impl → generar fondo (sección 4); si falla o no hay → usar la imagen de plantilla.
- `renderThumbnail(...)` → sube a R2 (`thumbnails/{productId}/{uuid}.jpg`) → devuelve `{ url }`. (No hace falta persistir un modelo nuevo; Fase 5 tomará esta url para la publicación.)

## 4. Higgsfield (aislado, opcional)
- `packages/providers/src/higgsfield.ts`: `getHiggsfieldKey()` (lee `higgsfieldKeyEnc`, y secret si aplica) y `generateBackground(prompt, size, key/secret): Promise<Buffer>`.
- Como la API pública de Higgsfield es incierta: dejá la llamada AISLADA y claramente comentada con la mejor conjetura del endpoint; si responde error o no está configurado, que lance un error claro en español que el endpoint de sección 3 **captura** para caer de nuevo a la plantilla (no romper el flujo).
- Exportar desde `@tgs/providers`.

## 5. UI: tab "Miniatura"
- Reemplazar el placeholder de la tab `'plantillas'` (o agregá `'miniatura'`) con:
  - **Plantillas**: lista, crear (nombre + reglas como JSON en textarea al principio), subir imagen de plantilla, activar/borrar.
  - **Generar**: selector de producto (reusar patrón de otras tabs) + selector de plantilla + input título + checkbox "usar fondo Higgsfield" (+ prompt) → botón Generar → **preview** de la miniatura (img) con opción de regenerar.
- Loading/error, componentes compartidos, botones `btn-dark`/`btn-ghost`/`btn-sm`, Alert tone `'error'|'ok'|'info'`. UTF-8.

## Verificación (obligatoria)
1. `pnpm db:generate` ok (si tocaste schema).
2. Migración (si hay): comillas, sin duplicados, timestamp.
3. `pnpm build` verde (Next puede fallar por `spawn EPERM` del sandbox; lo corro yo). Como agregás `sharp` a la API, el build necesita `pnpm install` que corro yo afuera. Asegurá typecheck de api/web/contracts/providers.
NO commit / NO push. Resumen: archivos, endpoints, migración (si hay), dep npm agregada, y pendientes.
