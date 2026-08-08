# Módulo Externo — Plan maestro

> Publicación de presupuestos como landings-producto en WordPress/WooCommerce, con pipeline de assets (imágenes sin fondo, 3D de gabinete, miniaturas) y enriquecimiento por IA.
> Estado: **planificación**. Construcción de código se delega a **Codex MCP**; Claude orquesta y revisa.

## 0. Principios (no negociables)

1. **Plataforma = sistema de verdad. WordPress = escaparate + carrito.** Entre ambos viajan **links y JSON**, nunca binarios.
2. **Assets reutilizables por producto del catálogo**, no por presupuesto:
   - Imagen sin fondo → asociada a `Product`.
   - Modelo 3D / spin → asociado al **producto-gabinete**.
   - Se generan una vez y se reusan en todos los presupuestos que los usen.
3. **Nada de datos inventados en claims de dinero/rendimiento.** Potencia = cálculo determinístico; FPS = buckets estimados con disclaimer; el LLM solo redacta.
4. **Imágenes con copyright**: priorizar oficiales/propias; web (Serper) solo como sugerencia con aprobación manual.
5. Idioma español, ARS, dinero en centavos (nunca float). Zona America/Argentina/Buenos_Aires.

## 1. Arquitectura

```
[Editor de presupuesto] --"Enviar a la web"--> [Módulo Externo (API)]
        |                                              |
        |  serializa QuoteVersion + QuoteItem          |  jobs async (apps/worker)
        v                                              v
 [Payload JSON] <---- assets (URLs) ---- [R2/S3]  <--- Photoroom / Tripo / Higgsfield / OpenAI / Serper
        |
        v  HTTP + HMAC
 [Plugin WordPress] --> crea/actualiza Producto Woo (solo links + meta) --> Landing block-based
```

- **Storage**: Cloudflare R2 (S3-compatible) reutilizando el driver S3 existente (`PDF_STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`).
- **Jobs async**: procesos largos (bg removal, 3D, miniatura, IA) corren en `apps/worker` con estado (`PENDING/RUNNING/DONE/FAILED`) y reintentos.
- **Config del módulo**: keys cifradas (patrón `encryptSecret`/`SETTINGS_ENC_KEY`), plantillas, layout.

## 2. Entidades nuevas (nuestra DB)

| Entidad | Clave / asociación | Campos núcleo |
|---------|--------------------|---------------|
| `ProductAsset` | por `Product` | tipo (IMAGE_NOBG), sourceUrl, r2Url, status, origen (UPLOAD/SERPER/OFFICIAL), approved |
| `CaseModel3D` | por producto-gabinete | sourcePhotos[4], glbUrl, spinUrl, status, tripoJobId, meshStats |
| `ThumbnailTemplate` | config módulo | nombre, plantillaUrl, tipografías, reglas (tamaño, safe areas, posición producto, tokens de color) |
| `WebPublication` | por `QuoteVersion` | wpProductId, url, estado (DRAFT/PUBLISHED/UNPUBLISHED), payloadSnapshot, thumbnailUrl, publishedAt |
| `ModuleConfig` | singleton | keys cifradas (Photoroom/Tripo/Higgsfield/Serper/R2), wpBaseUrl, wpHmacSecret, landingLayout (JSON), pricePolicy |

## 3. Superficie de configuración interna del módulo (tabs dentro de la vista)

- **Conexiones**: API keys (Photoroom, Tripo, Higgsfield, Serper) + R2 + WordPress (URL, secreto HMAC). Test de conexión por cada una.
- **Plantillas de miniatura**: subir plantillas de ejemplo, tipografías, definir reglas; preview.
- **Layout de landing**: bloques, orden, visibilidad, posición del add-to-cart, tokens de estilo.
- **Almacenamiento**: bucket R2, prefijos, límites.

## 4. Contrato de datos (platform → WordPress)

```jsonc
{
  "externalId": "quoteVersionId",
  "slug": "...", "title": "...",
  "price": { "listCents": 0, "cashCents": 0, "transferCents": 0, "currency": "ARS" },
  "installmentPlans": [{ "bank": "...", "installments": 3, "interestBps": 0, "totalCents": 0 }],
  "items": [{ "name": "...", "imageUrl": "https://r2/...", "specs": {} }],
  "model3dUrl": "https://r2/....glb",
  "spinUrl": null,
  "thumbnailUrl": "https://r2/....jpg",
  "gallery": ["https://r2/..."],
  "descriptionHtml": "...",
  "powerWatts": 0, "recommendedPsuWatts": 0,
  "compatibility": ["..."],
  "games": [{ "name": "...", "tierEstimado": "1080p Alto ~estimado" }],
  "category": "...", "tags": ["..."],
  "layout": { /* orden/visibilidad/posición de bloques + tokens */ }
}
```

