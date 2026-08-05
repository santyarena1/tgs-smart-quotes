import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Body,
  Res,
} from '@nestjs/common';
import {db} from '@tgs/database';
import {
  idSchema,
  pdfGenerateSchema,
  pdfKindSchema,
  type PdfGenerateInput,
} from '@tgs/contracts';
import {
  createPdfStorageFromEnv,
  generateAndStorePdf,
  pdfFileName,
  pdfInputHash,
  renderPdfBuffer,
  resolvePdfFlags,
  sha256Hex,
  type PdfFinancingPlan,
  type PdfItem,
  type PdfKind,
  type PdfRenderInput,
  type PdfResolvedConfig,
  type PdfTemplate,
} from '@tgs/pdf';
import {activeVersion,audit,loadFamily,statusEvent} from './quotes.js';
import {CurrentUser,jsonSafe,SkipRateLimit,type RequestUser,ZodPipe} from './infrastructure.js';
import {resolveLogoForPdf} from './branding-storage.js';

// Instancia única del storage (local o S3 según env). Ver `.env.example` PDF_STORAGE_DRIVER/PDF_LOCAL_DIR/S3_*.
const pdfStorage = createPdfStorageFromEnv(process.env);

/**
 * Arma el `PdfRenderInput` a partir de la familia/versión/settings actuales. La fecha usa
 * `version.createdAt` (no "hoy"): así el hash del PDF es estable mientras el borrador no cambie de
 * contenido, y el número de presupuesto siempre queda fechado según cuándo se creó esa versión.
 */
