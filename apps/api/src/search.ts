import {Controller, Get, Query} from '@nestjs/common';
import {quoteSearchSchema, type QuoteSearchInput} from '@tgs/contracts';
import {ZodPipe} from './infrastructure.js';
import {searchQuotePage} from './quote-list.js';

/**
 * `GET /quotes/search`. Registrado como controller separado (`quotes/search`) para que Nest nunca
 * lo confunda con `GET /quotes/:id` sin depender del orden de declaración de rutas.
 *
 * Filtra y pagina en la base, sobre la versión activa. No carga el historial de versiones ni
 * el JSON de los PDF: eso es lo que hacía tardar minutos el listado (modo normal y LITE).
 */
@Controller('quotes/search')
export class QuoteSearchController {
  @Get()
  async search(@Query(new ZodPipe(quoteSearchSchema)) query: QuoteSearchInput) {
    return searchQuotePage(query);
  }
}
