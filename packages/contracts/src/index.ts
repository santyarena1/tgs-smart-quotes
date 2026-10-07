import { z } from 'zod';

export const userSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  role: z.enum(['ADMIN', 'VENDEDOR']),
  branchId: z.string().uuid().nullable(),
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

export const userRoleSchema = z.enum(['ADMIN', 'VENDEDOR']);
const optionalTextOverride = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .optional()
  .transform((value) => value === '' ? null : value);
export const branchCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  address: optionalTextOverride,
  phones: optionalTextOverride,
}).strict();
export const branchUpdateSchema = nonEmptyUpdate(branchCreateSchema.shape);
export const userCreateSchema = z.object({
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'El usuario contiene caracteres inválidos'),
  displayName: z.string().trim().min(1).max(150).nullable().optional(),
  password: z.string().min(8).max(1024),
  role: userRoleSchema.default('VENDEDOR'),
  branchId: nullableIdSchema,
}).strict();
export const userUpdateSchema = z.object({
  username: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/, 'El usuario contiene caracteres inválidos').optional(),
  displayName: z.string().trim().min(1).max(150).nullable().optional(),
  password: z.string().min(8).max(1024).optional(),
  role: userRoleSchema.optional(),
  branchId: nullableIdSchema,
  active: z.boolean().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, 'Se requiere al menos un campo');

// Empleados / cuenta corriente. Los montos viajan como strings decimales para
// conservar BigInt de punta a punta también en JSON.
export const movementKindSchema = z.enum(['SALARY_ACCRUAL','SALARY_PAYMENT','ADVANCE','MERCHANDISE','CARD_CONSUMPTION','DEBT','REPAYMENT','REIMBURSEMENT','INSTALLMENT','ADJUSTMENT']);
export const movementDirectionSchema = z.enum(['EMPLOYEE_OWES','COMPANY_OWES']);
export const movementStatusSchema = z.enum(['PENDING','APPLIED','CANCELLED']);
const positiveCentsSchema = moneyCentsSchema.refine(v => BigInt(v) > 0n, 'El importe debe ser mayor que cero');
const optionalEmployeeText = z.string().trim().max(1000).nullable().optional();
export const employeeCreateSchema = z.object({fullName:z.string().trim().min(1).max(200),docId:z.string().trim().max(50).nullable().optional(),branchId:nullableIdSchema,position:z.string().trim().max(150).nullable().optional(),active:z.boolean().optional(),notes:optionalEmployeeText}).strict();
export const employeeUpdateSchema = employeeCreateSchema.partial().strict().refine(v=>Object.keys(v).length>0,'Se requiere al menos un campo');
export const employeeLinkUserSchema = z.object({userId:idSchema}).strict();
export const employeeCreateUserSchema = z.object({username:z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/,'El usuario contiene caracteres inválidos'),password:z.string().min(8).max(1024),displayName:z.string().trim().min(1).max(150).nullable().optional(),role:userRoleSchema.optional()}).strict();
export const movementCreateSchema = z.object({kind:movementKindSchema,amountCents:positiveCentsSchema,direction:movementDirectionSchema.optional(),occurredAt:z.coerce.date().optional(),status:z.enum(['PENDING','APPLIED']).optional(),description:optionalEmployeeText}).strict().superRefine((v,c)=>{if(v.kind==='ADJUSTMENT'&&!v.direction)c.addIssue({code:z.ZodIssueCode.custom,path:['direction'],message:'Los ajustes requieren dirección'});});
export const movementUpdateSchema = z.object({kind:movementKindSchema.optional(),amountCents:positiveCentsSchema.optional(),direction:movementDirectionSchema.optional(),occurredAt:z.coerce.date().optional(),description:optionalEmployeeText}).strict().refine(v=>Object.keys(v).length>0,'Se requiere al menos un campo').superRefine((v,c)=>{if(v.kind==='ADJUSTMENT'&&!v.direction)c.addIssue({code:z.ZodIssueCode.custom,path:['direction'],message:'Los ajustes requieren dirección'});});
export const movementsQuerySchema = z.object({period:z.string().regex(/^\d{6}$/,'El período debe tener formato YYYYMM').optional(),status:movementStatusSchema.optional(),kind:movementKindSchema.optional(),direction:movementDirectionSchema.optional()}).strict();
export const movementCancelSchema = z.preprocess((v)=>(v==null?{}:v),z.object({scope:z.enum(['this_month','full_obligation']).optional()}).strict());
export const salaryUpdateSchema = z.object({amountCents:positiveCentsSchema,reason:z.string().trim().max(500).optional(),effectiveFrom:z.coerce.date().optional(),changeBps:z.number().int().min(-9999).max(100000).optional()}).strict();
export const salaryBulkPreviewSchema = z.object({employeeIds:z.array(idSchema).min(1).optional(),bps:z.number().int().min(-9999).max(100000),roundingStepPesos:z.number().int().min(0).max(100000000).optional()}).strict();
export const salaryBulkApplySchema = z.object({items:z.array(z.object({employeeId:idSchema,newCents:positiveCentsSchema}).strict()).min(1),bps:z.number().int().min(-9999).max(100000)}).strict();
const installmentsSchema=z.object({count:z.number().int().min(1).max(120),firstPeriod:z.string().regex(/^\d{6}$/,'El período debe tener formato YYYYMM'),amountsCents:z.array(positiveCentsSchema).optional()}).strict().superRefine((v,c)=>{if(v.amountsCents&&v.amountsCents.length!==v.count)c.addIssue({code:z.ZodIssueCode.custom,path:['amountsCents'],message:'La cantidad de importes debe coincidir con count'});});
export const obligationCreateSchema=z.object({kind:z.enum(['MERCHANDISE','CARD_CONSUMPTION','ADVANCE','OTHER']),direction:movementDirectionSchema.optional(),originalAmountCents:positiveCentsSchema,description:optionalEmployeeText,productId:idSchema.nullable().optional(),installments:installmentsSchema.optional()}).strict();
export const paymentCreateSchema=z.object({amountCents:positiveCentsSchema,method:z.enum(['EFECTIVO','TRANSFERENCIA','MERCADO_PAGO','TARJETA','OTRO']),paidAt:z.coerce.date().optional(),reference:z.string().trim().max(300).optional(),allocations:z.array(z.object({targetType:z.enum(['OBLIGATION','INSTALLMENT','PERIOD','GENERAL']),targetId:idSchema.optional(),amountCents:positiveCentsSchema}).strict()).optional()}).strict();
export const employeeRequestsQuerySchema=z.object({status:z.enum(['PENDING_APPROVAL','APPROVED','REJECTED']).optional()}).strict();
export const employeePortalRequestCreateSchema=z.object({
  kind:movementKindSchema.refine(kind=>kind!=='ADJUSTMENT','Las solicitudes de ajuste no están permitidas'),
  amountCents:positiveCentsSchema,
  description:optionalEmployeeText,
}).strict();
export const periodParamSchema=z.string().regex(/^\d{6}$/,'El período debe tener formato YYYYMM');
export const periodConfirmSchema=z.object({applied:z.array(z.object({movementId:idSchema}).strict()).default([])}).strict();

export type EmployeeCreateInput=z.infer<typeof employeeCreateSchema>; export type EmployeeUpdateInput=z.infer<typeof employeeUpdateSchema>;
export type EmployeeLinkUserInput=z.infer<typeof employeeLinkUserSchema>; export type EmployeeCreateUserInput=z.infer<typeof employeeCreateUserSchema>;
export type MovementCreateInput=z.infer<typeof movementCreateSchema>; export type MovementUpdateInput=z.infer<typeof movementUpdateSchema>; export type MovementsQuery=z.infer<typeof movementsQuerySchema>;
export type MovementCancelInput={scope?:'this_month'|'full_obligation'};
export type SalaryUpdateInput=z.infer<typeof salaryUpdateSchema>; export type SalaryBulkPreviewInput=z.infer<typeof salaryBulkPreviewSchema>; export type SalaryBulkApplyInput=z.infer<typeof salaryBulkApplySchema>;
export type ObligationCreateInput=z.infer<typeof obligationCreateSchema>; export type PaymentCreateInput=z.infer<typeof paymentCreateSchema>; export type PeriodConfirmInput=z.infer<typeof periodConfirmSchema>;
export type EmployeePortalRequestCreateInput=z.infer<typeof employeePortalRequestCreateSchema>;

export const companySettingsInputSchema = z
  .object({
    logoUrl: z
      .union([z.string().url(), z.string().regex(/^\/[\w./-]+$/), z.literal('')])
      .nullable()
      .transform((v) => (v === '' ? null : v)),
    faviconUrl: z
      .union([z.string().url(), z.string().regex(/^\/[\w./-]+$/), z.literal('')])
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
    listInterestBps: z.number().int().min(0),
  })
  .strict();
export const companySettingsSchema = companySettingsInputSchema.extend({
  id: z.literal('singleton'),
  updatedAt: z.coerce.date(),
});

export const pdfSettingsInputSchema = z
  .object({
    template: z.enum(['CLASICO', 'MODERNO']),
    financingBbvaNote: z.string().trim().max(2000).nullable(),
    validityDays: z.number().int().min(0).max(365).nullable(),
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
    estimatedDelay: z.string().trim().max(1000),
    rmaText: z.string().trim().min(1).max(5000),
    lineOrder: z.array(z.string()),
  })
  .strict();
export const pdfSettingsSchema = pdfSettingsInputSchema.extend({
  id: z.literal('singleton'),
  updatedAt: z.coerce.date(),
});