async function buildRenderInput(tx: any, family: any, version: any, kind: PdfKind): Promise<PdfRenderInput> {
  const [company, pdfSettings, financingPlans, creatorBranch] = await Promise.all([
    tx.companySettings.findUniqueOrThrow({where: {id: 'singleton'}}),
    tx.pdfSettings.findUniqueOrThrow({where: {id: 'singleton'}}),
    tx.financingPlan.findMany({where: {active: true}, orderBy: [{sortOrder: 'asc'}]}),
    version.creatorId
      ? tx.user.findUnique({
          where: {id: version.creatorId},
          select: {branch: {select: {address: true, phones: true}}},
        }).then((user: any) => user?.branch ?? null)
      : null,
  ]);

  const defaults: PdfResolvedConfig = {
    showListPrice: pdfSettings.showListPrice,
    showCashTransfer: pdfSettings.showCashTransfer,
    showFinancing: pdfSettings.showFinancing,
    showBbva: pdfSettings.showBbva,
    showOtherBanks: pdfSettings.showOtherBanks,
    showFinancingNote: pdfSettings.showFinancingNote,
    showTaxData: pdfSettings.showTaxData,
    showServicesBlock: pdfSettings.showServicesBlock,
    showWindows: pdfSettings.showWindows,
    showDrivers: pdfSettings.showDrivers,
    showDelay: pdfSettings.showDelay,
    showRma: pdfSettings.showRma,
    showExtraObservation: pdfSettings.showExtraObservation,
    showIndividualPrices: pdfSettings.showIndividualPrices,
    showComponentDetail: pdfSettings.showComponentDetail,
    builtPcTitle: pdfSettings.builtPcTitle,
    builtPcDescription: pdfSettings.builtPcDescription,
    assemblyText: pdfSettings.assemblyText,
    installText: pdfSettings.installText,
    windowsText: pdfSettings.windowsText,
    driversText: pdfSettings.driversText,
    estimatedDelay: pdfSettings.estimatedDelay,
    rmaText: pdfSettings.rmaText,
  };
  const config = resolvePdfFlags(defaults, version.pdfOverrides as Record<string, 'HEREDAR' | 'MOSTRAR' | 'OCULTAR'> | null);

  const rawItems = [...version.items].sort((a: any, b: any) => a.position - b.position);
  let items: PdfItem[];

  if (family.isBuiltPc) {
    // PC armada: una línea principal con el total + componentes debajo.
    // No dependemos de isPcMainLine en DB (casi nunca se setea desde el editor).
    const totalSale = version.totalSaleCents as bigint;
    const mainName = [
      config.builtPcTitle || 'Presupuesto de PC Armada',
      config.builtPcDescription || null,
    ]
      .filter(Boolean)
      .join(' — ');
    items = [
      {
        code: '001',
        name: mainName,
        quantity: 1,
        unitCents: totalSale,
        subtotalCents: totalSale,
        isMainLine: true,
        isComponent: false,
      },
      ...rawItems.map((item: any, index: number) => ({
        code: String(index + 2).padStart(3, '0'),
        name: item.frozenName,
        quantity: item.quantity,
        unitCents: item.frozenSalePriceCents,
        subtotalCents: item.subtotalCents,
        isMainLine: false,
        isComponent: true,
      })),
    ];
  } else {
    items = rawItems.map((item: any, index: number) => ({
      code: String(index + 1).padStart(3, '0'),
      name: item.frozenName,
      quantity: item.quantity,
      unitCents: item.frozenSalePriceCents,
      subtotalCents: item.subtotalCents,
      isMainLine: false,
      isComponent: false,
    }));
  }

  const financing: PdfFinancingPlan[] = financingPlans.map((plan: any) => ({
    bank: plan.bank,
    installments: plan.installments,
    interestBps: plan.interestBps,
    description: plan.description,
    sortOrder: plan.sortOrder,
  }));

  const cashTotalCents = version.totalSaleCents as bigint;
  const listTotalCents =
    (cashTotalCents * BigInt(10000 + company.listInterestBps) + 5000n) / 10000n;

  return {
    kind,
    number: family.visibleNumber,
    date: version.createdAt,
    template: (pdfSettings.template ?? 'CLASICO') as PdfTemplate,
    validUntil: pdfSettings.validityDays != null
      ? new Date(version.createdAt.getTime() + pdfSettings.validityDays * 86400000)
      : null,
    financingBbvaNote: pdfSettings.financingBbvaNote ?? null,
    isBuiltPc: family.isBuiltPc,
    observation: version.publicObservation,
    listTotalCents,
    cashTotalCents,
    company: {
      name: company.name,
      taxCondition: company.taxCondition,
      cuit: company.cuit,
      grossIncome: company.grossIncome,
      activityStart: company.activityStart,
      address: creatorBranch?.address ?? company.address,
      phones: creatorBranch?.phones ?? company.phones,
      footerText: company.footerText,
      rmaUrl: company.rmaUrl,
      primaryColor: company.primaryColor,
      accentColor: company.accentColor,
      logoUrl: await resolveLogoForPdf(company.logoUrl),
    },
    config,
    items,
    financing,
    layout:
      pdfSettings.layoutJson &&
      typeof pdfSettings.layoutJson === 'object' &&
      !Array.isArray(pdfSettings.layoutJson) &&
      Object.keys((pdfSettings.layoutJson as Record<string, unknown>).blocks as object ?? {}).length
        ? (pdfSettings.layoutJson as PdfRenderInput['layout'])
        : undefined,
  };
}

function storageKeyFor(family: any, version: any, kind: PdfKind) {
  return `${family.id}/${pdfFileName(family.visibleNumber, version.version, kind)}`;
}

@Controller('quotes')
export class PdfController {
  private async generateVersionPdf(id: string, versionNumber: number, kind:PdfKind, actor: RequestUser) {
    return db.$transaction(async (tx) => {
      const family = await loadFamily(tx, id);
      const version = family.versions.find((item: any) => item.version === versionNumber);
      if (!version) throw new NotFoundException('Versión inexistente');
      const existing = await tx.quotePdf.findUnique({
        where: {versionId_kind: {versionId: version.id, kind}},
      });
      if (existing) return jsonSafe({...existing, reused: true, immutable: version.state !== 'BORRADOR'});
      const renderInput = await buildRenderInput(tx, family, version, kind);
      const stored = await generateAndStorePdf({
        input: renderInput,
        storage: pdfStorage,
        storageKey: storageKeyFor(family, version, kind),
      });
      const pdf = await tx.quotePdf.create({data: {
        versionId: version.id, kind, storageKey: stored.storageKey, sha256: stored.sha256,
        sizeBytes: stored.sizeBytes, inputHash: stored.inputHash, driver: stored.driver,
        configJson: renderInput.config as any,
      }});
      await statusEvent(tx, {
        type: 'PDF_GENERADO', familyId: id, versionId: version.id, requestId: family.requestId,
        customerId: family.customerId, userId: actor.id, next: {kind, version: versionNumber},
        metadata: {historical: version.version !== family.activeVersion},
      });
      await audit(tx, actor.id, 'QuotePdf', pdf.id, 'CREATE', null, pdf);
      return jsonSafe({...pdf, reused: false, immutable: version.state !== 'BORRADOR'});
    });
  }

