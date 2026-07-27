import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
});
export const loginInputSchema = z
  .object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(1024) })
  .strict();
export const authResponseSchema = z.object({ user: userSchema });
export type LoginInput = z.infer<typeof loginInputSchema>;
export type AuthUser = z.infer<typeof userSchema>;

const text = z.string().trim().min(1);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color hexadecimal inválido');
export const moneyCentsSchema = z
  .string()
  .regex(/^\d+$/, 'Los importes deben ser centavos enteros no negativos');
export const idSchema = z.string().uuid();
const nullableIdSchema = idSchema.nullable().optional();
const nonEmptyUpdate = <T extends z.ZodRawShape>(shape: T) =>
  z
    .object(shape)
    .partial()
    .strict()
    .refine((v) => Object.keys(v).length > 0, 'Se requiere al menos un campo');

export const companySettingsInputSchema = z
  .object({
    logoUrl: z
      .union([z.string().url(), z.literal('')])
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    name: text,
    taxCondition: text,
    cuit: text,
    grossIncome: text,
    activityStart: text,
    address: text,
    phones: text,
    footerText: text,
    rmaUrl: z.string().url(),
    primaryColor: color,
    accentColor: color,
  })
  .strict();
export const companySettingsSchema = companySettingsInputSchema.extend({
  id: z.literal('singleton'),
  updatedAt: z.coerce.date(),
});

export const pdfSettingsInputSchema = z
  .object({
    showListPrice: z.boolean(),
    showCashTransfer: z.boolean(),
    showFinancing: z.boolean(),
    showBbva: z.boolean(),
    showOtherBanks: z.boolean(),
    showFinancingNote: z.boolean(),
    showTaxData: z.boolean(),
    showServicesBlock: z.boolean(),
    showWindows: z.boolean(),
    showDrivers: z.boolean(),
    showDelay: z.boolean(),
    showRma: z.boolean(),
    showExtraObservation: z.boolean(),
    showIndividualPrices: z.boolean(),
    showComponentDetail: z.boolean(),
    builtPcTitle: text,
    builtPcDescription: text,
    assemblyText: text,
    installText: text,
    windowsText: text,
    driversText: text,
    estimatedDelay: text,
    lineOrder: z.array(z.string()),
  })
  .strict();
export const pdfSettingsSchema = pdfSettingsInputSchema.extend({
  id: z.literal('singleton'),
  updatedAt: z.coerce.date(),
});

export const aiSettingsInputSchema = z
  .object({
    enabled: z.boolean(),
    model: text,
    apiKey: z.string().trim().min(1).optional(),
    clearApiKey: z.boolean().optional().default(false),
    analysisEnabled: z.boolean(),
    similarityEnabled: z.boolean(),
    compatibilityEnabled: z.boolean(),
    responsesEnabled: z.boolean(),
    ambiguousSimilarityAi: z.boolean(),
    compatibilityOnSave: z.boolean().optional(),
    intentEnabled: z.boolean().optional(),
    minIntentConfidence: z.number().int().min(0).max(100).optional(),
    defaultTone: z.enum(['AMIGABLE', 'INTERMEDIO', 'TECNICO']).optional(),
    monthlyBudgetUsdCents: z.coerce.bigint().nonnegative().nullable(),
    generalMarkupBps: z.number().int().nonnegative(),
    productSimilarityThreshold: z.number().int().min(0).max(100),
    frequentSupportThreshold: z.number().int().nonnegative(),
  })
  .strict();
export const aiSettingsSchema = aiSettingsInputSchema
  .omit({ apiKey: true, clearApiKey: true })
  .extend({
    id: z.literal('singleton'),
    apiKeyMasked: z.string().nullable(),
    hasKey: z.boolean(),
    updatedAt: z.coerce.date(),
  });
export const aiTestConnectionSchema = z
  .object({
    apiKey: z.string().trim().min(1).optional(),
    model: z.string().trim().min(1).optional(),
  })
  .strict();

