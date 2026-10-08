import { describe, expect, it } from 'vitest';
import { buildReferencePrompt, isPublicImageUrl } from './reference-image.js';

describe('imagen de referencia', () => {
  it('el prompt lleva los componentes y pide partir de la foto del gabinete si la hay', () => {
    const prompt = buildReferencePrompt(['Procesador AMD Ryzen 5 5600', 'Placa de video RTX 4060 8GB'], 'Gabinete Sentey', true);
    expect(prompt).toContain('Ryzen 5 5600');
    expect(prompt).toContain('RTX 4060');
    expect(prompt).toContain('exact PC case from the reference photo');
    expect(prompt).toContain('No text');
    expect(buildReferencePrompt(['SSD 1TB'], 'Gabinete Sentey', false)).toContain('The PC case is: Gabinete Sentey');
    expect(buildReferencePrompt([], null, false)).toContain('tempered glass');
  });

  it('solo baja fotos https de hosts públicos', () => {
    expect(isPublicImageUrl('https://images.elit.com.ar/p/20637/i/8ZRP7_l.webp')).toBe(true);
    for (const url of ['http://images.elit.com.ar/a.jpg', 'https://localhost/a.jpg', 'https://127.0.0.1/a.jpg', 'https://10.0.0.5/a.jpg', 'https://192.168.1.10/a.jpg', 'https://169.254.169.254/latest', 'https://172.20.0.1/a', 'https://[::1]/a', 'file:///etc/passwd', 'no es una url']) {
      expect(isPublicImageUrl(url), url).toBe(false);
    }
  });
});
