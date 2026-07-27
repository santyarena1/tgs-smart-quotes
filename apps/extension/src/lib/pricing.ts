export type PricingItem={id?:string;costCents:bigint;salePriceCents:bigint;markupBps:number;quantity:number;position:number};
export type RetargetPreview={items:Array<PricingItem&{subtotalCents:bigint}>;costCents:bigint;saleCents:bigint;profitCents:bigint;effectiveMarkupBps:number};
export class PricingError extends Error{}
export function roundRatio(numerator:bigint,denominator:bigint):bigint{if(denominator<=0n)throw new PricingError("Divisor inválido");const sign=numerator<0n?-1n:1n,n=numerator<0n?-numerator:numerator,q=n/denominator,r=n%denominator;return sign*(q+(r*2n>=denominator?1n:0n))}
export function saleFromCost(costCents:bigint,markupBps:number):bigint{if(costCents<0n||!Number.isSafeInteger(markupBps)||markupBps<0)throw new PricingError("Costo o markup inválido");return roundRatio(costCents*BigInt(10000+markupBps),10000n)}
export function markupFromPrices(costCents:bigint,saleCents:bigint):number{if(costCents<=0n)throw new PricingError("El costo debe ser mayor a cero");if(saleCents<costCents)throw new PricingError("La venta no puede ser menor al costo");return Number(roundRatio((saleCents-costCents)*10000n,costCents))}
export const subtotal=(item:Pick<PricingItem,"salePriceCents"|"quantity">)=>item.salePriceCents*BigInt(item.quantity);
export function retarget(items:PricingItem[],targetTotalCents:bigint):RetargetPreview{let costCents=0n,currentSale=0n;for(const item of items){costCents+=item.costCents*BigInt(item.quantity);currentSale+=subtotal(item)}if(targetTotalCents<costCents)throw new PricingError("El total objetivo no puede ser menor al costo total");const currentProfit=currentSale-costCents;if(currentProfit===0n)throw new PricingError("La ganancia actual no puede ser cero");const targetProfit=targetTotalCents-costCents;const next=items.map(item=>{const markupBps=Number(roundRatio(BigInt(item.markupBps)*targetProfit,currentProfit));if(markupBps<0)throw new PricingError("El markup resultante no puede ser negativo");const salePriceCents=saleFromCost(item.costCents,markupBps);return{...item,markupBps,salePriceCents,subtotalCents:salePriceCents*BigInt(item.quantity)}});let residue=targetTotalCents-next.reduce((sum,item)=>sum+item.subtotalCents,0n);for(const item of [...next].sort((a,b)=>a.subtotalCents===b.subtotalCents?a.position-b.position:a.subtotalCents>b.subtotalCents?-1:1)){if(residue===0n)break;const quantity=BigInt(item.quantity),delta=residue/quantity;if(delta!==0n&&item.salePriceCents+delta>=item.costCents){item.salePriceCents+=delta;item.subtotalCents+=delta*quantity;item.markupBps=markupFromPrices(item.costCents,item.salePriceCents);residue-=delta*quantity}}if(residue!==0n)throw new PricingError("El objetivo no puede distribuirse con estas cantidades");const saleCents=next.reduce((sum,item)=>sum+item.subtotalCents,0n),profitCents=saleCents-costCents,effectiveMarkupBps=costCents===0n?0:Number(roundRatio(profitCents*10000n,costCents));return{items:next,costCents,saleCents,profitCents,effectiveMarkupBps}}
export function parseArs(value:string):bigint{
  const raw=value.trim().replace(/\s/g,"").replace(/\$/g,"");
  if(!raw)return 0n;
  if(/^\d+$/.test(raw))return BigInt(raw)*100n;
  let normalized=raw;
  if(normalized.includes(",")&&normalized.includes("."))normalized=normalized.replace(/\./g,"").replace(",",".");
  else if(normalized.includes(","))normalized=normalized.replace(",",".");
  else {
    const dots=(normalized.match(/\./g)??[]).length;
    if(dots>1)normalized=normalized.replace(/\./g,"");
    else if(dots===1&&/^\d+\.\d{3}$/.test(normalized))normalized=normalized.replace(".","");
  }
  if(!/^\d+(\.\d{1,2})?$/.test(normalized))throw new PricingError("Importe inválido. Usá formato 1234,56 o 1234.56");
  const[whole="0",fraction=""]=normalized.split(".");
  return BigInt(whole)*100n+BigInt((fraction+"00").slice(0,2));
}
export const formatArsInput=(cents:bigint)=>new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS"}).format(Number(cents)/100);