export const pdfLayoutBlockKeySchema = z.enum([
  'logo',
  'companyName',
  'companyTaxData',
  'quoteTitle',
  'quoteMeta',
  'quoteData',
  'companyFiscalData',
  'servicesBlock',
  'itemsTable',
  'itemsTable.colCode',
  'itemsTable.colName',
  'itemsTable.colQty',
  'itemsTable.colAmount',
  'totalsBlock',
  'financingBlock',
  'observation',
  'rmaBlock',
  'footerText',
]);
export const pdfLayoutStyleSchema = z
  .object({
    x: z.number().min(-200).max(200).optional(),
    y: z.number().min(-300).max(300).optional(),
    width: z.number().min(24).max(720).optional(),
    height: z.number().min(12).max(1000).optional(),
    fontSize: z.number().min(6).max(48).optional(),
    color: color.optional(),
    fontFamily: z
      .enum(['Segoe UI', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana'])
      .optional(),
    fontWeight: z.number().int().min(300).max(900).multipleOf(100).optional(),
    hidden: z.boolean().optional(),
    textAlign: z.enum(['left', 'center', 'right', 'justify']).optional(),
    italic: z.boolean().optional(),
    uppercase: z.boolean().optional(),
    lineHeight: z.number().min(1).max(3).optional(),
    background: color.optional(),
    borderColor: color.optional(),
    borderWidth: z.number().min(0).max(8).optional(),
    borderRadius: z.number().min(0).max(24).optional(),
    padding: z.number().min(0).max(40).optional(),
  })
  .strict();
/** Estilo global del documento: se aplica a ambas plantillas (CLASICO y MODERNO). */
/** Rótulos de plantilla que se pueden reescribir (el resto del texto sale de datos o de Configuración). */
export const pdfLabelKeySchema = z.enum([
  'quoteTitle',
  'quoteDataTitle',
  'fiscalDataTitle',
  'colCode',
  'colName',
  'colQty',
  'colAmount',
  'listPriceLabel',
  'cashPriceLabel',
  'observationLabel',
]);
export const pdfLayoutDocumentSchema = z
  .object({
    labels: z.record(pdfLabelKeySchema, z.string().trim().min(1).max(80)).optional(),
    accentColor: color.optional(),
    textColor: color.optional(),
    fontFamily: z
      .enum(['Segoe UI', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana'])
      .optional(),
    tableHeaderBg: color.optional(),
    tableHeaderColor: color.optional(),
    tableBorderColor: color.optional(),
    tableZebra: z.boolean().optional(),
    tableDensity: z.enum(['compact', 'normal', 'comfortable']).optional(),
    cardRadius: z.number().min(0).max(24).optional(),
    cardBackground: color.optional(),
    cardBorderColor: color.optional(),
  })
  .strict();
export const pdfCustomBlockSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,32}$/),
    text: z.string().max(2000),
    /** Posición en px desde la esquina superior izquierda del área imprimible. */
    x: z.number().min(0).max(800),
    y: z.number().min(0).max(1200),
    width: z.number().min(24).max(720),
    fontSize: z.number().min(6).max(72).optional(),
    color: color.optional(),
    fontFamily: pdfLayoutStyleSchema.shape.fontFamily,
    fontWeight: pdfLayoutStyleSchema.shape.fontWeight,
    align: z.enum(['left', 'center', 'right']).optional(),
    hidden: z.boolean().optional(),
    /** Capa: si existe, el bloque entra en el flujo del documento justo antes de esa sección
     *  ('end' = al final) y x/y se ignoran. Sin valor, queda libre en x/y (comportamiento previo). */
    before: z.enum(['header', 'cards', 'services', 'items', 'totals', 'observation', 'rma', 'footer', 'end']).optional(),
  })
  .strict();
export const pdfLayoutConfigSchema = z
  .object({
    version: z.literal(1).default(1),
    blocks: z.record(pdfLayoutBlockKeySchema, pdfLayoutStyleSchema).default({}),
    document: pdfLayoutDocumentSchema.optional(),
    customBlocks: z.array(pdfCustomBlockSchema).max(30).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const columnKeys = [
      'itemsTable.colCode',
      'itemsTable.colName',
      'itemsTable.colQty',
      'itemsTable.colAmount',
    ] as const;
    const widths = columnKeys.map((key) => value.blocks[key]?.width);
    if (widths.some((width) => width !== undefined)) {
      const resolved = [
        widths[0] ?? 48,
        widths[1] ?? 487,
        widths[2] ?? 48,
        widths[3] ?? 110,
      ];
      const sum = resolved.reduce((total, width) => total + width, 0);
      if (sum < 620 || sum > 720) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['blocks'],
          message: 'El ancho total de las columnas debe quedar entre 620 y 720 px',
        });
      }
    }
  });
export const pdfLayoutSettingsSchema = z.object({
  id: z.literal('singleton'),
  layout: pdfLayoutConfigSchema,
  updatedAt: z.coerce.date(),
});
export const pdfLayoutCompanyTextSchema = z
  .object({
    name: z.string().max(1000),
    taxCondition: z.string().max(1000),
    cuit: z.string().max(1000),
    grossIncome: z.string().max(1000),
    activityStart: z.string().max(1000),
    address: z.string().max(2000),
    phones: z.string().max(1000),
    footerText: z.string().max(5000),
    rmaUrl: z.string().max(2000),
  })
  .strict();
export const pdfLayoutPdfTextSchema = z
  .object({
    builtPcTitle: z.string().max(2000),
    builtPcDescription: z.string().max(2000),
    assemblyText: z.string().max(2000),
    installText: z.string().max(2000),
    windowsText: z.string().max(2000),
    driversText: z.string().max(2000),
    estimatedDelay: z.string().max(1000),
    rmaText: z.string().max(5000),
  })
  .strict();
export const pdfLayoutPreviewInputSchema = z
  .object({
    layout: pdfLayoutConfigSchema,
    companyText: pdfLayoutCompanyTextSchema.optional(),
    pdfText: pdfLayoutPdfTextSchema.optional(),
  })
  .strict();

/** Modelo de fábrica: el bot y el CRM lo usan si no hay otro elegido. */
export const DEFAULT_AI_MODEL = "gpt-5.2";
/** Atajos para elegir modelo en Configuración, con texto para un humano. */
export const RECOMMENDED_AI_MODELS: ReadonlyArray<{id: string; title: string; text: string}> = [
  {id: "gpt-5.2", title: "GPT-5.2", text: "Recomendado para el bot y el CRM: entiende la charla y responde con más criterio."},
  {id: "gpt-4o", title: "GPT-4o", text: "Sólido y rápido. Un poco menos fino para vender."},
  {id: "gpt-4o-mini", title: "GPT-4o mini", text: "Económico. Era el anterior: se queda corto en un chat de venta."},
];

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
    pcDescriptionPrompt: z.string().trim().max(4000).nullable().optional(),
    productDescriptionPrompt: z.string().trim().max(4000).nullable().optional(),
    gamesToAnalyze: z.string().trim().max(4000).nullable().optional(),
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
    installments: z.number().int().positive(),
    interestBps: z.number().int().min(0),
    bank: z.string().trim().max(100).nullable(),
    description: z.string().trim().max(200).nullable(),
    active: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict();
export const financingUpdateSchema = financingInputSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Se requiere al menos un campo');
export const financingPlanSchema = financingInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const calculatorGroupKindSchema = z.enum(['CASH', 'LIST', 'PLAN']);
const calculatorKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'La clave del medio debe ser un slug en minúsculas');
export const calculatorPlanInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    installments: z.number().int().positive().max(60),
    interestBps: z.number().int().min(0).max(100000),
    sortOrder: z.number().int().optional(),
    visible: z.boolean().optional(),
  })
  .strict();
export const calculatorGroupInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    key: calculatorKeySchema,
    label: z.string().trim().min(1).max(80),
    kind: calculatorGroupKindSchema,
    sortOrder: z.number().int().optional(),
    visible: z.boolean().optional(),
    note: z.string().trim().max(600).nullable().optional(),
    plans: z.array(calculatorPlanInputSchema).min(1).max(24),
  })
  .strict();
export const calculatorConfigInputSchema = z
  .object({
    groups: z.array(calculatorGroupInputSchema).min(1).max(40),
  })
  .strict();
export type CalculatorGroupKind = z.infer<typeof calculatorGroupKindSchema>;
export type CalculatorPlanInput = z.infer<typeof calculatorPlanInputSchema>;
export type CalculatorGroupInput = z.infer<typeof calculatorGroupInputSchema>;
export type CalculatorConfigInput = z.infer<typeof calculatorConfigInputSchema>;

export const productInputSchema = z.object({ name: text });
export const customerInputSchema = z.object({ name: text });
export const requestInputSchema = z.object({ title: text });
export const quoteInputSchema = z.object({ internalName: text });
export const quoteItemInputSchema = z.object({ name: text });
export const collectionInputSchema = z.object({ name: text });

export type CompanySettingsInput = z.infer<typeof companySettingsInputSchema>;
export type PdfSettingsInput = z.infer<typeof pdfSettingsInputSchema>;
export type PdfLayoutBlockKey = z.infer<typeof pdfLayoutBlockKeySchema>;
export type PdfCustomBlock = z.infer<typeof pdfCustomBlockSchema>;
export type PdfLayoutStyle = z.infer<typeof pdfLayoutStyleSchema>;
export type PdfLayoutDocument = z.infer<typeof pdfLayoutDocumentSchema>;
export type PdfLayoutConfig = z.infer<typeof pdfLayoutConfigSchema>;
export type PdfLayoutSettings = z.infer<typeof pdfLayoutSettingsSchema>;
export type PdfLayoutPreviewInput = z.infer<typeof pdfLayoutPreviewInputSchema>;
export type AiSettingsInput = z.infer<typeof aiSettingsInputSchema>;
export type OperationsSettingsInput = z.infer<typeof operationsSettingsInputSchema>;

export const externalModuleToggleSchema = z
  .object({
    enabled: z.boolean(),
    key: z.string().min(1),
  })
  .strict();
