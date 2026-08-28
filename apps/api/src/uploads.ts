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
import {
  calculatorIconFilePath,
  mimeForCalculatorIconFilename,
} from './calculator-storage.js';
import {chatbotRuleImageMime, chatbotRuleImagePath} from './chatbot-storage.js';

@Controller('uploads')
export class UploadsController {
  @Get('chatbot-rules/:file')
  async chatbotRuleImage(@Param('file') file:string) {
    let fullPath:string;
    try{fullPath=chatbotRuleImagePath(file)}catch{throw new NotFoundException('Imagen de regla inexistente')}
    try{await access(fullPath,constants.R_OK)}catch{throw new NotFoundException('Imagen de regla inexistente')}
    return new StreamableFile(createReadStream(fullPath),{
      type:chatbotRuleImageMime(file),
      disposition:`inline; filename="${file}"`,
    });
  }

  @Public()
  @Get('calculator/:file')
  async calculatorIcon(@Param('file') file: string) {
    let fullPath: string;
    let mime: string;
    try {
      fullPath = calculatorIconFilePath(file);
      mime = mimeForCalculatorIconFilename(file);
    } catch {
      throw new NotFoundException('Icono inexistente');
    }
    try {
      await access(fullPath, constants.R_OK);
    } catch {
      throw new NotFoundException('Icono inexistente');
    }
    return new StreamableFile(createReadStream(fullPath), {
      type: mime,
      disposition: `inline; filename="${file}"`,
    });
  }

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
