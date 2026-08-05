import {describe,expect,it} from 'vitest';
import {splitChatbotAiMessages} from './chatbot-message-splitter.js';

describe('splitChatbotAiMessages',()=>{
  it('parte un bloque largo en varias burbujas breves',()=>{
    const input='¡Sí, ya llegaron los monitores! El modelo 4K se ve muy bien. Voy a armarte una propuesta con un mix de productos. Te la paso en un ratito. Si querés sumar algo, avisame.';
    const result=splitChatbotAiMessages([input],input,3);
    expect(result.length).toBeGreaterThan(1);
    expect(result.join(' ')).toBe(input);
  });

  it('conserva una frase corta como una sola burbuja',()=>{
    expect(splitChatbotAiMessages(['Dale, perfecto 👍'],'',3)).toEqual(['Dale, perfecto 👍']);
  });

  it('respeta maxBubbles y conserva todo el texto',()=>{
    const input='Primera idea explicada con claridad. Segunda idea con información adicional. Tercera idea para continuar. Cuarta idea que tampoco debe perderse. Quinta idea final para el cliente.';
    const result=splitChatbotAiMessages([input],input,2,70);
    expect(result).toHaveLength(2);
    expect(result.join(' ')).toBe(input);
  });

  it('no corta precios ni URLs a la mitad',()=>{
    const url='https://tienda.example.com/monitor-4k?color=negro&cuotas=12';
    const price='ARS 350.000,50';
    const input=`Podés ver todos los detalles en ${url} y revisar las especificaciones completas del producto. El precio final vigente es ${price}, con disponibilidad inmediata para retirar. Si querés, también te preparo otra alternativa.`;
    const result=splitChatbotAiMessages([input],input,5,80);
    expect(result.some(item=>item.includes(url))).toBe(true);
    expect(result.some(item=>item.includes(price))).toBe(true);
    expect(result.join(' ')).toBe(input);
  });
});
