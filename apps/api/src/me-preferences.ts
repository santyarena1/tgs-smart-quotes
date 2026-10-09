import {Body, Controller, Get, Put} from '@nestjs/common';
import {navPreferencesSchema, type NavPreferences} from '@tgs/contracts';
import {db, Prisma} from '@tgs/database';
import {z} from 'zod';
import {CurrentUser, type RequestUser, ZodPipe} from './infrastructure.js';

const UI_SKINS = ['original', 'tgs', 'minimal', 'bluered', 'darkyellow', 'gamer', 'gotham', 'simplicity'] as const;
const uiSkinSchema = z.object({skin: z.enum(UI_SKINS)}).strict();
const DEFAULT_UI_SKIN = 'tgs';

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