export type ExternalModuleToggleInput = z.infer<typeof externalModuleToggleSchema>;
// Photoroom y Cloudflare R2 se eliminaron: el fondo se quita en el propio
// servidor y los archivos van al disco persistente, así que ya no hay
// credenciales que cargar para eso.
export const externalModuleConfigInputSchema = z.object({
  tripoKey:z.string().optional(),clearTripoKey:z.boolean().optional(),
  higgsfieldKey:z.string().optional(),clearHiggsfieldKey:z.boolean().optional(),
  higgsfieldSecret:z.string().optional(),clearHiggsfieldSecret:z.boolean().optional(),
  serperKey:z.string().optional(),clearSerperKey:z.boolean().optional(),
  wpHmacSecret:z.string().optional(),clearWpHmacSecret:z.boolean().optional(),
  wpBaseUrl:z.string().url().optional(),autoRepublish:z.boolean().optional(),
}).strict();
export type ExternalModuleConfigInput=z.infer<typeof externalModuleConfigInputSchema>;
export type ExternalModuleConfigView={id:'singleton';tripoKeySet:boolean;higgsfieldKeySet:boolean;higgsfieldSecretSet:boolean;serperKeySet:boolean;wpHmacSecretSet:boolean;wpBaseUrl:string;autoRepublish:boolean;updatedAt:Date};
export const landingLayoutBlockTypeSchema=z.enum(['hero3d','gallery','priceBox','addToCartSticky','specs','description','power','games','compatibility']);
export const landingLayoutSchema=z.object({version:z.literal(1),tokens:z.object({accent:z.string(),bg:z.string(),text:z.string(),radius:z.number(),font:z.string().optional()}).strict(),blocks:z.array(z.object({type:landingLayoutBlockTypeSchema,visible:z.boolean()}).strict())}).strict();
export type LandingLayout=z.infer<typeof landingLayoutSchema>;
export const DEFAULT_LANDING_LAYOUT:LandingLayout={version:1,tokens:{accent:'#E31B23',bg:'#080B12',text:'#F8FAFC',radius:24,font:'Inter, system-ui, sans-serif'},blocks:[{type:'hero3d',visible:true},{type:'priceBox',visible:true},{type:'addToCartSticky',visible:true},{type:'gallery',visible:true},{type:'specs',visible:true},{type:'description',visible:true},{type:'power',visible:true},{type:'games',visible:true},{type:'compatibility',visible:true}]};
export const assetModeSchema=z.object({mode:z.enum(['remove-bg','as-is'])}).strict();
export const assetFromUrlSchema=z.object({url:z.string().url(),origin:z.enum(['SERPER','OFFICIAL','UPLOAD']).optional(),mode:z.enum(['remove-bg','as-is'])}).strict();
export const assetUpdateSchema=z.object({isPrimary:z.boolean().optional(),approved:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0,'Se requiere al menos un campo');
export type AssetModeInput=z.infer<typeof assetModeSchema>;
export type AssetFromUrlInput=z.infer<typeof assetFromUrlSchema>;
export type AssetUpdateInput=z.infer<typeof assetUpdateSchema>;
export const thumbnailTextRuleSchema=z.object({source:z.enum(['title','literal']),value:z.string().max(500).optional(),x:z.number().int().min(0),y:z.number().int().min(0),fontSize:z.number().int().min(1).max(500),color:z.string().trim().min(1).max(100),fontFamily:z.string().trim().min(1).max(200).optional(),align:z.enum(['left','center','right']).optional()}).strict();
export const thumbnailRulesSchema=z.object({width:z.number().int().min(64).max(4096),height:z.number().int().min(64).max(4096),background:z.object({type:z.enum(['template','color']),color:z.string().trim().min(1).max(100).optional()}).strict(),product:z.object({x:z.number().int().min(0),y:z.number().int().min(0),w:z.number().int().min(1),h:z.number().int().min(1)}).strict(),texts:z.array(thumbnailTextRuleSchema).max(20)}).strict().superRefine((v,ctx)=>{if(v.product.x+v.product.w>v.width||v.product.y+v.product.h>v.height)ctx.addIssue({code:z.ZodIssueCode.custom,message:'La caja del producto debe quedar dentro del lienzo',path:['product']});});
export const thumbnailTemplateCreateSchema=z.object({name:z.string().trim().min(1).max(200),rules:thumbnailRulesSchema}).strict();
// Miniaturas con IA (Ajustes → Miniaturas IA). El prompt y el texto admiten
// placeholders: {{titulo}}, {{cpu}}, {{gpu}}, {{ram}}, {{disco}}, {{so}},
// {{gabinete}}, {{componentes}}.
export const thumbnailFooterBadgeSchema=z.object({icon:z.enum(['shield','star','headset','truck','check','bolt']),line1:z.string().trim().max(40),line2:z.string().trim().max(40)}).strict();
export const thumbnailAiSettingsUpdateSchema=z.object({enabled:z.boolean().optional(),mode:z.enum(['LAYOUT','AI_SCENE']).optional(),gpuHeadlineThresholdCents:z.string().regex(/^\d+$/,'El precio umbral tiene que ser un número entero en centavos').optional(),accentColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),footer:z.array(thumbnailFooterBadgeSchema).max(4).optional(),caseAiMode:z.enum(['OFF','ALWAYS']).optional(),caseAiPrompt:z.string().max(3000).optional(),model:z.string().trim().min(1).max(60).optional(),quality:z.enum(['low','medium','high']).optional(),size:z.enum(['1024x1024','1536x1024','1024x1536']).optional(),prompt:z.string().max(6000).optional(),textMode:z.enum(['AI','OVERLAY','NONE']).optional(),textTemplate:z.string().max(400).optional(),overlayPosition:z.enum(['top','bottom']).optional(),overlayColor:z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),overlayFontSize:z.number().int().min(12).max(200).optional(),overlayFontFamily:z.string().trim().max(120).nullable().optional()}).strict();
export type ThumbnailAiSettingsUpdateInput=z.infer<typeof thumbnailAiSettingsUpdateSchema>;
export const thumbnailAiReferenceUpdateSchema=z.object({note:z.string().trim().max(300).nullable().optional(),sortOrder:z.number().int().min(0).max(999).optional()}).strict();
export type ThumbnailAiReferenceUpdateInput=z.infer<typeof thumbnailAiReferenceUpdateSchema>;
export const thumbnailTemplateUpdateSchema=z.object({name:z.string().trim().min(1).max(200).optional(),rules:thumbnailRulesSchema.optional(),active:z.boolean().optional(),fonts:z.array(z.string().trim().min(1).max(500)).max(20).optional()}).strict().refine(v=>Object.keys(v).length>0,'Se requiere al menos un campo');
export const thumbnailGenerateSchema=z.object({templateId:idSchema,title:z.string().trim().max(500).optional(),useHiggsfield:z.boolean().optional(),higgsfieldPrompt:z.string().trim().max(2000).optional()}).strict();
export type ThumbnailRules=z.infer<typeof thumbnailRulesSchema>;
export type ThumbnailTemplateCreateInput=z.infer<typeof thumbnailTemplateCreateSchema>;
export type ThumbnailTemplateUpdateInput=z.infer<typeof thumbnailTemplateUpdateSchema>;
export type ThumbnailGenerateInput=z.infer<typeof thumbnailGenerateSchema>;
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
export const productContentSchema = z.object({
  description: z.string().trim().max(4000).nullable(),
}).strict();
export type ProductContentInput = z.infer<typeof productContentSchema>;
export const quoteFamilyPublishSettingsSchema = z.object({
  autoRepublish: z.boolean().optional(),
  webTitle: z.string().trim().max(120).nullable().optional(),
  webTagline: z.string().trim().max(200).nullable().optional(),
  /// Combos: descuento inverso en puntos básicos (1000 = 10 %); el tachado sale de precio / (1 − %).
  comboDiscountBps: z.number().int().min(0).max(9000).optional(),
  /// Combos: visible en la tienda y en la búsqueda (apagado = oculto, solo se compra desde el modal).
  storeVisible: z.boolean().optional(),
  /// PCs: combos que se le ofrecen al agregarla al carrito, en orden (reemplaza la lista completa).
  comboFamilyIds: z.array(idSchema).max(20).optional(),
}).strict();
export type QuoteFamilyPublishSettingsInput = z.infer<typeof quoteFamilyPublishSettingsSchema>;

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
export const productBulkMergeSchema = z
  .object({
    groups: z.array(productMergeSchema).min(1).max(200),
  })
  .strict();

export const customerCreateSchema = z
  .object({
    name: text,
    phone: z.string().trim().max(100).nullable().optional(),
    dni: z.string().trim().max(50).nullable().optional(),
    notes: z.string().trim().max(5000).nullable().optional(),
    address: z.string().trim().optional().nullable(),
    taxCondition: z
      .enum(['CONSUMIDOR_FINAL', 'RESPONSABLE_INSCRIPTO', 'MONOTRIBUTO', 'EXENTO'])
      .optional()
      .nullable(),
  })
  .strict();
export const customerQuickCreateSchema = z
  .object({ phone: z.string().trim().min(1).max(100) })
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

// Chatbot: configuración editorial extensible y contratos compartidos web/extensión/API.
export const chatbotModeSchema = z.enum(['OFF', 'SUGGEST', 'AUTO']);
export const chatbotModeOverrideSchema = chatbotModeSchema.nullable();
const chatbotStringListSchema = z.array(z.string().trim().min(1).max(2000)).max(100);
export const chatbotResponseEntrySchema = z.object({
  id: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  activators: z.array(z.string().trim().min(1).max(500)).max(100),
  similarityThreshold: z.number().int().min(0).max(100),
  answer: z.string().trim().min(1).max(10000),
  context: z.string().trim().max(10000).default(''),
  attachments: z.object({
    imageUrl: z.union([z.string().trim().url().max(2000), z.string().trim().regex(/^\/[\w./-]+$/).max(2000)]).nullable(),
    url: z.string().trim().url().max(2000).nullable(),
    quote: z.object({
      familyId: z.string().trim().min(1).max(100),
      version: z.number().int().min(1).nullable(),
      useLatest: z.boolean(),
    }).strict().nullable(),
  }).strict().default({imageUrl: null, url: null, quote: null}),
}).strict();
/** Ficha de un anuncio de Meta: el bot la usa cuando el chat nació de ese aviso. */
export const chatbotAdCampaignSchema = z.object({
  id: z.string().trim().min(1).max(100),
  enabled: z.boolean(),
  /** `source_id` del referral de Meta. Vacío = se matchea por el título. */
  adId: z.string().trim().max(200).default(''),
  name: z.string().trim().min(1).max(200),
  headline: z.string().trim().max(500).default(''),
  context: z.string().trim().max(10000).default(''),
  openingMessage: z.string().trim().max(2000).default(''),
  /** Precio publicado, en centavos enteros. null = sin precio fijo. */
  advertisedPriceCents: z.string().regex(/^\d+$/).nullable().default(null),
  quote: z.object({
    familyId: z.string().trim().min(1).max(100),
    version: z.number().int().min(1).nullable(),
    useLatest: z.boolean(),
  }).strict().nullable().default(null),
  seen: z.boolean().optional(),
}).strict();
export type ChatbotAdCampaign = z.infer<typeof chatbotAdCampaignSchema>;
const chatbotScheduleDaySchema = z
  .array(
    z.object({
      from: z.string().regex(/^\d{2}:\d{2}$/),
      to: z.string().regex(/^\d{2}:\d{2}$/),
    }).strict(),
  )
  .max(4);
/** Dos burbujas cuando el cliente escribe solo "hola". El motor las manda tal cual, sin IA. */
export const BARE_HELLO_BUBBLES = [
  'Hola! Soy Fede de The Gamer Shop!',
  'En que te puedo ayudar?',
] as const;

const BARE_HELLO_RULE = `Si el cliente escribe solo "hola" y todavía no le contestaste, la respuesta es exactamente dos burbujas: "${BARE_HELLO_BUBBLES[0]}" y "${BARE_HELLO_BUBBLES[1]}". No agregues una tercera, no preguntes para qué quiere la PC y no digas "somos" ni "como andas". Ese saludo va una sola vez. Nunca vuelvas a saludar ni a presentarte en un chat que ya viene hablando.`;

