export type PricingItem={id?:string;costCents:bigint;salePriceCents:bigint;markupBps:number;quantity:number;position:number};
export type RetargetItem=PricingItem&{subtotalCents:bigint};
export type RetargetResult={items:RetargetItem[];preview:ReturnType<typeof totals>};
export class PricingError extends Error{constructor(public readonly code:'TARGET_BELOW_COST'|'NEGATIVE_MARKUP'|'ZERO_CURRENT_PROFIT'|'INVALID_INTEGER',message:string){super(message);this.name='PricingError'}}
const validBig=(v:bigint)=>{if(v<0n)throw new PricingError('INVALID_INTEGER','Los importes no pueden ser negativos')};
const validInt=(v:number)=>{if(!Number.isSafeInteger(v))throw new PricingError('INVALID_INTEGER','Se requiere un entero seguro')};
export const roundRatio=(numerator:bigint,denominator:bigint):bigint=>{if(denominator<=0n)throw new PricingError('INVALID_INTEGER','Divisor inválido');const sign=numerator<0n?-1n:1n,n=numerator<0n?-numerator:numerator,q=n/denominator,r=n%denominator;return sign*(q+(r*2n>=denominator?1n:0n))};
// El markup puede ser negativo (vender por debajo del costo es una decisión
// comercial válida, p. ej. para cerrar un total redondo); lo único que no
// existe es una venta negativa: -100 % es el piso.
export function saleFromCost(costCents:bigint,markupBps:number):bigint{validBig(costCents);validInt(markupBps);if(markupBps<-10000)throw new PricingError('NEGATIVE_MARKUP','El markup no puede ser menor a -100 %');return roundRatio(costCents*BigInt(10000+markupBps),10000n)}
export function markupFromPrices(costCents:bigint,saleCents:bigint):number{validBig(costCents);validBig(saleCents);if(costCents===0n)throw new PricingError('INVALID_INTEGER','El costo debe ser mayor a cero');const value=roundRatio((saleCents-costCents)*10000n,costCents);const n=Number(value);validInt(n);return n}
export const profitCents=(costCents:bigint,saleCents:bigint)=>saleCents-costCents;
export const applyCost=(item:PricingItem,costCents:bigint,generalMarkupBps?:number):PricingItem=>{const markupBps=generalMarkupBps??item.markupBps;return{...item,costCents,markupBps,salePriceCents:saleFromCost(costCents,markupBps)}};
export const applyMarkup=(item:PricingItem,markupBps:number):PricingItem=>({...item,markupBps,salePriceCents:saleFromCost(item.costCents,markupBps)});
export const applySale=(item:PricingItem,salePriceCents:bigint):PricingItem=>({...item,salePriceCents,markupBps:markupFromPrices(item.costCents,salePriceCents)});
export function totals(items:ReadonlyArray<Pick<PricingItem,'costCents'|'salePriceCents'|'quantity'>>){let costCents=0n,saleCents=0n;for(const x of items){validBig(x.costCents);validBig(x.salePriceCents);validInt(x.quantity);if(x.quantity<=0)throw new PricingError('INVALID_INTEGER','La cantidad debe ser positiva');costCents+=x.costCents*BigInt(x.quantity);saleCents+=x.salePriceCents*BigInt(x.quantity)}const profitCents=saleCents-costCents;return{costCents,saleCents,profitCents,effectiveMarkupBps:costCents===0n?0:Number(roundRatio(profitCents*10000n,costCents))}}
/**
 * Lleva el total de venta al objetivo pedido, cualquiera sea (también por
 * debajo del costo: queda ganancia negativa). Si hoy hay ganancia, cada
 * markup se escala en la misma proporción (los ítems más cargados absorben
 * más); si la ganancia actual es cero, todos reciben el mismo markup. El
 * residuo del redondeo se reparte de a centavos, primero al mayor subtotal,
 * de forma determinística. Lo único que no se permite es una venta negativa.
 */
export function retarget(items:ReadonlyArray<PricingItem>,targetTotalCents:bigint):RetargetResult{validBig(targetTotalCents);const current=totals(items);if(current.costCents===0n)throw new PricingError('INVALID_INTEGER','El presupuesto no tiene costo para ajustar');const targetProfit=targetTotalCents-current.costCents;const result=items.map(x=>{validInt(x.markupBps);let markupBps=current.profitCents!==0n?Number(roundRatio(BigInt(x.markupBps)*targetProfit,current.profitCents<0n?-current.profitCents:current.profitCents))*(current.profitCents<0n?-1:1):Number(roundRatio(targetProfit*10000n,current.costCents));if(markupBps<-10000)markupBps=-10000;const salePriceCents=saleFromCost(x.costCents,markupBps);return{...x,markupBps,salePriceCents,subtotalCents:salePriceCents*BigInt(x.quantity)}});let residue=targetTotalCents-result.reduce((a,x)=>a+x.subtotalCents,0n);const ordered=[...result].sort((a,b)=>a.subtotalCents===b.subtotalCents?a.position-b.position:a.subtotalCents>b.subtotalCents?-1:1);for(let pass=0;pass<3&&residue!==0n;pass+=1){for(const x of ordered){if(residue===0n)break;const q=BigInt(x.quantity);const delta=residue/q;if(delta!==0n&&x.salePriceCents+delta>=0n){x.salePriceCents+=delta;x.subtotalCents+=delta*q;residue-=delta*q;x.markupBps=markupFromPrices(x.costCents,x.salePriceCents)}}}if(residue!==0n){// Lo que queda es menor que la cantidad de algún ítem: va de a 1 unidad al primero que pueda.
for(const x of ordered){if(residue===0n)break;const q=BigInt(x.quantity);if(q===1n&&x.salePriceCents+residue>=0n){x.salePriceCents+=residue;x.subtotalCents+=residue;residue=0n;x.markupBps=markupFromPrices(x.costCents,x.salePriceCents)}}}if(residue!==0n)throw new PricingError('INVALID_INTEGER','El objetivo no puede distribuirse con estas cantidades: probá con un ítem de cantidad 1 o cambiá el total en unos centavos');return{items:result,preview:totals(result)}}
