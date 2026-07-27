import {
  Controller,
  Get,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import {createReadStream, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {CurrentUser, Public, type RequestUser} from './infrastructure.js';

/** ID estable de la extensión (derivado del `key` del manifest). */
export const TGS_EXTENSION_ID = 'edfnidnbmlepdddpofocidojlfphjdkc';
export const TGS_EXTENSION_VERSION = '1.4.0';

function resolveExtensionZip(): string | null {
  const fromEnv = process.env.EXTENSION_ZIP_PATH?.trim();
  const candidates = [
    fromEnv,
    path.resolve(process.cwd(), 'storage/extension/tgs-extension.zip'),
    path.resolve(process.cwd(), 'apps/extension/tgs-extension.zip'),
    path.resolve(process.cwd(), '../extension/tgs-extension.zip'),
    path.resolve(process.cwd(), '../../storage/extension/tgs-extension.zip'),
    path.resolve(process.cwd(), '../../apps/extension/tgs-extension.zip'),
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

@Controller('settings/extension')
export class ExtensionSettingsController {
  @Get('info')
  info() {
    const zip = resolveExtensionZip();
    let sizeBytes: number | null = null;
    if (zip) {
      try {
        sizeBytes = statSync(zip).size;
      } catch {
        sizeBytes = null;
      }
    }
    return {
      available: Boolean(zip),
      version: TGS_EXTENSION_VERSION,
      extensionId: TGS_EXTENSION_ID,
      downloadPath: '/settings/extension/download',
      sizeBytes,
      apiPublicUrl: (process.env.API_PUBLIC_URL ?? 'http://localhost:3001/api').replace(/\/$/, ''),
      webOrigin: process.env.APP_ORIGIN ?? 'http://localhost:3000',
      whatsappUrl: 'https://web.whatsapp.com',
    };
  }

  @Get('download')
  download() {
    const zip = resolveExtensionZip();
    if (!zip) {
      throw new NotFoundException(
        'ZIP de la extensión no encontrado. Ejecutá `pnpm extension:zip` en el servidor.',
      );
    }
    return new StreamableFile(createReadStream(zip), {
      type: 'application/zip',
      disposition: 'attachment; filename="tgs-extension.zip"',
    });
  }

  /**
   * Verifica la conexión del sistema que usa el plugin (API + sesión actual).
   * La verificación del plugin instalado se hace desde el navegador con chrome.runtime.
   */
  @Get('connection-test')
  async connectionTest(@CurrentUser() user: RequestUser) {
    return {
      ok: true,
      api: true,
      session: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      extensionId: TGS_EXTENSION_ID,
      checkedAt: new Date().toISOString(),
      hint: 'Si el plugin está instalado, Configuración también puede pinguearlo por chrome.runtime.',
    };
  }

  @Public()
  @Get('instructions')
  instructions() {
    return {
      title: 'TGS Presupuestos Pro — Extensión Chrome',
      extensionId: TGS_EXTENSION_ID,
      steps: [
        'Descargá el ZIP desde Configuración → Extensión Chrome.',
        'Descomprimí el ZIP en una carpeta fija (no la borres después).',
        'Abrí chrome://extensions y activá “Modo de desarrollador”.',
        'Pulsá “Cargar descomprimida” y elegí esa carpeta (debe tener manifest.json).',
        'Iniciá sesión en http://localhost:3000 en el mismo Chrome.',
        'Abrí https://web.whatsapp.com: a la derecha aparece el panel TGS.',
        'En el panel, el estado debe decir “Conectado”. Si dice “Sin sesión”, volvé a iniciar sesión en TGS.',
        'Buscá un presupuesto, generá PDF, insertá el mensaje en el chat y enviá VOS en WhatsApp (nunca se envía solo).',
        'Confirmá el intento de envío en el panel (Confirmar / No se envió / Revisar).',
      ],
      neverAutoSend: true,
      apiBase: 'http://localhost:3001/api',
    };
  }
}