/** Reglas de estilo y de venta del bot. Se editan en Configuración → Chatbot → Reglas de venta. */
export const DEFAULT_SALES_RULES: string[] = [
  'Antes de redactar, leé en orden TODO el historial reciente; no reacciones al último mensaje de forma aislada. No vuelvas a preguntar datos que el cliente ya dio ni contradigas lo que ya se le dijo.',
  BARE_HELLO_RULE,
  'Si el primer mensaje ya dice qué busca, saludá con "Hola! Soy Fede de The Gamer Shop!" y seguí con la pregunta de ese tema. No agregues "En que te puedo ayudar?".',
  'Una sola pregunta por mensaje.',
  'No digas el precio de un producto, ni un monto en pesos, ni dos opciones con precio. Si podés responder sin un precio (pago, dirección, qué tipo de PC le sirve, un link de la categoría), respondé. Los precios de DATOS DEL SISTEMA no se copian al chat.',
  'Producto sin modelo: "cuales productos busca?", después "Viste alguna marca o modelo en especial?". Si dice que no y que le muestres, recomendá la línea sin precio y el link en su propia burbuja. En teclados: "Dale! Nosotros recomendamos mucho nuestra linea de productos Aula! Le dejo los teclados Aula disponible!" y https://thegamershop.com.ar/?s=teclado+aula&post_type=product. Si después dice "bueno": "Comentame cual te gusta mas!". Si después dice "Dale": "Cualquier cosa nos mandas un mensaje o podes venir a nuestro local! Estamos en Liniers, Av Lisandro de la Torre 373 - CABA" y el link de Google Maps.',
  'Si nombra un modelo concreto o pregunta si hay stock o disponibilidad: contestá exactamente "Ya te digo si tengo disponibilidad!" y shouldEscalate=true. No digas si hay o no hay, ni el precio.',
  'Si pregunta formas de pago, mandá la lista FORMAS DE PAGO: efectivo y transferencia al precio del presupuesto, dólares cara grande con el presupuesto convertido, tarjeta de crédito en 3/6/12 cuotas con interés, BBVA 3 cuotas sin interés del precio de lista, débito con recargo y criptomoneda con recargo. Sin montos.',
  'Si pregunta si en efectivo hay descuento: "El precio que te paso es el de efectivo o transferencia. Con tarjeta de credito, debito o cripto tiene un recargo!". No lo llames descuento: el precio publicado ya es el de efectivo o transferencia.',
  'Personalizá con lo que dijo: nombrá los juegos o programas que mencionó y decile cómo le van a andar.',
  'No des vueltas: si el cliente ya dijo que sí, que se lo sumes o que le mandes el presupuesto, no vuelvas a preguntar lo mismo.',
  'Si pide el presupuesto, que se lo mandes o que le sumes algo, en ESE turno pedí el presupuesto al equipo (shouldCreateRequest=true) y confirmá en una frase qué va a incluir.',
  'PC: "Comentame, buscas una Pc para juegos, diseño, trabajo, estudio?". Si es para juegos: "Perfecto, cuales juegos te gustaria jugar en tu Pc?". Con los juegos, explicá sin precio: los livianos (CS, Valorant) con gráfica integrada y los pesados (Red Dead) con placa. Después preguntá si busca monitor, teclado, mouse, auriculares o parlantes. Si dice que solo quiere la PC: "Perfecto, ya te paso presupuesto" y shouldCreateRequest=true.',
  'Si es para diseño y juegos: "Cuales programas de diseño y juegos le gustaria usar en tu Pc?". Si nombra programas: "Perfecto, alguno de los programas lo usas en 3D?". Cuando ya está claro: "Perfecto, ya te recomiendo una Pc para poder usar los programas que me mencionaste y mas con total fluides y profesionalismo!" y shouldCreateRequest=true. Sin modelos ni precios.',
  'No inventes stock, plazos ni promociones. Si no está en la información provista, no lo afirmes.',
  'Si vino de un anuncio con ficha, usá esa ficha (qué es y para qué alcanza) sin decir el precio, y no ofrezcas otra cosa salvo que pida algo distinto.',
  'Si el cliente confirma que quiere señar o pagar, explicale la seña y el plazo y pasalo a una persona para los datos de pago (shouldEscalate=true). Nunca pases alias, CVU ni datos bancarios.',
  'Si pregunta por un pedido, si la PC ya está lista, o hace un reclamo de algo que ya compró: preguntá a nombre de quién está el pedido o el número de pedido y shouldEscalate=true. Pedido: "Decime a nombre de quien esta su pedido asi verifico el estado!". Reclamo: "Perfecto, decime a nombre de quien esta su Pc para que pueda ver su pedido". No prometas estado ni solución.',
  'Pasá a una persona (shouldEscalate=true), sin prometer nada, cuando: quiera vender componentes usados o entregarlos como parte de pago, pida la licencia de Windows, pida cotizar un envío ya con código postal y localidad, o proponga sponsoreos o colaboraciones.',
  'Si el mensaje del cliente es claramente una respuesta automática de otro negocio o persona (horarios de otro comercio, "si tu consulta es medica comunicate con...", "gracias por comunicarte con..."), no respondas al contenido: shouldEscalate=false y reply vacío.',
  'Nunca digas ni sugieras que sos un bot, una IA o un sistema automático, ni anuncies que vas a derivar o pasar con otra persona.',
  'Si pregunta varias cosas, respondé todas las que estén en la información provista.',
];

/** Qué hace un buen vendedor en cada etapa: el bot sabe en cuál está y lleva al cliente a la siguiente. */
export const DEFAULT_STAGE_PLAYBOOK: Record<string, string> = {
  NEW: `Recién escribe. Si el mensaje es solo "hola", contestá exactamente "${BARE_HELLO_BUBBLES[0]}" y "${BARE_HELLO_BUBBLES[1]}", sin una tercera burbuja. Si ya dijo qué busca, saludá y hacé una sola pregunta de ese tema, sin precio. Si vino de un anuncio, presentá esa PC sin decir el precio. Si pidió el presupuesto, pedíselo al equipo ahora.`,
  QUALIFYING: 'Ya dijo para qué la quiere. Preguntá los juegos o los programas, una cosa por mensaje, sin precios. Si solo quiere la PC o ya está claro el uso, decí "Perfecto, ya te paso presupuesto" y pedilo al equipo (shouldCreateRequest=true).',
  QUOTE_SENT: 'Ya tiene un presupuesto. Preguntá cuál le gusta o qué le cambiarías, resolvé dudas u objeciones y ofrecé cuotas o venir al local a verla. No armes otro salvo que pida un cambio concreto.',
  NEGOTIATION: 'Está decidiendo. Aclará medios de pago y cuotas y el plazo de armado, y proponé avanzar con la seña del 20% para congelar el precio ("Te la separo con la seña?").',
  DEPOSIT: 'Quiere señar o pagar: explicá la seña y el plazo y pasalo a una persona para los datos de pago. Nunca pases alias ni CVU.',
  WON: 'Ya compró. Atendé con buena onda y ayudá con lo que necesite. Si viene al caso, ofrecé periféricos o upgrades.',
  LOST: 'No compró. Si vuelve a escribir, retomá con interés genuino y ofrecé una opción que se ajuste mejor a lo que buscaba.',
};

