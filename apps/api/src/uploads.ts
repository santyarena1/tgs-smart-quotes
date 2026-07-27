import {
  Controller,
  Get,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import {createReadStream} from 'node:fs';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {Public} from './infrastructure.js';
import {
  brandingFilePath,
  mimeForBrandingFilename,
} from './branding-storage.js';

@Controller('uploads')
export class UploadsController {
  @Public()
  @Get('branding/:file')
  async brandingLogo(@Param('file') file: string) {
    let fullPath: string;
    let mime: string;
    try {
      fullPath = brandingFilePath(file);
      mime = mimeForBrandingFilename(file);
    } catch {
      throw new NotFoundException('Logo inexistente');
    }
    try {
      await access(fullPath, constants.R_OK);
    } catch {
      throw new NotFoundException('Logo inexistente');
    }
    return new StreamableFile(createReadStream(fullPath), {
      type: mime,
      disposition: `inline; filename="${file}"`,
    });
  }
}