## 5. Fases

### Fase 0 — Fundaciones
- Entidades DB + migraciones (sección 2).
- Vista del módulo con tabs de config (sección 3); keys cifradas.
- Infra de jobs async en `apps/worker` con estado + reintentos.
- Storage R2 operativo (reusar driver S3).
- **Bloqueadores**: credenciales R2.

### Fase 1 — Imágenes de producto sin fondo
- Subir imagen propia / elegir sugerencia de Serper (con aprobación) / marcar “ya sin fondo”.
- Photoroom: quitar fondo + realce. **Preview + botón confirmar** (o cargar directo sin fondo).
- Guardar en R2, asociar a `Product` (reutilizable).
- **Bloqueadores**: key Photoroom, key Serper, postura copyright.

### Fase 2 — Pipeline 3D del gabinete
- Subir 4 fotos → Photoroom (limpieza) → **Tripo Multiview** → GLB.
- Optimizar (glTF-Transform + Meshoptimizer) → R2.
- Asociar a `CaseModel3D` (por gabinete, reutilizable). Preview con `<model-viewer>`; estado del job; re-generar.
- **Bloqueadores**: key Tripo.

### Fase 3 — Miniatura (plantillas + reglas + Higgsfield)
- Config de plantillas: subir ejemplos, tipografías, reglas (cuadrada, safe areas, posición producto, tokens).
- Componer **recorte real** del gabinete + **fondo Higgsfield** según plantilla elegida.
- Preview + regenerar + elegir; asociar a `WebPublication`.
- **Bloqueadores**: key Higgsfield (¿API disponible en tu plan?), plantillas + tipografías.

### Fase 4 — Enriquecimiento IA
- Serializar presupuesto → items + specs + precios (ya en DB).
- **Descripción**: OpenAI (prosa).
- **Potencia**: cálculo determinístico por tabla TDP (CPU+GPU+overhead) → watts + PSU recomendada.
- **Rendimiento**: buckets estimados por tier de GPU/CPU con disclaimer (juegos/programas). LLM redacta, no inventa números.
- Todo **editable** antes de publicar.
- **Bloqueadores**: ninguno nuevo (OpenAI ya configurado).

### Fase 5 — Plugin WordPress + publicación
- Plugin instalable, **descargable como `.zip` desde config** (patrón extensión Chrome).
- Endpoint REST autenticado (HMAC + secreto). Crea/actualiza **Producto Woo**; guarda links + meta; sin binarios.
- Plantilla landing **block-based** desde `layout` config: hero 3D, galería, price box (efectivo/transferencia/cuotas), **add-to-cart sticky** (arriba + barra flotante), specs, descripción, potencia, juegos, compatibilidad.
- Botón **“Enviar a la web”** en el editor → payload → publica → guarda `WebPublication`.
- **Bloqueadores**: Woo confirmado, URL/PHP/tema, política de precio (snapshot vs republicar), secreto HMAC.

### Fase 6 — Editor visual de layout (“100% nuevo / posicionable”)
- Editor en el módulo para reordenar/togglear/posicionar bloques y estilos, con **preview en vivo**, reflejado en la plantilla del plugin vía `layout` config.
- (En Fase 5 arrancamos con orden/visibilidad/tokens; acá el drag-drop visual completo.)

### Fase 7 — Operación
- Republicar al cambiar precio/datos; despublicar/borrar; versión; estado en el editor.
- Auditoría, costo por presupuesto, reintentos, observabilidad de jobs.

## 6. Decisiones abiertas / lo que se necesita del usuario

1. **WordPress**: ¿ya es WooCommerce? URL prod, versión WP/PHP, tema (¿Impreza?), ¿checkout/pago ya funciona (Mercado Pago)?
2. **API keys que ya existen vs a sacar**: Photoroom, Tripo, Higgsfield (¿API en el plan?), Serper, R2.
3. **Precio en Woo**: snapshot fijo al publicar vs republicar en cambios. ARS confirmado.
4. **Copyright imágenes**: solo oficiales/propias, o web (Serper) con aprobación manual.
5. **Plantillas de miniatura**: ¿existen ya (plantilla + tipografías) o se diseñan?

## 7. Riesgos conocidos

- **Calidad Tripo** en gabinetes negros/vidrio/RGB: variable. Mitigación: preview + re-generar + fotos guiadas.
- **Higgsfield** puede no representar el producto real → por eso el gabinete es recorte real, el fondo es lo generado.
- **Claims de FPS/potencia**: nunca exactos por LLM; buckets + disclaimer.
- **Serper/copyright**: aprobación manual obligatoria antes de publicar.
- **Costos por presupuesto**: amortizados por reutilización de assets por producto.