/** Versiones viejas de fábrica: si el negocio no las editó, se reemplazan por las actuales. */
const PREVIOUS_SALES_RULES: string[] = [
  'No des vueltas: cada respuesta avanza. Si el cliente ya dijo que sí, que se lo sumes o que le mandes el presupuesto, no vuelvas a preguntar lo mismo. Una sola pregunta solo si falta un dato imprescindible (uso o presupuesto) y todavía no lo dijo.',
  'Si el cliente pide el presupuesto, que se lo mandes o que le sumes algo, en ESE turno pedí el presupuesto al equipo (shouldCreateRequest=true) y confirmá en una frase qué va a incluir. No digas "te lo armo" ni "en un ratito" sin pedirlo. El plazo, si hace falta, sale de la COLA del equipo en DATOS DEL SISTEMA (0-1: "ya te lo mando"; 2-4: "ahora te lo armo"; 5 o más: "en un ratito"), sin minutos ni horas. Si ya hay una solicitud en curso, no pidas otra: decile que ya lo están armando.',
  'No inventes PCs, monitores, marcas, modelos ni precios que no estén en DATOS DEL SISTEMA, en un anuncio configurado o en una respuesta de Qué sabe. Si no hay un producto que encaje, pedí el presupuesto a medida (shouldCreateRequest=true) en vez de recomendar de memoria.',
  'Si el cliente vino de un anuncio y hay un ANUNCIO configurado, usá solo esa ficha: el precio publicado, la información específica y el presupuesto de ese aviso. Presentalo en las primeras respuestas. No ofrezcas otra PC ni pidas un presupuesto nuevo al equipo salvo que pida algo distinto a lo del anuncio.',
  'Cuando le prometas un presupuesto a medida, el plazo depende de la COLA del equipo que figura en DATOS DEL SISTEMA: con 0 o 1 pendientes, "ya te lo mando"; con 2 a 4, "ahora te lo armo y te lo paso"; con 5 o más, "en un ratito te lo paso". Nunca des minutos ni horas exactas. Si ya tiene una solicitud en curso, no le pidas los datos de nuevo: decile que ya lo están armando.',
  'El saludo ("Hola! Soy Fede de The Gamer Shop") va una sola vez, en el primer mensaje del chat. Nunca vuelvas a saludar ni a presentarte en un chat que ya viene hablando.',
  'Si el cliente escribe solo "hola" y todavía no le contestaste, la respuesta es exactamente dos burbujas: "Hola! Soy Fede de The Gamer Shop" y "En que te puedo ayudar?". No agregues una tercera, no preguntes para qué quiere la PC y no digas "somos" ni "como andas". Ese saludo va una sola vez. Nunca vuelvas a saludar ni a presentarte en un chat que ya viene hablando.',
  'Primero valor, después preguntas: si el cliente vino de un anuncio con ficha configurada, en la primera respuesta contale qué es esa PC o producto (componentes clave, precio y para qué alcanza) y recién ahí hacé UNA pregunta. Si pide info o specs de lo que vio, dáselas: no le contestes con otra pregunta.',
  'Una sola pregunta por mensaje, y como mucho dos preguntas antes de mostrarle una opción concreta. Nunca encadenes "para que la usas?", "que juegos?" y "buscas perifericos?" sin haberle mostrado nada.',
  'Cuando haya productos o PCs en DATOS DEL SISTEMA o en el anuncio, ofrecé dos opciones con precio (una buena y una mejor), cada una en su burbuja, contadas como un vendedor ("La primera tiene un Ryzen 5 5500 con una 1660 Super, sale $1.056.900"), con el link solo en su propia burbuja. Nunca copies títulos en mayúsculas de la tienda.',
  'Cerrá cada respuesta con una pregunta concreta y fácil de contestar que avance la venta ("Cual te gusta mas, la 1 o la 2?", "Te la separo con la seña?", "Venis mañana a la mañana o a la tarde?"). Nunca cierres solo con "Comentame que te parece".',
  'Periféricos (monitor, teclado, mouse, auriculares) se ofrecen recién después de que eligió la PC, salvo que los pida él.',
  'Si dice que no le alcanza o que es caro: nunca dejes la objeción sin respuesta. Ofrecé cuotas, una opción más económica o un plan de mejora ("arrancas con esta y despues le sumas la placa").',
  'Agarrá al cliente en caliente: si no hay en DATOS DEL SISTEMA, en el anuncio ni en Qué sabe un producto que encaje, con el uso y el presupuesto alcanza: decile que le armás opciones a medida y pedí el presupuesto al equipo (shouldCreateRequest=true). No sigas preguntando en loop.',
  'El plazo que prometés para un presupuesto a medida depende de la COLA del equipo en DATOS DEL SISTEMA: con 0 o 1 pendientes "ya te lo mando"; con 2 a 4 "ahora te lo armo y te lo paso"; con 5 o más "en un ratito te lo paso". Nunca minutos ni horas exactas. Si ya tiene una solicitud en curso, decile que ya lo están armando.',
  'No inventes PCs, monitores, marcas, modelos, precios, stock, plazos, políticas ni promociones que no estén en DATOS DEL SISTEMA, en un anuncio configurado o en Qué sabe. Si no está, no lo afirmes, no lo niegues ni lo estimes.',
  'Los DATOS DEL SISTEMA son consultas en vivo: sus precios son reales y podés informarlos. El stock para reservar o cobrar siempre lo confirma una persona.',
  'Si vino de un anuncio con ficha configurada, usá esa ficha (precio publicado, información y presupuesto del aviso) y no ofrezcas otra cosa salvo que pida algo distinto.',
  'Invitá al local a ver la PC funcionando con una opción de día y horario dentro del horario de atención ("Te espero mañana a la mañana o a la tarde?"), sobre todo si duda.',
  'Pasá a una persona (shouldEscalate=true), sin prometer nada, cuando: quiera vender componentes usados o entregarlos como parte de pago, pida la licencia de Windows, pida cotizar un envío ya con código postal y localidad, tenga un problema o garantía de algo ya comprado, haga un reclamo, o proponga sponsoreos o colaboraciones.',
];
const PREVIOUS_STAGE_PLAYBOOK: Record<string, string[]> = {
  NEW: [
    'Recién escribe. Saludá y descubrí para qué la quiere (juegos, diseño, trabajo, estudio). Una pregunta por vez.',
    'Recién escribe. Si vino de un anuncio con ficha, presentá esa PC o ese presupuesto; si no, saludá y descubrí para qué la quiere (juegos, diseño, trabajo, estudio). Una pregunta por vez.',
    'Recién escribe. Si vino de un anuncio con ficha, presentá esa PC o producto con precio y para qué alcanza, y hacé una sola pregunta. Si pidió el presupuesto, pedíselo al equipo ahora. Si no hay anuncio, una sola pregunta: para qué la quiere.',
    'Recién escribe. Si el mensaje es solo "hola", contestá exactamente "Hola! Soy Fede de The Gamer Shop" y "En que te puedo ayudar?", sin una tercera burbuja. Si vino de un anuncio con ficha, presentá esa PC o producto con precio y para qué alcanza, y hacé una sola pregunta. Si pidió el presupuesto, pedíselo al equipo ahora. Si ya dijo qué busca y no hay anuncio, una sola pregunta: para qué la quiere.',
  ],
  QUALIFYING: [
    'Ya sabés algo de lo que quiere. Si hay PCs o productos en DATOS DEL SISTEMA que encajen, ofrecé una o dos opciones con precio y link. Si no, con uso y presupuesto alcanza: prometé un presupuesto a medida y pedíselo al equipo (shouldCreateRequest=true).',
    'Ya sabés algo de lo que quiere. Mostrá dos opciones con precio si hay en DATOS DEL SISTEMA o en el anuncio, y cerrá con "cual te gusta mas?". Si no hay nada que encaje, con uso y presupuesto pedí el presupuesto al equipo (shouldCreateRequest=true).',
  ],
  QUOTE_SENT: [
    'Ya tiene un presupuesto. Preguntá qué le pareció, resolvé dudas u objeciones (precio, rendimiento, componentes) y ofrecé ajustarlo o una alternativa.',
  ],
};

