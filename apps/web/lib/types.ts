export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: "ADMIN" | "VENDEDOR";
  branchId: string | null;
};

export type Product = {
  id: string;
  name: string;
  costCents: string;
  salePriceCents: string;
  markupBps: number;
  usesGeneralMarkup: boolean;
  defaultLineId: string | null;
  active: boolean;
  lastUsedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  defaultLine?: PcLine | null;
};

export type ProductQuoteUsage = {
  familyId: string;
  visibleNumber: string;
  internalName: string;
  customerName: string | null;
  version: number;
  state: string;
  quantity: number;
  usedAt: string;
};

export type ComboItem = {
  id?: string;
  productId: string;
  quantity: number;
  position: number;
  product?: Pick<
    Product,
    "id" | "name" | "active" | "costCents" | "salePriceCents" | "markupBps" | "defaultLineId"
  > | null;
};

export type Combo = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sortOrder: number;
  items: ComboItem[];
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  dni: string | null;
};

export type PcLine = {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
  aliases: string[];
  keyLine: boolean;
  concept: "CPU" | "MOTHERBOARD" | "GPU" | "OTHER";
};

export type CompanySettings = {
  id: "singleton";
  logoUrl: string | null;
  name: string;
  taxCondition: string;
  cuit: string;
  grossIncome: string;
  activityStart: string;
  address: string;
  phones: string;
  footerText: string;
  rmaUrl: string;
  primaryColor: string;
  accentColor: string;
  listInterestBps: number;
  updatedAt?: string;
};

export type Branding = {
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
};

export type PdfSettings = {
  id: "singleton";
  template: "CLASICO" | "MODERNO";
  financingBbvaNote: string | null;
  validityDays: number | null;
  showListPrice: boolean;
  showCashTransfer: boolean;
  showFinancing: boolean;
  showBbva: boolean;
  showOtherBanks: boolean;
  showFinancingNote: boolean;
  showTaxData: boolean;
  showServicesBlock: boolean;
  showWindows: boolean;
  showDrivers: boolean;
  showDelay: boolean;
  showRma: boolean;
  showExtraObservation: boolean;
  showIndividualPrices: boolean;
  showComponentDetail: boolean;
  builtPcTitle: string;
  builtPcDescription: string;
  assemblyText: string;
  installText: string;
  windowsText: string;
  driversText: string;
  estimatedDelay: string;
  rmaText: string;
  lineOrder: string[];
  updatedAt?: string;
};

export type PdfLayoutBlockKey =
  | "logo" | "companyName" | "companyTaxData" | "quoteTitle" | "quoteMeta"
  | "quoteData" | "companyFiscalData" | "servicesBlock" | "itemsTable"
  | "itemsTable.colCode" | "itemsTable.colName" | "itemsTable.colQty"
  | "itemsTable.colAmount" | "totalsBlock" | "financingBlock"
  | "observation" | "rmaBlock" | "footerText";
export type PdfLayoutStyle = {
  x?: number; y?: number; width?: number; height?: number; fontSize?: number;
  color?: string; fontFamily?: string; fontWeight?: number;
};
export type PdfLayoutConfig = {
  version: 1;
  blocks: Partial<Record<PdfLayoutBlockKey, PdfLayoutStyle>>;
};
export type PdfLayoutSettings = {
  id: "singleton";
  layout: PdfLayoutConfig;
  updatedAt?: string;
};

export type AiSettings = {
  id: "singleton";
  enabled: boolean;
  model: string;
  apiKeyMasked: string | null;
  hasKey: boolean;
  analysisEnabled: boolean;
  similarityEnabled: boolean;
  compatibilityEnabled: boolean;
  responsesEnabled: boolean;
  ambiguousSimilarityAi: boolean;
  monthlyBudgetUsdCents: string | null;
  generalMarkupBps: number;
  productSimilarityThreshold: number;
  frequentSupportThreshold: number;
  updatedAt?: string;
};

export type ChatbotMode = "OFF" | "SUGGEST" | "AUTO";
export type ChatbotResponseEntry = {
  id: string;
  enabled: boolean;
  activators: string[];
  similarityThreshold: number;
  answer: string;
  context: string;
  attachments: {
    imageUrl: string | null;
    url: string | null;
    quote: {familyId: string; version: number | null; useLatest: boolean} | null;
  };
};
export type ChatbotSettings = {
  id: "singleton";
  enabled: boolean;
  defaultMode: ChatbotMode;
  model: string | null;
  persona: string;
  openingMessages: string[];
  closingMessages: string[];
  responses: ChatbotResponseEntry[];
  escalationKeywords: string[];
  escalationInstructions: string;
  modelCanEscalate: boolean;
  businessHours: {
    enabled: boolean;
    timezone: string;
    schedule: Record<
      "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
      Array<{ from: string; to: string }>
    >;
  };
  outsideHoursBehavior: { mode: "OFF" | "STALL" | "NORMAL"; message: string };
  responseStyle: {
    length: "SHORT" | "MEDIUM" | "DETAILED";
    maxCharacters: number;
    emoji: "NONE" | "SPARING" | "NATURAL";
    paragraphs: "COMPACT" | "SHORT" | "FREE";
    avoidRepetition: boolean;
  };
  ignoredAutoMessages: string[];
  autoDelayMaxSeconds: number;
  reuseSimilarityThreshold: number;
  recontactEnabled: boolean;
  recontactDays: number;
  recontactPrompt: string;
  recontactMaxAttempts: number;
  scanIntervalSeconds: number;
  maxRecentSnippets: number;
  summaryRefreshEvery: number;
  sendConfirmationTimeoutMs: number;
  updatedAt?: string;
};