  @Post(':id/versions/:version/pdf')
  async generateHistorical(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Param('version') versionParam: string,
    @Body(new ZodPipe(pdfGenerateSchema)) body:PdfGenerateInput,
    @CurrentUser() actor: RequestUser,
  ) {
    const version = Number(versionParam);
    if (!Number.isInteger(version) || version < 1) throw new BadRequestException('Versión inválida');
    return this.generateVersionPdf(id, version, body.kind, actor);
  }

  @Get([':id/versions/:version/pdf',':id/versions/:version/pdf/:kind'])
  @SkipRateLimit()
  async downloadHistorical(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Param('version') versionParam: string,
    @Param('kind') kindParam:string|undefined,
    @Res() res: any,
  ) {
    const versionNumber = Number(versionParam);
    const kind=kindParam?pdfKindSchema.parse(kindParam):'SIMPLE';
    const pdf = await db.quotePdf.findFirst({
      where: {kind, version: {familyId: id, version: versionNumber}},
      include: {version: {include: {family: true}}},
    });
    if (!pdf) throw new NotFoundException('El PDF todavía no fue generado');
    const buffer = await pdfStorage.get(pdf.storageKey).catch(() => null);
    if (!buffer) throw new NotFoundException('No se pudo leer el PDF almacenado');
    res.header('Content-Type', 'application/pdf');
    res.header('Content-Disposition', `inline; filename="${pdfFileName(pdf.version.family.visibleNumber, versionNumber, kind)}"`);
    res.header('Content-Length', String(buffer.byteLength));
    res.send(buffer);
  }