function sameRule(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

/** Reglas nuevas o reemplazos: se suman si no están, sin reponer las de fábrica que hayan borrado. */
const FACTORY_SALES_RULE_ADDITIONS: string[] = DEFAULT_SALES_RULES.filter((rule) =>
  rule === BARE_HELLO_RULE
  || rule.includes('Ya te digo si tengo disponibilidad')
  || rule.includes('FORMAS DE PAGO')
  || rule.includes('No lo llames descuento')
  || rule.includes('Comentame, buscas una Pc')
  || rule.includes('fluides')
  || rule.includes('No digas el precio de un producto')
  || rule.includes('Producto sin modelo')
  || rule.includes('primer mensaje ya dice')
  || rule === 'Una sola pregunta por mensaje.'
  || rule.includes('nombre de quién está el pedido')
  || rule.includes('sin decir el precio, y no ofrezcas')
);

/** Deja las reglas que editaron, saca las de fábrica viejas y suma las nuevas si faltan. */
export function applyFactorySalesRules(stored: string[] | null | undefined): string[] {
  if (!Array.isArray(stored) || !stored.length) return [...DEFAULT_SALES_RULES];
  const next = stored.filter((rule) => !PREVIOUS_SALES_RULES.some((old) => sameRule(rule, old)));
  for (const fresh of FACTORY_SALES_RULE_ADDITIONS) {
    if (!next.some((rule) => sameRule(rule, fresh))) next.push(fresh);
  }
  return next;
}

/** Actualiza el guion de fábrica si sigue en una versión vieja; no pisa un texto editado. */
export function applyFactoryStagePlaybook(stored: Record<string, string> | null | undefined): Record<string, string> {
  const base = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const next: Record<string, string> = {...DEFAULT_STAGE_PLAYBOOK, ...base};
  for (const [stage, factory] of Object.entries(DEFAULT_STAGE_PLAYBOOK)) {
    const current = base[stage];
    if (!current || PREVIOUS_STAGE_PLAYBOOK[stage]?.some((old) => sameRule(old, current))) {
      next[stage] = factory;
    }
  }
  return next;
}

/** Frases que, si el cliente las dice, el bot pide el presupuesto al equipo en ese turno. Se editan en Presupuestos y avisos. */
export const DEFAULT_REQUEST_KEYWORDS: string[] = [
  'mandame el presupuesto',
  'pasame el presupuesto',
  'armame el presupuesto',
  'mandame la cotizacion',
  'quiero el presupuesto',
  'sumalo al presupuesto',
  'sumamelo al presupuesto',
  'presupuesto completo',
  'mandame el pdf',
  'pasame el pdf',
  'cotizame',
];

/** Palabras y frases que el bot nunca usa (se editan en Reglas de venta). */
export const DEFAULT_BANNED_WORDS: string[] = ['querido', 'papa', 'posta', 'estimado', 'con gusto te asisto', 'entiendo que', 'sin embargo', 'te gustaria que', 'puedo ayudarte a', 'no dudes en', 'quedo a disposicion', 'con gusto', 'por supuesto', 'en que puedo ayudarte hoy'];

/** Ejemplos de cómo habla el bot (cliente → respuesta, burbujas separadas por |). Se editan en Reglas de venta. */
export const DEFAULT_STYLE_EXAMPLES: string[] = [
  `Cliente: "hola" → Fede: "${BARE_HELLO_BUBBLES[0]}" | "${BARE_HELLO_BUBBLES[1]}"`,
  'Cliente: "Me gustaria averiguar sobre productos" → Fede: "Perfecto, cuales productos busca?"',
  'Cliente: "Teclado Gamer" → Fede: "Perfecto! Viste alguna marca o modelo en especial!"',
  'Cliente: "No, mostrame" → Fede: "Dale! Nosotros recomendamos mucho nuestra linea de productos Aula! Le dejo los teclados Aula disponible!" | "https://thegamershop.com.ar/?s=teclado+aula&post_type=product"',
  'Cliente: "bueno" → Fede: "Comentame cual te gusta mas!"',
  'Cliente: "Dale" → Fede: "Cualquier cosa nos mandas un mensaje o podes venir a nuestro local! Estamos en Liniers, Av Lisandro de la Torre 373 - CABA - https://www.google.com/maps/place/The+Gamer+Shop/@-34.6431396,-58.5234052,17z"',
  'Cliente: "hola busco procesador" → Fede: "Hola! Soy Fede de The Gamer Shop!" | "Perfecto, viste alguno en nuestra web?"',
  'Cliente: "no, no vi busco el 5600ge" → Fede: "Ya te digo si tengo disponibilidad!"',
  'Cliente: "formas de pago?" → Fede: "FORMAS DE PAGO\n• Efectivo (Precio del presupuesto)\n• Transferencia (Precio del presupuesto)\n• Dolares Cara grande (Precio del presupuesto convertido a dolares)\n• Tarjeta de Credito en cuotas (3 / 6 / 12 cuotas con interes)\n• Tarjeta de Credito BBVA (3 Cuotas sin interes del precio del lista)\n• Tarjeta de Debito (Se cobra un recargo)\n• Criptomoneda (Se cobra un recargo)"',
  'Cliente: "En efectivo tengo descuento?" → Fede: "El precio que te paso es el de efectivo o transferencia. Con tarjeta de credito, debito o cripto tiene un recargo!"',
  'Cliente: "Busco una Pc completa" → Fede: "Comentame, buscas una Pc para juegos, diseño, trabajo, estudio?"',
  'Cliente: "para juegos" → Fede: "Perfecto, cuales juegos te gustaria jugar en tu Pc?"',
  'Cliente: "fortnite, csgo, warzone y red dead" → Fede: "Los juegos livianos, como CS o Valorant, te andan con la grafica integrada. Los pesados, como Red Dead, necesitan una placa de video dedicada" | "Buscas tambien monitor, teclado, mouse, auriculares o parlantes?"',
  'Cliente: "No, busco solo la Pc" → Fede: "Perfecto, ya te paso presupuesto"',
  'Cliente: "para diseño y juegos" → Fede: "Cuales programas de diseño y juegos le gustaria usar en tu Pc?"',
  'Cliente: "photoshop e illustrator" → Fede: "Perfecto, alguno de los programas lo usas en 3D?"',
  'Cliente: "si, illustrator en 3D" → Fede: "Perfecto, ya te recomiendo una Pc para poder usar los programas que me mencionaste y mas con total fluides y profesionalismo!"',
  'Cliente: "ya esta lista mi pc?" → Fede: "Decime a nombre de quien esta su pedido asi verifico el estado!"',
  'Cliente: "les compre una pc hace un mes y no me anda" → Fede: "Perfecto, decime a nombre de quien esta su Pc para que pueda ver su pedido"',
  'Cliente: "gracias!" → Fede: "De nada! Cualquier cosa me escribis"',
];

/** Ejemplos de fábrica viejos: cotizaban precio o ofrecían dos PCs. Si no los editaron, se reemplazan. */
const PREVIOUS_STYLE_EXAMPLES: string[] = [
  'Cliente: "hola" → Fede: "Hola! Soy Fede de The Gamer Shop" | "En que te puedo ayudar?"',
  'Cliente: "Hola! Quiero mas informacion sobre la PC Completa por $650.000" → Fede: "Hola! Soy Fede de The Gamer Shop" | "La de 650 es ideal para estudio, oficina y juegos livianos como Roblox o Minecraft" | "Para que la usarias mas?"',
  'Cliente: "para jugar fortnite y cs2" → Fede: "Buenisimo!" | "Para Fortnite y CS2 te conviene una con placa de video, asi te van fluidos" | "Te paso dos opciones asi las comparas?"',
  'Cliente: "regalame una pc jaja" → Fede: "Jaja ojala pudiera!" | "Pero te armo algo que te quede comodo de precio" | "Cuanto tenias pensado gastar mas o menos?"',
  'Cliente: "es que no tengo tanto para gastar" → Fede: "Te entiendo!" | "Tenes 3, 6 y 12 cuotas con cualquier tarjeta, o te armo una mas economica y despues le sumas la placa" | "Que te queda mas comodo?"',
  'Cliente: "hacen envios? soy de tucuman" → Fede: "Asi es! Enviamos a todo el pais" | "Pasame tu codigo postal y localidad y te lo cotizo"',
  'Cliente: "la 3050 me conviene?" → Fede: "Esa placa no te la recomiendo, es cara para lo que rinde" | "Por un precio parecido tenes una 3060 Ti que rinde mucho mas" | "Queres que te la cotice asi?"',
  'Cliente: "cuanto tarda?" → Fede: "Una vez señada la armamos, configuramos y probamos en 3 a 5 dias habiles" | "Despues venis, la ves andando y abonas el resto!"',
  'Cliente: "me gusta la segunda" → Fede: "Joya!" | "Te la separo con la seña del 20% asi te congelamos el precio?"',
  'Cliente: "voy a ir a verla al local" → Fede: "Dale!" | "Estamos en Av. Lisandro de la Torre 373, Liniers" | "Venis mañana a la mañana o a la tarde?"',
  'Cliente: "gracias!" → Fede: "De nada! Cualquier cosa me escribis"',
];

/**
 * Saca los ejemplos viejos que cotizan precio y suma los de las charlas nuevas si faltan.
 * Una lista vacía queda vacía. Un saludo editado a mano no se pisa.
 */
export function applyFactoryStyleExamples(stored: string[] | null | undefined): string[] {
  if (!Array.isArray(stored)) return [...DEFAULT_STYLE_EXAMPLES];
  const list = stored.filter((item) => typeof item === 'string' && item.trim());
  if (!list.length) return [];
  const stripped = list.filter((item) => !PREVIOUS_STYLE_EXAMPLES.some((old) => sameRule(item, old)));
  const custom = stripped.filter((item) => !DEFAULT_STYLE_EXAMPLES.some((fresh) => sameRule(item, fresh)));
  if (!custom.length && (!stripped.length || stripped.every((item) => DEFAULT_STYLE_EXAMPLES.some((fresh) => sameRule(item, fresh))))) {
    return [...DEFAULT_STYLE_EXAMPLES];
  }
  const hello = DEFAULT_STYLE_EXAMPLES[0] ?? '';
  const next = hello && !stripped.some((item) => item.includes('Cliente: "hola"')) ? [hello, ...stripped] : [...stripped];
  for (const fresh of DEFAULT_STYLE_EXAMPLES) {
    const isHello = fresh.includes('Cliente: "hola"');
    if (next.some((item) => sameRule(item, fresh) || (isHello && item.includes('Cliente: "hola"')))) continue;
    next.push(fresh);
  }
  return next;
}

/** Cómo escribe el bot en el celular. Se aplica en código a cada mensaje antes de salir. */
export const DEFAULT_WRITING_FILTERS = {
  noAccents: true,
  noOpeningMarks: true,
  noFinalPeriod: true,
  noFormatting: true,
};
export const writingFiltersSchema = z.object({
  noAccents: z.boolean(),
  noOpeningMarks: z.boolean(),
  noFinalPeriod: z.boolean(),
  noFormatting: z.boolean(),
}).strict();
export type WritingFilters = z.infer<typeof writingFiltersSchema>;

/** Avisos al equipo cuando el bot pide un presupuesto, y envío automático cuando está listo. */
export const teamAlertsSchema = z.object({
  enabled: z.boolean(),
  numbers: z.array(z.string().trim().min(1).max(40)).max(20),
  templateId: z.string().nullable(),
  autoSendQuote: z.boolean(),
}).strict();
export type TeamAlertsInput = z.infer<typeof teamAlertsSchema>;

const chatbotSettingsObjectSchema = z
  .object({
    enabled: z.boolean(),
    defaultMode: chatbotModeSchema,
    model: z.string().trim().min(1).max(200).nullable(),
    persona: z.string().trim().min(1).max(10000),
    openingMessages: chatbotStringListSchema,
    closingMessages: chatbotStringListSchema,
    responses: z.array(chatbotResponseEntrySchema).max(500),
    escalationKeywords: z.array(z.string().trim().min(1).max(200)).max(200),
    escalationInstructions: z.string().trim().min(1).max(10000),
    modelCanEscalate: z.boolean(),
    businessHours: z.object({
      enabled: z.boolean(),
      timezone: z.string().trim().min(1).max(100),
      schedule: z.object({
        monday: chatbotScheduleDaySchema,
        tuesday: chatbotScheduleDaySchema,
        wednesday: chatbotScheduleDaySchema,
        thursday: chatbotScheduleDaySchema,
        friday: chatbotScheduleDaySchema,
        saturday: chatbotScheduleDaySchema,
        sunday: chatbotScheduleDaySchema,
      }).strict(),
    }).strict(),
    outsideHoursBehavior: z.object({
      mode: z.enum(['OFF', 'STALL', 'NORMAL']),
      message: z.string().trim().max(2000),
    }).strict(),
    responseStyle: z.object({
      length: z.enum(['SHORT', 'MEDIUM', 'DETAILED']),
      maxCharacters: z.number().int().min(80).max(4000),
      emoji: z.enum(['NONE', 'SPARING', 'NATURAL']),
      paragraphs: z.enum(['COMPACT', 'SHORT', 'FREE']),
      avoidRepetition: z.boolean(),
    }).strict(),
    multiMessage: z.object({
      enabled: z.boolean().default(true),
      splitMode: z.enum(['AI_NATURAL', 'AI_PLUS_FIXED', 'FIXED_ONLY']).default('AI_NATURAL'),
      maxBubbles: z.number().int().min(1).max(5).default(3),
      openingMessage: z.string().trim().max(1000).default(''),
      closingMessage: z.string().trim().max(1000).default(''),
      quoteFollowup: z.object({
        enabled: z.boolean().default(true),
        message: z.string().trim().max(1000).default('Decime si querés cambiar algo o sumar/sacar componentes 👍'),
      }).strict().default({enabled:true,message:'Decime si querés cambiar algo o sumar/sacar componentes 👍'}),
      draftMode: z.enum(['QUEUE', 'JOINED', 'FIRST_ONLY']).default('QUEUE'),
      betweenDelayMinSeconds: z.number().int().min(0).max(30).default(2),
      betweenDelayMaxSeconds: z.number().int().min(0).max(60).default(6),
    }).strict().default({
      enabled:true,splitMode:'AI_NATURAL',maxBubbles:3,openingMessage:'',closingMessage:'',
      quoteFollowup:{enabled:true,message:'Decime si querés cambiar algo o sumar/sacar componentes 👍'},
      draftMode:'QUEUE',betweenDelayMinSeconds:2,betweenDelayMaxSeconds:6,
    }),
    productMessageIntro: z.string().trim().max(500).default('Este sería el producto 👇'),
    quoteSendPrompt: z.string().trim().min(1).max(5000).default('Redactá un mensaje breve y cálido presentando el presupuesto adjunto, respondiendo puntualmente a lo que el cliente pidió según los últimos mensajes. No inventes datos.'),
    ignoredAutoMessages: z.array(z.string().trim().min(1).max(2000)).max(100),
    autoDelayMaxSeconds: z.number().int().min(0).max(120),
    reuseSimilarityThreshold: z.number().int().min(0).max(100),
    recontactEnabled: z.boolean(),
    recontactDays: z.number().int().min(1).max(365),
    recontactPrompt: z.string().trim().max(5000),
    recontactMaxAttempts: z.number().int().min(0).max(10),
    scanIntervalSeconds: z.number().int().min(3).max(120),
    maxRecentSnippets: z.number().int().min(0).max(50),
    summaryRefreshEvery: z.number().int().min(2).max(100),
    sendConfirmationTimeoutMs: z.number().int().min(3000).max(60000),
    /** Espera para que el cliente termine de escribir antes de que responda el bot. */
    replyDebounceSeconds: z.number().int().min(2).max(60).default(10),
    /** Horas sin mensajes del vendedor para que el bot retome un chat tomado. 0 = nunca. */
    autoResumeHours: z.number().int().min(0).max(168).default(0),
    /** chatKeys de los números que entrenan al bot (se editan en el CRM → Entrenamiento). */
    trainerNumbers: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    /** Indicaciones aprobadas en el entrenamiento. */
    guidance: z.array(z.object({
      id: z.string(),
      text: z.string(),
      enabled: z.boolean(),
      source: z.string(),
      createdAt: z.string(),
    }).strict()).max(200).default([]),
    transcribeAudio: z.boolean().default(true),
    describeImages: z.boolean().default(true),
    /** Reglas de estilo y de venta (editables). */
    salesRules: z.array(z.string().trim().min(1).max(2000)).max(80).default(DEFAULT_SALES_RULES),
    /** Guion por etapa de la venta (editable). */
    stagePlaybook: z.record(z.string(), z.string().trim().max(2000)).default(DEFAULT_STAGE_PLAYBOOK),
    writingFilters: writingFiltersSchema.default(DEFAULT_WRITING_FILTERS),
    bannedWords: z.array(z.string().trim().min(1).max(100)).max(100).default(DEFAULT_BANNED_WORDS),
    styleExamples: z.array(z.string().trim().min(1).max(1500)).max(40).default(DEFAULT_STYLE_EXAMPLES),
    teamAlerts: teamAlertsSchema.default({enabled: true, numbers: [], templateId: null, autoSendQuote: true}),
    /** Fichas por anuncio de Facebook/Instagram: presupuesto e info de ese aviso. */
    ads: z.array(chatbotAdCampaignSchema).max(200).optional(),
    /** Frases con las que el cliente pide el presupuesto: se crea la solicitud en ese turno. */
    requestKeywords: z.array(z.string().trim().min(1).max(200)).max(80).optional(),
  })
  .strict();

const stripFollowups = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const {followups: _followups, ...rest} = value as Record<string, unknown>;
  return rest;
};