export type FinancingPlan = {
  id: string;
  installments: number;
  interestBps: number;
  bank: string | null;
  description: string | null;
  active: boolean;
  sortOrder: number;
};

export type QuoteItem = {
  id?: string;
  productId: string | null;
  name: string;
  lineId: string | null;
  quantity: number;
  costCents: string;
  markupBps: number;
  salePriceCents?: string;
  frozenCostCents?: string;
  frozenMarkupBps?: number;
  frozenSalePriceCents?: string;
  frozenName?: string;
  subtotalCents?: string;
  position: number;
  observation?: string | null;
};

export type QuoteState =
  | "BORRADOR"
  | "ENVIADO"
  | "ACEPTADO"
  | "RECHAZADO"
  | "REEMPLAZADO"
  | "NO_CONCRETADO";

export type QuoteVersion = {
  id: string;
  version: number;
  state: QuoteState;
  totalCostCents: string;
  totalSaleCents: string;
  profitCents: string;
  effectiveMarkupBps: number;
  publicObservation: string | null;
  items: QuoteItem[];
  sentAt?: string | null;
  reason?: string | null;
  createdAt?: string;
  creator?: Pick<AuthUser, "id" | "username" | "displayName">;
  pdfs?: QuotePdfRow[];
};

export type QuotePdfRow = {
  id: string;
  kind: "SIMPLE" | "DETALLADO";
  versionId?: string;
  versionNumber?: number;
  versionState?: QuoteState;
  sizeBytes?: number;
  createdAt: string;
  isActiveVersion?: boolean;
  sha256?: string;
};

export type Quote = {
  id: string;
  visibleNumber: string;
  internalName: string;
  requestId: string | null;
  customerId: string | null;
  isBuiltPc: boolean;
  activeVersion: number;
  customer?: Customer | null;
  request?: QuoteRequest | null;
  version?: QuoteVersion | null;
  activeQuoteVersion?: QuoteVersion | null;
  versions?: QuoteVersion[];
  items?: QuoteItem[];
  collections?: Array<{
    collectionId: string;
    familyId?: string;
    collection?: Collection;
  }>;
};

export type Collection = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  icon: string | null;
  archived: boolean;
  favorite: boolean;
  visibleInExtension: boolean;
  familyIds?: string[];
};

export type RequestState =
  | "PENDIENTE"
  | "EN_PREPARACION"
  | "LISTA"
  | "ENVIADA"
  | "CERRADA";

export type QuoteRequest = {
  id: string;
  title: string;
  originalText: string;
  internalNotes: string;
  customerId: string | null;
  detectedPhone: string | null;
  maximumBudgetCents: string | null;
  expectedUse: string | null;
  requiredComponents: string[];
  assigneeId: string | null;
  state: RequestState;
  customer?: Customer | null;
};

export type NavId =
  | "dashboard"
  | "presupuestos"
  | "productos"
  | "catalogo-acustock"
  | "combos"
  | "clientes"
  | "lineas"
  | "solicitudes"
  | "colecciones"
  | "notificaciones"
  | "editor-pdf"
  | "usuarios"
  | "configuracion";

/** Semilla para abrir el editor de presupuesto desde una solicitud. */
export type QuoteFromRequestSeed = {
  requestId: string;
  customerId: string | null;
  internalName: string;
};

export type TimelineEvent = {
  id: string;
  type: string;
  createdAt: string;
  metadata?: unknown;
  previous?: unknown;
  next?: unknown;
  versionNumber?: number | null;
  description?: string;
  descriptions?: string[];
  creator?: Pick<AuthUser, "id" | "username" | "displayName"> | null;
};

export type DashboardSummary = {
  countsByState: Record<string, number>;
  averageTicket: {
    ACEPTADO: string | null;
    RECHAZADO: string | null;
    NO_CONCRETADO: string | null;
  };
  averageTimes?: {
    requestToReadyMs: number | null;
    sendToAcceptMs: number | null;
  };
  unresolved: number;
};

export function getActiveVersion(quote: Quote): QuoteVersion | null {
  return (
    quote.version ??
    quote.activeQuoteVersion ??
    quote.versions?.find((v) => v.version === quote.activeVersion) ??
    quote.versions?.[0] ??
    null
  );
}

export function getQuoteItems(quote: Quote): QuoteItem[] {
  const version = getActiveVersion(quote);
  if (version?.items?.length) {
    return version.items.map((item, index) => ({
      productId: item.productId ?? null,
      name: item.frozenName ?? item.name,
      lineId: item.lineId ?? null,
      quantity: item.quantity,
      costCents: item.frozenCostCents ?? item.costCents,
      markupBps: item.frozenMarkupBps ?? item.markupBps,
      salePriceCents: item.frozenSalePriceCents ?? item.salePriceCents,
      position: item.position ?? index,
      observation: item.observation ?? null,
      subtotalCents: item.subtotalCents,
    }));
  }
  return quote.items ?? [];
}
