import {Body, Controller, Get, Put} from '@nestjs/common';
import {navPreferencesSchema, type NavPreferences} from '@tgs/contracts';
import {db, Prisma} from '@tgs/database';
import {CurrentUser, type RequestUser, ZodPipe} from './infrastructure.js';

@Controller('me')
export class MePreferencesController {
  @Get('nav-preferences')
  async getNavPreferences(@CurrentUser() user: RequestUser) {
    const row = await db.user.findUniqueOrThrow({where: {id: user.id}, select: {navPrefsJson: true}});
    return row.navPrefsJson;
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