/** followups vive en CRM → Seguimientos; si el GET lo mandó de más, el PUT no debe fallar. */
export const chatbotSettingsInputSchema = z.preprocess(stripFollowups, chatbotSettingsObjectSchema);
export const chatbotSettingsSchema = chatbotSettingsObjectSchema.extend({
  id: z.literal('singleton'),
  updatedAt: z.coerce.date(),
});
export const whatsappCloudSettingsInputSchema = z.object({
  enabled: z.boolean(),
  phoneNumberId: z.string().trim().max(200).optional(),
  businessAccountId: z.string().trim().max(200).optional(),
  accessToken: z.string().trim().max(2000).optional(),
  appSecret: z.string().trim().max(1000).optional(),
  webhookVerifyToken: z.string().trim().max(500).optional(),
  apiVersion: z.string().trim().regex(/^v\d+\.\d+$/).default('v21.0'),
}).strict();

/// Envío manual desde el CRM. `text` va dentro de la ventana de 24 h;
/// `templateId` es la única vía permitida cuando la ventana está cerrada.
export const whatsappSendSchema = z.object({
  text: z.string().trim().min(1).max(4096).optional(),
  templateId: z.string().trim().min(1).max(200).optional(),
  templateVariables: z.array(z.string().trim().max(1000)).max(20).optional(),
  quote: z.object({
    familyId: z.string().trim().min(1).max(200),
    version: z.number().int().min(1),
  }).strict().optional(),
})
  .strict()
  .refine(
    (value) => Boolean(value.text) || Boolean(value.templateId) || Boolean(value.quote),
    'Hay que enviar un texto, una plantilla o un presupuesto',
  )
  .refine(
    (value) => !(value.text && value.templateId),
    'Un mensaje no puede ser texto libre y plantilla a la vez',
  );

export const whatsappConversationsQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  filter: z.enum(['TODAS', 'NO_LEIDAS', 'ESCALADAS', 'MIAS', 'VENTANA_ABIERTA']).default('TODAS'),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  cursor: z.string().trim().max(200).optional(),
}).strict();

export const whatsappMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(60),
  before: z.string().trim().max(200).optional(),
}).strict();

export const whatsappAssignSchema = z.object({
  assignedUserId: z.string().trim().min(1).max(200).nullable(),
}).strict();

/// Alta/edición local de una plantilla. El texto real lo aprueba Meta:
/// acá se registra para poder elegirla y completar sus variables.
export const whatsappTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(/^[a-z0-9_]+$/, 'Meta solo acepta minúsculas, números y guiones bajos'),
  language: z.string().trim().min(2).max(20).default('es_AR'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']).default('MARKETING'),
  body: z.string().trim().min(1).max(2000),
  usageHint: z.string().trim().max(1000).default(''),
  useForRecontact: z.boolean().default(false),
}).strict();