const operationsSettingsShape = {
  staleDays: z.number().int().positive(),
  staleNoticeDays: z.number().int().nonnegative(),
  autoStaleEnabled: z.boolean(),
  similarityCpuBps: z.number().int().nonnegative(),
  similarityMotherBps: z.number().int().nonnegative(),
  similarityGpuBps: z.number().int().nonnegative(),
  similarityOtherBps: z.number().int().nonnegative(),
  similarityAmbiguousMin: z.number().int().min(0).max(100),
  similarityAmbiguousMax: z.number().int().min(0).max(100),
};
export const operationsSettingsInputSchema = z
  .object(operationsSettingsShape)
  .strict()
  .refine((v) => v.similarityAmbiguousMin <= v.similarityAmbiguousMax, {
    message: 'El rango ambiguo de similitud es inválido',
  });
export const operationsSettingsSchema = z
  .object({
    ...operationsSettingsShape,
    id: z.literal('singleton'),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const financingInputSchema = z
  .object({
    label: text,
    bank: text,
    installments: z.number().int().positive(),
    coefficientBps: z.number().int().positive(),
    interestFree: z.boolean(),
    appliesOn: z.enum(['LISTA', 'EFECTIVO', 'BASE']),
    note: z.string().nullable(),
    commercialText: z.string().nullable(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict();
export const financingUpdateSchema = financingInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Se requiere al menos un campo');

export const productInputSchema = z.object({ name: text });
export const customerInputSchema = z.object({ name: text });
export const requestInputSchema = z.object({ title: text });
export const quoteInputSchema = z.object({ internalName: text });
export const quoteItemInputSchema = z.object({ name: text });
export const collectionInputSchema = z.object({ name: text });

export type CompanySettingsInput = z.infer<typeof companySettingsInputSchema>;
export type PdfSettingsInput = z.infer<typeof pdfSettingsInputSchema>;
export type AiSettingsInput = z.infer<typeof aiSettingsInputSchema>;
export type OperationsSettingsInput = z.infer<typeof operationsSettingsInputSchema>;
export type FinancingInput = z.infer<typeof financingInputSchema>;

export const productCreateSchema = z
  .object({
    name: text,
    costCents: moneyCentsSchema,
    markupBps: z.number().int().nonnegative(),
    salePriceCents: moneyCentsSchema.optional(),
    usesGeneralMarkup: z.boolean(),
    defaultLineId: nullableIdSchema,
    active: z.boolean().optional().default(true),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export const productUpdateSchema = nonEmptyUpdate(productCreateSchema.shape);
export const productImportSchema = z
  .object({
    rows: z.array(productCreateSchema).min(1).max(5000),
    mode: z.enum(['skip', 'update']).default('skip'),
  })
  .strict();
export const productDuplicateQuerySchema = z.object({ name: text }).strict();
export const productBulkDeleteSchema = z
  .object({
    ids: z.array(idSchema).min(1).max(2000),
  })
  .strict();
export const productMergeSchema = z
  .object({
    keepId: idSchema,
    mergeIds: z.array(idSchema).min(1).max(50),
  })
  .strict()
  .refine((v) => !v.mergeIds.includes(v.keepId), {
    message: 'No se puede unificar un producto consigo mismo',
  });

export const customerCreateSchema = z
  .object({
    name: text,
    phone: z.string().trim().max(100).nullable().optional(),
    dni: z.string().trim().max(50).nullable().optional(),
  })
  .strict();
export const customerUpdateSchema = nonEmptyUpdate(customerCreateSchema.shape);

export const pcLineCreateSchema = z
  .object({
    name: text,
    sortOrder: z.number().int(),
    active: z.boolean().optional().default(true),
    aliases: z.array(z.string().trim().min(1)).default([]),
    keyLine: z.boolean().optional().default(false),
    concept: z.enum(['CPU', 'MOTHERBOARD', 'GPU', 'OTHER']).optional().default('OTHER'),
  })
  .strict();
export const pcLineUpdateSchema = nonEmptyUpdate(pcLineCreateSchema.shape);

export const fieldOverrideSchema = z.enum(['HEREDAR', 'MOSTRAR', 'OCULTAR']);
export const pdfKindSchema = z.enum(['SIMPLE', 'DETALLADO']);
export const quoteStateEnum = z.enum([
  'BORRADOR',
  'ENVIADO',
  'ACEPTADO',
  'RECHAZADO',
  'REEMPLAZADO',
  'NO_CONCRETADO',
]);
export const requestStateEnum = z.enum([
  'PENDIENTE',
  'EN_PREPARACION',
  'LISTA',
  'ENVIADA',
  'CERRADA',
]);
export const sendAttemptStatusSchema = z.enum([
  'PENDIENTE',
  'CONFIRMADO_AUTO',
  'CONFIRMADO_MANUAL',
  'NO_ENVIADO',
  'AMBIGUO',
]);
export const replyIntentSchema = z.enum([
  'ACEPTA',
  'RECHAZA',
  'PIDE_CAMBIO',
  'CONSULTA',
  'AMBIGUA',
]);
export const suggestionToneSchema = z.enum(['AMIGABLE', 'INTERMEDIO', 'TECNICO']);

export const quoteItemCreateSchema = z
  .object({
    productId: nullableIdSchema,
    name: text,
    lineId: nullableIdSchema,
    quantity: z.number().int().positive(),
    costCents: moneyCentsSchema,
    markupBps: z.number().int().nonnegative(),
    salePriceCents: moneyCentsSchema.optional(),
    position: z.number().int().nonnegative(),
    observation: z.string().trim().max(1000).nullable().optional(),
    isPcMainLine: z.boolean().optional().default(false),
  })
  .strict();

const quoteBaseShape = {
  internalName: text,
  requestId: nullableIdSchema,
  customerId: nullableIdSchema,
  isBuiltPc: z.boolean().optional().default(false),
  publicObservation: z.string().trim().max(4000).nullable().optional(),
  pdfOverrides: z.record(fieldOverrideSchema).optional(),
  resolvedPdfConfig: z.record(z.unknown()).optional().default({}),
  financingSnapshot: z.record(z.unknown()).nullable().optional(),
  collectionIds: z.array(idSchema).optional().default([]),
  items: z.array(quoteItemCreateSchema).min(1),
};
export const quoteCreateSchema = z.object(quoteBaseShape).strict();
export const quoteUpdateSchema = z
  .object({
    internalName: text.optional(),
    requestId: nullableIdSchema,
    customerId: nullableIdSchema,
    isBuiltPc: z.boolean().optional(),
    publicObservation: z.string().trim().max(4000).nullable().optional(),
    pdfOverrides: z.record(fieldOverrideSchema).optional(),
    resolvedPdfConfig: z.record(z.unknown()).optional(),
    financingSnapshot: z.record(z.unknown()).nullable().optional(),
    collectionIds: z.array(idSchema).optional(),
    items: z.array(quoteItemCreateSchema).min(1).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Se requiere al menos un campo');

export const quoteCollectionsSchema = z
  .object({
    collectionIds: z.array(idSchema),
  })
  .strict();
export const quoteVersionCreateSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
    publicObservation: z.string().trim().max(4000).nullable().optional(),
    pdfOverrides: z.record(fieldOverrideSchema).optional(),
    resolvedPdfConfig: z.record(z.unknown()).optional(),
    financingSnapshot: z.record(z.unknown()).nullable().optional(),
    items: z.array(quoteItemCreateSchema).min(1).optional(),
  })
  .strict();
export const quoteRetargetSchema = z
  .object({
    targetTotalCents: moneyCentsSchema,
    previewOnly: z.boolean().optional().default(false),
  })
  .strict();
export const quoteStateSchema = z
  .object({
    state: quoteStateEnum,
    reason: z.string().trim().max(1000).nullable().optional(),
    sentMessage: z.string().trim().max(10000).nullable().optional(),
  })
  .strict();

export const quotePricesUpdateSchema = z
  .object({
    mode: z.enum(['one', 'all']),
    itemId: idSchema.optional(),
    updateMaster: z.boolean().optional().default(true),
    reason: z.string().trim().max(1000).nullable().optional(),
  })
  .strict()
  .refine((v) => v.mode !== 'one' || !!v.itemId, {
    message: 'itemId es obligatorio cuando mode=one',
  });

export const quoteReactivateSchema = z
  .object({
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const collectionCreateSchema = z
  .object({
    name: text,
    description: z.string().trim().max(1000).nullable().optional(),
    sortOrder: z.number().int().optional().default(0),
    icon: z.string().trim().max(100).nullable().optional(),
    archived: z.boolean().optional().default(false),
    favorite: z.boolean().optional().default(false),
    visibleInExtension: z.boolean().optional().default(true),
    familyIds: z.array(idSchema).optional().default([]),
  })
  .strict();
export const collectionUpdateSchema = nonEmptyUpdate(collectionCreateSchema.shape);

export const comboItemInputSchema = z
  .object({
    productId: idSchema,
    quantity: z.number().int().min(1).max(999).optional().default(1),
    position: z.number().int().min(0).optional().default(0),
  })
  .strict();

export const comboCreateSchema = z
  .object({
    name: text,
    description: z.string().trim().max(1000).nullable().optional(),
    active: z.boolean().optional().default(true),
    sortOrder: z.number().int().optional().default(0),
    items: z.array(comboItemInputSchema).min(1),
  })
  .strict();
export const comboUpdateSchema = nonEmptyUpdate(comboCreateSchema.shape);

export const requestCreateSchema = z
  .object({
    title: text,
    originalText: z.string().default(''),
    internalNotes: z.string().default(''),
    customerId: nullableIdSchema,
    detectedPhone: z.string().trim().max(100).nullable().optional(),
    maximumBudgetCents: moneyCentsSchema.nullable().optional(),
    expectedUse: z.string().trim().max(1000).nullable().optional(),
    requiredComponents: z.array(z.string().trim().min(1)).default([]),
    assigneeId: nullableIdSchema,
    state: requestStateEnum.optional().default('PENDIENTE'),
  })
  .strict();
export const requestUpdateSchema = nonEmptyUpdate(requestCreateSchema.shape);
export const requestAssociateQuoteSchema = z
  .object({
    familyId: idSchema,
  })
  .strict();

export const pdfGenerateSchema = z
  .object({
    kind: pdfKindSchema,
    force: z.boolean().optional().default(false),
  })
  .strict();

export const sendAttemptCreateSchema = z
  .object({
    chatPhone: z.string().trim().max(100).nullable().optional(),
    chatName: z.string().trim().max(200).nullable().optional(),
    message: z.string().trim().min(1).max(10000),
    pdfKind: pdfKindSchema.nullable().optional(),
    pdfName: z.string().trim().max(300).nullable().optional(),
    confidence: z.number().int().min(0).max(100).nullable().optional(),
    detectionLog: z.record(z.unknown()).nullable().optional(),
    internalNote: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export const sendAttemptResolveSchema = z
  .object({
    status: sendAttemptStatusSchema,
    internalNote: z.string().trim().max(2000).nullable().optional(),
    confidence: z.number().int().min(0).max(100).nullable().optional(),
    deliveredAt: z.coerce.date().optional(),
    createDelivery: z.boolean().optional().default(true),
  })
  .strict();

export const quoteReplyCreateSchema = z
  .object({
    chatPhone: z.string().trim().max(100).nullable().optional(),
    text: z.string().trim().min(1).max(10000),
    intent: replyIntentSchema.optional().default('AMBIGUA'),
    confidence: z.number().int().min(0).max(100).nullable().optional(),
    source: z.string().trim().max(100).optional().default('EXTENSION'),
    applyState: quoteStateEnum.nullable().optional(),
  })
  .strict();

export const quoteSearchSchema = z
  .object({
    q: z.string().trim().max(300).optional(),
    state: quoteStateEnum.optional(),
    customerId: idSchema.optional(),
    collectionId: idSchema.optional(),
    phone: z.string().trim().max(100).optional(),
    productName: z.string().trim().max(300).optional(),
    visibleNumber: z.string().trim().max(100).optional(),
    isBuiltPc: z.coerce.boolean().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z
      .enum(['createdAt', 'visibleNumber', 'totalSaleCents', 'state', 'lastActivityAt'])
      .optional()
      .default('lastActivityAt'),
    order: z.enum(['asc', 'desc']).optional().default('desc'),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
  })
  .strict();

export const similarityLimitQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).optional().default(10),
  })
  .strict();
export type SimilarityLimitQuery = z.infer<typeof similarityLimitQuerySchema>;

export const notificationMarkSchema = z
  .object({
    read: z.boolean().optional(),
    acted: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.read !== undefined || v.acted !== undefined, {
    message: 'Se requiere read o acted',
  });

export const aiAnalyzeRequestSchema = z
  .object({
    regenerate: z.boolean().optional().default(false),
  })
  .strict();

export const aiSuggestResponseSchema = z
  .object({
    tone: suggestionToneSchema.optional(),
    regenerate: z.boolean().optional().default(false),
  })
  .strict();

export const aiCompatibilitySchema = z
  .object({
    regenerate: z.boolean().optional().default(false),
  })
  .strict();

export const aiIntentSchema = z
  .object({
    replyText: z.string().trim().min(1).max(10000),
    context: z.string().trim().max(4000).optional(),
  })
  .strict();

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductImportInput = z.infer<typeof productImportSchema>;
export type ProductBulkDeleteInput = z.infer<typeof productBulkDeleteSchema>;
export type ProductMergeInput = z.infer<typeof productMergeSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type PcLineCreateInput = z.infer<typeof pcLineCreateSchema>;
export type PcLineUpdateInput = z.infer<typeof pcLineUpdateSchema>;
export type QuoteItemCreateInput = z.infer<typeof quoteItemCreateSchema>;
export type QuoteCreateInput = z.infer<typeof quoteCreateSchema>;
export type QuoteUpdateInput = z.infer<typeof quoteUpdateSchema>;
export type QuoteCollectionsInput = z.infer<typeof quoteCollectionsSchema>;
export type QuoteVersionCreateInput = z.infer<typeof quoteVersionCreateSchema>;
export type QuoteRetargetInput = z.infer<typeof quoteRetargetSchema>;
export type QuoteStateInput = z.infer<typeof quoteStateSchema>;
export type QuotePricesUpdateInput = z.infer<typeof quotePricesUpdateSchema>;
export type QuoteReactivateInput = z.infer<typeof quoteReactivateSchema>;
export type CollectionCreateInput = z.infer<typeof collectionCreateSchema>;
export type CollectionUpdateInput = z.infer<typeof collectionUpdateSchema>;
export type ComboItemInput = z.infer<typeof comboItemInputSchema>;
export type ComboCreateInput = z.infer<typeof comboCreateSchema>;
export type ComboUpdateInput = z.infer<typeof comboUpdateSchema>;
export type RequestCreateInput = z.infer<typeof requestCreateSchema>;
export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;
export type RequestAssociateQuoteInput = z.infer<typeof requestAssociateQuoteSchema>;
export type PdfGenerateInput = z.infer<typeof pdfGenerateSchema>;
export type SendAttemptCreateInput = z.infer<typeof sendAttemptCreateSchema>;
export type SendAttemptResolveInput = z.infer<typeof sendAttemptResolveSchema>;
export type QuoteReplyCreateInput = z.infer<typeof quoteReplyCreateSchema>;
export type QuoteSearchInput = z.infer<typeof quoteSearchSchema>;
export type NotificationMarkInput = z.infer<typeof notificationMarkSchema>;
export type AiAnalyzeRequestInput = z.infer<typeof aiAnalyzeRequestSchema>;
export type AiSuggestResponseInput = z.infer<typeof aiSuggestResponseSchema>;
export type AiCompatibilityInput = z.infer<typeof aiCompatibilitySchema>;
export type AiIntentInput = z.infer<typeof aiIntentSchema>;
