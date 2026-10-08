import {Controller, Get, Module} from '@nestjs/common';
import {APP_FILTER, APP_GUARD} from '@nestjs/core';
import {AuthController} from './auth.js';
import {AuthGuard, Public, RateLimitGuard, SpanishExceptionFilter} from './infrastructure.js';
import {CustomerController, PcLineController, ProductsController} from './products.js';
import {CollectionsController, QuotesController, RequestsController} from './quotes.js';
import {CombosController} from './combos.js';
import {FinancingController, SettingsController} from './settings.js';
import {ExtensionSettingsController} from './extension-settings.js';
import {UploadsController} from './uploads.js';
import {CollectionPdfController,PdfController} from './pdf.js';
import {QuoteSearchController} from './search.js';
import {SimilarityController} from './similarity.js';
import {NotificationsController} from './notifications.js';
import {QuoteAiController, RequestAiController} from './ai.js';
import {DashboardController} from './dashboard.js';
import {CatalogController} from './catalog.js';
import {NodoController} from './nodo.js';
import {IvaController} from './iva-memory.js';
import {WebStoreController} from './web-store.js';
import {ChatbotController} from './chatbot.js';
import {CrmRealtimeController} from './crm-realtime.js';
import {CrmController} from './crm.js';
import {BotTrainingController} from './bot-training.js';
import {CrmPipelineController} from './crm-pipeline.js';
import {CrmFollowupsController} from './crm-followups.js';
import {CrmReportsController} from './crm-reports.js';
import {ThumbnailAiController} from './thumbnail-ai.js';
import {BranchesController, UsersController} from './users.js';
import {ExternalModuleController} from './external-module.js';
import {EmployeesController} from './employees.js';
import {ExpensesController} from './expenses.js';
import {EmployeePortalController} from './employee-portal.js';
import {MePreferencesController} from './me-preferences.js';
import {CalculatorController} from './calculator.js';
import {WhatsappController} from './whatsapp.js';

@Controller()
class HealthController {
  @Public()
  @Get('health')
  health() {
    return {status: 'ok', time: new Date().toISOString()};
  }
}

@Module({
  controllers: [
    HealthController,
    ExternalModuleController,
    AuthController,
    SettingsController,
    ExtensionSettingsController,
    UploadsController,
    FinancingController,
    ProductsController,
    CustomerController,
    PcLineController,
    CombosController,
    QuoteSearchController,
    QuotesController,
    PdfController,
    CollectionPdfController,
    QuoteAiController,
    RequestAiController,
    CollectionsController,
    RequestsController,
    NotificationsController,
    DashboardController,
    SimilarityController,
    CatalogController,
    NodoController,
    IvaController,
    WebStoreController,
    ChatbotController,
    CrmRealtimeController,
    CrmController,
    BotTrainingController,
    CrmPipelineController,
    CrmFollowupsController,
    CrmReportsController,
    ThumbnailAiController,
    UsersController,
    BranchesController,
    EmployeesController,
    ExpensesController,
    EmployeePortalController,
    MePreferencesController,
    CalculatorController,
    WhatsappController,
  ],
  providers: [
    {provide: APP_GUARD, useClass: RateLimitGuard},
    {provide: APP_GUARD, useClass: AuthGuard},
    {provide: APP_FILTER, useClass: SpanishExceptionFilter},
  ],
})
export class AppModule {}