  /**
   * Genera (o reutiliza) el PDF de una versión. Reglas (ver `docs/specs/BLOCK-3.md`):
   * - Si ya existe un PDF para (versión, kind) y la versión NO es BORRADOR, el PDF es histórico e
   *   inmutable (`historicalPdfIsImmutable`): siempre se reutiliza, sin importar `force`.
   * - Si es BORRADOR y existe un PDF con el mismo `inputHash` y `!force`, se reutiliza.
   * - En cualquier otro caso (BORRADOR + force, o BORRADOR + hash distinto) se regenera.
   */
  @Post(':id/pdf')
  async generate(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(pdfGenerateSchema)) body: PdfGenerateInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return db.$transaction(async (tx) => {
      const family = await loadFamily(tx, id);
      const version = activeVersion(family);
      const existing = await tx.quotePdf.findUnique({
        where: {versionId_kind: {versionId: version.id, kind: body.kind}},
      });

      const renderInput = await buildRenderInput(tx, family, version, body.kind);
      const computedHash = pdfInputHash(renderInput);

      if (existing && version.state !== 'BORRADOR') {
        return jsonSafe({...existing, reused: true, immutable: true});
      }
      if (existing && !body.force && existing.inputHash === computedHash) {
        return jsonSafe({...existing, reused: true, immutable: false});
      }

      const stored = await generateAndStorePdf({
        input: renderInput,
        storage: pdfStorage,
        storageKey: storageKeyFor(family, version, body.kind),
      });

      const pdf = await tx.quotePdf.upsert({
        where: {versionId_kind: {versionId: version.id, kind: body.kind}},
        create: {
          versionId: version.id,
          kind: body.kind,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          sizeBytes: stored.sizeBytes,
          inputHash: stored.inputHash,
          driver: stored.driver,
          configJson: renderInput.config as any,
        },
        update: {
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          sizeBytes: stored.sizeBytes,
          inputHash: stored.inputHash,
          driver: stored.driver,
          configJson: renderInput.config as any,
        },
      });

      await statusEvent(tx, {
        type: 'PDF_GENERADO',
        familyId: id,
        versionId: version.id,
        requestId: family.requestId,
        customerId: family.customerId,
        userId: actor.id,
        previous: existing ? {inputHash: existing.inputHash} : null,
        next: {inputHash: pdf.inputHash, kind: body.kind},
        metadata: {force: body.force, reused: false},
      });
      await audit(tx, actor.id, 'QuotePdf', pdf.id, existing ? 'REGENERATE' : 'CREATE', existing ?? null, pdf);

      return jsonSafe({...pdf, reused: false, immutable: false});
    });
  }

  /** Lista todos los PDFs históricos de la familia (todas las versiones). */
  @Get(':id/pdfs')
  async listPdfs(@Param('id', new ZodPipe(idSchema)) id: string) {
    const family = await db.quoteFamily.findUnique({where: {id}});
    if (!family) throw new NotFoundException('Presupuesto inexistente');
    const pdfs = await db.quotePdf.findMany({
      where: {version: {familyId: id}},
      include: {version: {select: {id: true, version: true, state: true}}},
      orderBy: [{createdAt: 'desc'}, {id: 'asc'}],
    });
    return jsonSafe({
      familyId: id,
      activeVersion: family.activeVersion,
      items: pdfs.map((pdf) => ({
        id: pdf.id,
        kind: pdf.kind,
        versionId: pdf.versionId,
        versionNumber: pdf.version.version,
        versionState: pdf.version.state,
        sizeBytes: pdf.sizeBytes,
        sha256: pdf.sha256,
        createdAt: pdf.createdAt,
        isActiveVersion: pdf.version.version === family.activeVersion,
      })),
    });
  }

  /** Descarga un PDF histórico por id (no solo el de la versión activa). */
  @Get(':id/pdfs/:pdfId')
  @SkipRateLimit()
  async downloadById(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Param('pdfId', new ZodPipe(idSchema)) pdfId: string,
    @Res() res: any,
  ) {
    const pdf = await db.quotePdf.findFirst({
      where: {id: pdfId, version: {familyId: id}},
      include: {version: {include: {family: true}}},
    });
    if (!pdf) throw new NotFoundException('PDF inexistente');

    let buffer: Buffer;
    try {
      buffer = await pdfStorage.get(pdf.storageKey);
    } catch {
      throw new NotFoundException('No se pudo leer el PDF almacenado');
    }

    res.header('Content-Type', 'application/pdf');
    res.header(
      'Content-Disposition',
      `inline; filename="${pdfFileName(pdf.version.family.visibleNumber, pdf.version.version, pdf.kind)}"`,
    );
    res.header('Content-Length', String(buffer.byteLength));
    res.send(buffer);
  }

  @Get(':id/pdf/:kind')
  @SkipRateLimit()
  async download(
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Param('kind', new ZodPipe(pdfKindSchema)) kind: PdfKind,
    @Res() res: any,
  ) {
    const family = await db.quoteFamily.findUnique({
      where: {id},
      include: {versions: {orderBy: {version: 'desc'}}},
    });
    if (!family) throw new NotFoundException('Presupuesto inexistente');
    const version = family.versions.find((v: any) => v.version === family.activeVersion) ?? family.versions[0];
    if (!version) throw new NotFoundException('Versión activa inexistente');

    const pdf = await db.quotePdf.findUnique({
      where: {versionId_kind: {versionId: version.id, kind}},
    });
    if (!pdf) {
      throw new NotFoundException('El PDF todavía no fue generado; use POST /quotes/:id/pdf primero');
    }

    let buffer: Buffer;
    try {
      buffer = await pdfStorage.get(pdf.storageKey);
    } catch {
      throw new NotFoundException('No se pudo leer el PDF almacenado');
    }

    res.header('Content-Type', 'application/pdf');
    res.header(
      'Content-Disposition',
      `inline; filename="${pdfFileName(family.visibleNumber, version.version, kind)}"`,
    );
    res.header('Content-Length', String(buffer.byteLength));
    res.send(buffer);
  }
}

// Reexport para que otros módulos (tests, worker) puedan forzar un render sin pasar por HTTP.
export {buildRenderInput as buildPdfRenderInputForQuote, pdfStorage, renderPdfBuffer, sha256Hex};