export type WhatsappSendInput = z.infer<typeof whatsappSendSchema>;
export type WhatsappConversationsQuery = z.infer<typeof whatsappConversationsQuerySchema>;
export type WhatsappMessagesQuery = z.infer<typeof whatsappMessagesQuerySchema>;
export type WhatsappAssignInput = z.infer<typeof whatsappAssignSchema>;
export type WhatsappTemplateInput = z.infer<typeof whatsappTemplateInputSchema>;
export const chatbotConversationUpdateSchema = z
  .object({
    displayName: z.string().trim().max(200).nullable().optional(),
    modeOverride: chatbotModeOverrideSchema.optional(),
    lastQuoteFamilyId: nullableIdSchema.optional(),
    lastQuoteVersion: z.number().int().min(1).nullable().optional(),
    clearEscalation: z.boolean().optional(),
    recontactOptOut: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Se requiere al menos un campo');
export const chatbotRespondSchema = z
  .object({
    chatKey: z.string().trim().min(1).max(200),
    displayName: z.string().trim().max(200).optional(),
    detectedPhone: z.string().trim().max(100).nullable().optional(),
    message: z.string().trim().min(1).max(20000),
    messageType: z.enum(['TEXT', 'AUDIO']).optional().default('TEXT'),
    messageFingerprint: z.string().trim().min(8).max(200),
    manualSuggestion: z.boolean().optional().default(false),
    simulation: z.boolean().optional().default(false),
    /** En Probar: igual redactar la respuesta si el bot está apagado o el local cerrado. */
    previewReply: z.boolean().optional(),
    /** En Probar: simular que el cliente vino de esta ficha de anuncio. */
    adCampaignId: z.string().trim().min(1).max(100).optional(),
    recentMessages: z.array(z.object({
      direction: z.enum(['INBOUND', 'OUTBOUND']),
      text: z.string().trim().min(1).max(10000),
    }).strict()).max(50).optional(),
  })
  .strict();
export const chatbotRecontactSchema = z
  .object({
    chatKey: z.string().trim().min(1).max(200),
    displayName: z.string().trim().max(200).optional(),
    recentMessages: z.array(z.object({
      direction: z.enum(['INBOUND', 'OUTBOUND']),
      text: z.string().trim().min(1).max(10000),
    }).strict()).max(50).optional(),
  })
  .strict();
export const quoteSendMessageSchema=z.object({
  chatKey:z.string().trim().min(1).max(200),
  version:z.number().int().min(1).optional(),
  recentMessages:z.array(z.object({direction:z.enum(['INBOUND','OUTBOUND']),text:z.string().trim().min(1).max(10000)}).strict()).max(5).default([]),
}).strict();
export const chatbotLogActionSchema = z.object({
  action: z.enum(['SENT', 'SEND_FAILED', 'HUMAN_SENT', 'DISMISSED', 'ATTACHMENT_SENT', 'ATTACHMENT_FAILED']),
  text: z.string().trim().min(1).max(20000).optional(),
  error: z.string().trim().max(2000).optional(),
  attachment: z.string().trim().max(2000).optional(),
}).strict();
export const chatbotLogsQuerySchema = z.object({
  chatKey: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
}).strict();

export type ChatbotMode = z.infer<typeof chatbotModeSchema>;
export type ChatbotSettingsInput = z.infer<typeof chatbotSettingsInputSchema>;
export type ChatbotSettings = z.infer<typeof chatbotSettingsSchema>;
export type WhatsappCloudSettingsInput = z.infer<typeof whatsappCloudSettingsInputSchema>;
export type ChatbotResponseEntry = z.infer<typeof chatbotResponseEntrySchema>;
export type ChatbotConversationUpdate = z.infer<typeof chatbotConversationUpdateSchema>;
export type ChatbotRespondInput = z.infer<typeof chatbotRespondSchema>;
export type ChatbotRecontactInput = z.infer<typeof chatbotRecontactSchema>;
export type ChatbotLogActionInput = z.infer<typeof chatbotLogActionSchema>;

export const quoteItemCreateSchema = z
  .object({
    productId: nullableIdSchema,
    name: text,
    lineId: nullableIdSchema,
    quantity: z.number().int().positive(),
    costCents: moneyCentsSchema,
    // Puede ser negativo (vender por debajo del costo); -100 % es el piso (venta 0).
    markupBps: z.number().int().min(-10000),
    salePriceCents: moneyCentsSchema.optional(),
    position: z.number().int().nonnegative(),
    observation: z.string().trim().max(1000).nullable().optional(),
    isPcMainLine: z.boolean().optional().default(false),
  })
  .strict();

/** Productos que entrega el cliente como parte de pago. `showValues` decide si el PDF muestra a cuánto se toman. */
export const quoteTradeInsSchema = z
  .object({
    showValues: z.boolean(),
    items: z
      .array(z.object({ name: z.string().trim().min(1).max(200), valueCents: moneyCentsSchema }).strict())
      .min(1)
      .max(20),
  })
  .strict();

const quoteBaseShape = {
  internalName: text,
  requestId: nullableIdSchema,
  customerId: nullableIdSchema,
  isBuiltPc: z.boolean().optional().default(false),
  /// 'COMBO' = pack de productos que se publica en la tienda como un producto único (ver BLOCK-10).
  kind: z.enum(['PC', 'COMBO']).optional(),
  publicObservation: z.string().trim().max(4000).nullable().optional(),
  pdfOverrides: z.record(fieldOverrideSchema).optional(),
  tradeIns: quoteTradeInsSchema.nullable().optional(),
  resolvedPdfConfig: z.record(z.unknown()).optional().default({}),
  financingSnapshot: z.record(z.unknown()).nullable().optional(),
  collectionIds: z.array(idSchema).optional().default([]),
  items: z.array(quoteItemCreateSchema).min(1),
};
export const quoteCreateSchema = z.object(quoteBaseShape).strict();
export const quoteUpdateSchema = z
  .object({
    reason: z.string().trim().max(1000).nullable().optional(),
    internalName: text.optional(),
    requestId: nullableIdSchema,
    customerId: nullableIdSchema,
    isBuiltPc: z.boolean().optional(),
    kind: z.enum(['PC', 'COMBO']).optional(),
    publicObservation: z.string().trim().max(4000).nullable().optional(),
    pdfOverrides: z.record(fieldOverrideSchema).optional(),
    tradeIns: quoteTradeInsSchema.nullable().optional(),
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
    reason: z.string().trim().max(1000).nullable().optional(),
    sourceVersion: z.number().int().positive().optional(),
    publicObservation: z.string().trim().max(4000).nullable().optional(),
    pdfOverrides: z.record(fieldOverrideSchema).optional(),
    tradeIns: quoteTradeInsSchema.nullable().optional(),
    resolvedPdfConfig: z.record(z.unknown()).optional(),
    financingSnapshot: z.record(z.unknown()).nullable().optional(),
    items: z.array(quoteItemCreateSchema).min(1).optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.sourceVersion === undefined ||
      (v.items === undefined &&
        v.publicObservation === undefined &&
        v.pdfOverrides === undefined &&
        v.tradeIns === undefined &&
        v.resolvedPdfConfig === undefined &&
        v.financingSnapshot === undefined),
    'Al restaurar una versión no se pueden mezclar cambios de contenido',
  );
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
    version: z.number().int().min(1).optional(),
    chatKey: z.string().trim().min(1).max(200).optional(),
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

/** "false" y "0" en la query son falso. z.coerce.boolean() los lee como true. */
const queryFlagSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const flag = value.trim().toLowerCase();
  if (flag === 'true' || flag === '1') return true;
  if (flag === 'false' || flag === '0') return false;
  return value;
}, z.boolean());

export const quoteSearchSchema = z
  .object({
    q: z.string().trim().max(300).optional(),
    state: quoteStateEnum.optional(),
    customerId: idSchema.optional(),
    collectionId: idSchema.optional(),
    branchId: idSchema.optional(),
    phone: z.string().trim().max(100).optional(),
    productName: z.string().trim().max(300).optional(),
    visibleNumber: z.string().trim().max(100).optional(),
    isBuiltPc: queryFlagSchema.optional(),
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

export const catalogQuerySchema = z
  .object({
    q: z.string().trim().max(300).optional(),
    productType: z.string().trim().max(300).optional(),
    brand: z.string().trim().max(300).optional(),
    availability: z.string().trim().max(100).optional(),
    inStock: z.coerce.boolean().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    sort: z
      .enum(['price_asc', 'price_desc', 'name_asc', 'name_desc', 'stock_desc'])
      .optional()
      .default('name_asc'),
    page: z.coerce.number().int().positive().optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).optional().default(40),
  })
  .strict()
  .refine(
    (value) => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice,
    'El precio mínimo no puede superar al máximo',
  );

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

// `tier` es el texto cualitativo que ya mostraba la ficha; `resolution`,
// `settings` y `note` vienen del análisis profundo (opcionales para no
// romper enriquecimientos viejos).
export const quoteEnrichmentGameSchema=z.object({name:z.string().trim().min(1).max(200),tier:z.string().trim().min(1).max(300),resolution:z.string().trim().max(60).nullable().optional(),settings:z.string().trim().max(60).nullable().optional(),fps:z.string().trim().max(40).nullable().optional(),note:z.string().trim().max(300).nullable().optional()}).strict();
export const quoteEnrichmentProgramSchema=z.object({name:z.string().trim().min(1).max(200),note:z.string().trim().min(1).max(500)}).strict();
export const quoteEnrichmentUpdateSchema=z.object({descriptionHtml:z.string().max(20000).nullable().optional(),powerWatts:z.number().int().min(0).max(10000).nullable().optional(),recommendedPsuWatts:z.number().int().min(0).max(10000).nullable().optional(),powerNote:z.string().trim().max(2000).nullable().optional(),games:z.array(quoteEnrichmentGameSchema).max(50).optional(),programs:z.array(quoteEnrichmentProgramSchema).max(50).optional(),compatibility:z.array(z.string().trim().min(1).max(500)).max(100).optional(),title:z.string().trim().max(120).nullable().optional(),tagline:z.string().trim().max(200).nullable().optional(),shortDescription:z.string().trim().max(400).nullable().optional(),highlights:z.array(z.string().trim().min(1).max(200)).max(12).optional(),audience:z.string().trim().max(300).nullable().optional()}).strict();
export const wordpressPublishItemSchema=z.object({name:z.string(),imageUrl:z.string().url().nullable(),description:z.string().nullable().optional(),specs:z.record(z.unknown())}).strict();
export const wordpressPublishPayloadSchema=z.object({externalId:idSchema,legacyExternalIds:z.array(idSchema),versionNumber:z.number().int(),title:z.string(),tagline:z.string().nullable(),shortDescription:z.string().nullable(),highlights:z.array(z.string()),audience:z.string().nullable(),gallery:z.array(z.string().url()),slug:z.string(),priceListCents:z.string().regex(/^\d+$/),priceCashCents:z.string().regex(/^\d+$/),priceTransferCents:z.string().regex(/^\d+$/),installments:z.array(z.record(z.unknown())),items:z.array(wordpressPublishItemSchema),model3dUrl:z.string().url().nullable(),thumbnailUrl:z.string().url().nullable(),heroImageUrl:z.string().url().nullable(),descriptionHtml:z.string().nullable(),power:z.object({watts:z.number().int().nullable(),psu:z.number().int().nullable(),note:z.string().nullable()}).strict(),games:z.array(quoteEnrichmentGameSchema),compatibility:z.array(z.string())}).strict();
export type WordpressPublishPayload=z.infer<typeof wordpressPublishPayloadSchema>;

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductImportInput = z.infer<typeof productImportSchema>;
export type ProductBulkDeleteInput = z.infer<typeof productBulkDeleteSchema>;
export type ProductMergeInput = z.infer<typeof productMergeSchema>;
export type ProductBulkMergeInput = z.infer<typeof productBulkMergeSchema>;
export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerQuickCreateInput = z.infer<typeof customerQuickCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type PcLineCreateInput = z.infer<typeof pcLineCreateSchema>;
export type PcLineUpdateInput = z.infer<typeof pcLineUpdateSchema>;
export type QuoteTradeIns = z.infer<typeof quoteTradeInsSchema>;
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
export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
export type NotificationMarkInput = z.infer<typeof notificationMarkSchema>;
export type AiAnalyzeRequestInput = z.infer<typeof aiAnalyzeRequestSchema>;
export type AiSuggestResponseInput = z.infer<typeof aiSuggestResponseSchema>;
export type AiCompatibilityInput = z.infer<typeof aiCompatibilitySchema>;
export type AiIntentInput = z.infer<typeof aiIntentSchema>;
export type QuoteEnrichmentUpdateInput=z.infer<typeof quoteEnrichmentUpdateSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type BranchCreateInput = z.infer<typeof branchCreateSchema>;
export type BranchUpdateInput = z.infer<typeof branchUpdateSchema>;

export const navItemIdSchema = z.enum([
  'dashboard', 'solicitudes', 'presupuestos', 'colecciones', 'calculadora', 'mi-cuenta',
  'clientes', 'productos', 'catalogo-acustock', 'combos', 'lineas',
  'notificaciones', 'recontactos', 'editor-pdf', 'usuarios', 'empleados',
  'modulo-externo', 'configuracion',
]);

export const navPreferencesSchema = z
  .object({
    version: z.literal(1),
    groups: z.array(z.object({
      id: z.string().trim().min(1).max(100),
      label: z.string().trim().min(1).max(100),
      collapsed: z.boolean(),
    }).strict()).max(50),
    items: z.array(z.object({
      id: navItemIdSchema,
      groupId: z.string().trim().min(1).max(100),
      order: z.number().int().min(0),
      hidden: z.boolean(),
    }).strict()).max(200),
  })
  .strict()
  .superRefine((value, ctx) => {
    const groupIds = new Set<string>();
    value.groups.forEach((group, index) => {
      if (groupIds.has(group.id)) ctx.addIssue({code: z.ZodIssueCode.custom, path: ['groups', index, 'id'], message: 'ID de grupo duplicado'});
      groupIds.add(group.id);
    });
    const itemIds = new Set<string>();
    value.items.forEach((item, index) => {
      if (itemIds.has(item.id)) ctx.addIssue({code: z.ZodIssueCode.custom, path: ['items', index, 'id'], message: 'ID de ítem duplicado'});
      if (!groupIds.has(item.groupId)) ctx.addIssue({code: z.ZodIssueCode.custom, path: ['items', index, 'groupId'], message: 'El grupo no existe'});
      itemIds.add(item.id);
    });
  });
export type NavPreferences = z.infer<typeof navPreferencesSchema>;

// --- Gastos mensuales recurrentes -------------------------------------------
// El gasto es el concepto (no tiene monto propio); el importe y si está pago
// se pueden cargar en el alta o después, mes a mes. Los importes viajan como
// centavos en string, igual que en el resto.
export const expenseCreateSchema = z.object({
  name: z.string().trim().min(1).max(150),
  note: z.string().trim().max(500).nullable().optional(),
  /// Si viene, se carga el importe del período en el mismo alta (centavos).
  amountCents: moneyCentsSchema.optional(),
  paid: z.boolean().optional().default(false),
  period: z.string().regex(/^\d{6}$/, 'El período debe tener formato YYYYMM').optional(),
}).strict().refine((v) => !v.paid || !!v.amountCents, {
  message: 'Para marcarlo como pagado, cargá el importe',
});
export const expenseUpdateSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0, 'Se requiere al menos un campo');
export const expensePaymentSchema = z.object({
  /// Vacío o null borra el pago de ese mes (queda "sin cargar", que no es lo
  /// mismo que "pagué $0").
  amountCents: moneyCentsSchema.nullable(),
  note: z.string().trim().max(500).nullable().optional(),
  paid: z.boolean().optional(),
}).strict();
export const expensesQuerySchema = z.object({
  period: z.string().regex(/^\d{6}$/, 'El período debe tener formato YYYYMM').optional(),
  includeArchived: z.enum(['0', '1']).optional(),
}).strict();
export const expensesUnlockSchema = z.object({ key: z.string().min(1).max(200) }).strict();
export type ExpenseCreateInput = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateSchema>;
export type ExpensePaymentInput = z.infer<typeof expensePaymentSchema>;
export type ExpensesQuery = z.infer<typeof expensesQuerySchema>;
export type ExpensesUnlockInput = z.infer<typeof expensesUnlockSchema>;
export const expensePaidSchema = z.object({ paid: z.boolean() }).strict();
export type ExpensePaidInput = z.infer<typeof expensePaidSchema>;
