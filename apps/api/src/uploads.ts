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
import {mediaFilePath} from '@tgs/storage';

const MEDIA_MIME:Record<string,string>={
  png:'image/png',
  jpg:'image/jpeg',
  jpeg:'image/jpeg',
  webp:'image/webp',
  gif:'image/gif',
  glb:'model/gltf-binary',
  gltf:'model/gltf+json',
};

@Controller('uploads')
export class UploadsController {
  /**
   * Imágenes de productos, miniaturas y modelos 3D. Es público a propósito:
   * WordPress y el navegador del cliente descargan estas imágenes para la
   * ficha de producto de la tienda.
   *
   * La ruta es un wildcard porque las keys tienen subcarpetas
   * (`product-assets/<productId>/<archivo>.png`); `mediaFilePath` valida la
   * key y garantiza que no se pueda salir de la carpeta de medios.
   */
  @Public()
  @Get('media/*')
  async media(@Param('*') key:string) {
    let fullPath:string;
    try{
      fullPath=mediaFilePath(key);
    }catch{
      throw new NotFoundException('Archivo inexistente');
    }
    try{
      await access(fullPath,constants.R_OK);
    }catch{
      throw new NotFoundException('Archivo inexistente');
    }
    const ext=fullPath.split('.').pop()?.toLowerCase()??'';
    return new StreamableFile(createReadStream(fullPath),{
      type:MEDIA_MIME[ext]??'application/octet-stream',
      disposition:'inline',
    });
  }

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
