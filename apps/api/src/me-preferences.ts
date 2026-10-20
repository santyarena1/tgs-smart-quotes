import {Body, Controller, Get, Put} from '@nestjs/common';
import {navPreferencesSchema, type NavPreferences} from '@tgs/contracts';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {CurrentUser, type RequestUser, ZodPipe} from './infrastructure.js';

const UI_SKINS = ['original', 'tgs', 'minimal', 'bluered', 'darkyellow', 'halloween', 'gamer', 'gotham', 'simplicity'] as const;
const uiSkinSchema = z.object({skin: z.enum(UI_SKINS)}).strict();
const DEFAULT_UI_SKIN = 'tgs';
const litePrefsSchema = z.object({hideFinancing: z.boolean()}).strict().partial();
type LitePrefs = {hideFinancing: boolean};

function readLitePrefs(raw: unknown): LitePrefs {
  const parsed = litePrefsSchema.safeParse(raw ?? {});
  return {hideFinancing: parsed.success ? parsed.data.hideFinancing === true : false};
}

@Controller('me')
export class MePreferencesController {
  @Get('nav-preferences')
  async getNavPreferences(@CurrentUser() user: RequestUser) {
    const row = await db.user.findUniqueOrThrow({where: {id: user.id}, select: {navPrefsJson: true}});
    return row.navPrefsJson;
  }

  /** Tema visual del usuario: solo cambia el aspecto, nunca la estructura. */
  @Get('ui-skin')
  async getUiSkin(@CurrentUser() user: RequestUser) {
    const row = await db.user.findUniqueOrThrow({where: {id: user.id}, select: {uiSkin: true}});
    const skin = (UI_SKINS as readonly string[]).includes(row.uiSkin ?? '') ? row.uiSkin : DEFAULT_UI_SKIN;
    // chosen=false: todavía no vio el aviso de temas (se muestra una sola vez y al cerrarlo se guarda).
    return {skin, chosen: row.uiSkin != null};
  }

  @Put('ui-skin')
  async putUiSkin(@Body(new ZodPipe(uiSkinSchema)) body: {skin: (typeof UI_SKINS)[number]}, @CurrentUser() user: RequestUser) {
    await db.user.update({where: {id: user.id}, data: {uiSkin: body.skin}});
    return {skin: body.skin};
  }

  /** Preferencias de la interfaz LITE (por ejemplo, ocultar la columna de financiación). */
  @Get('lite-preferences')
  async getLitePreferences(@CurrentUser() user: RequestUser) {
    const row = await db.user.findUniqueOrThrow({where: {id: user.id}, select: {litePrefsJson: true}});
    return readLitePrefs(row.litePrefsJson);
  }

  @Put('lite-preferences')
  async putLitePreferences(@Body(new ZodPipe(litePrefsSchema)) body: Partial<LitePrefs>, @CurrentUser() user: RequestUser) {
    const row = await db.user.findUniqueOrThrow({where: {id: user.id}, select: {litePrefsJson: true}});
    const next = {...readLitePrefs(row.litePrefsJson), ...body};
    await db.user.update({where: {id: user.id}, data: {litePrefsJson: next as Prisma.InputJsonValue}});
    return next;
  }

  @Put('nav-preferences')
  async putNavPreferences(
    @Body(new ZodPipe(navPreferencesSchema)) body: NavPreferences,
    @CurrentUser() user: RequestUser,
  ) {
    const row = await db.user.update({
      where: {id: user.id},
      data: {navPrefsJson: body as Prisma.InputJsonValue},
      select: {navPrefsJson: true},
    });
    return row.navPrefsJson;
  }
}
