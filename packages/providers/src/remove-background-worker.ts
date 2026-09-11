/**
 * Proceso aparte para el quitado de fondo con modelo (ISNet vía
 * @imgly/background-removal-node + onnxruntime).
 *
 * Corre en un proceso hijo a propósito: onnxruntime es código nativo y un
 * fallo suyo (una versión de Node sin binario compatible, un choque de
 * librerías con sharp) tiraría abajo la API entera. Así, si el modelo no
 * puede correr, el padre lo detecta y cae al recorte por relleno de siempre.
 *
 * Protocolo: recibe por argv [entrada, salida, mime]; escribe el PNG con alfa
 * en `salida` y termina con código 0. Cualquier otra cosa es fallo.
 */
import {readFileSync, writeFileSync} from 'node:fs';

async function main() {
  const [input, output, mime] = process.argv.slice(2);
  if (!input || !output) throw new Error('uso: worker <entrada> <salida> [mime]');
  const {removeBackground} = await import('@imgly/background-removal-node');
  const bytes = readFileSync(input);
  const blob = new Blob([bytes], {type: mime || 'image/png'});
  const result = await removeBackground(blob, {
    model: 'medium',
    output: {format: 'image/png', quality: 1},
    // Sin logs del modelo en la salida estándar: el padre solo mira el archivo.
    debug: false,
  });
  writeFileSync(output, Buffer.from(await result.arrayBuffer()));
}

main().then(
  () => process.exit(0),
  (error) => {
    process.stderr.write(String(error instanceof Error ? error.message : error) + '\n');
    process.exit(1);
  },
);
