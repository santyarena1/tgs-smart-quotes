export type PricingItem={id?:string;costCents:bigint;salePriceCents:bigint;markupBps:number;quantity:number;position:number};
export type RetargetPreview={items:Array<PricingItem&{subtotalCents:bigint}>;costCents:bigint;saleCents:bigint;profitCents:bigint;effectiveMarkupBps:number};
export class PricingError extends Error{}
export function roundRatio(numerator:bigint,denominator:bigint):bigint{if(denominator<=0n)throw new PricingError("Divisor inválido");const sign=numerator<0n?-1n:1n,n=numerator<0n?-numerator:numerator,q=n/denominator,r=n%denominator;return sign*(q+(r*2n>=denominator?1n:0n))}
export function saleFromCost(costCents:bigint,markupBps:number):bigint{if(costCents<0n||!Number.isSafeInteger(markupBps)||markupBps<0)throw new PricingError("Costo o markup inválido");return roundRatio(costCents*BigInt(10000+markupBps),10000n)}
export function markupFromPrices(costCents:bigint,saleCents:bigint):number{if(costCents<=0n)throw new PricingError("El costo debe ser mayor a cero");if(saleCents<costCents)throw new PricingError("La venta no puede ser menor al costo");return Number(roundRatio((saleCents-costCents)*10000n,costCents))}
export const subtotal=(item:Pick<PricingItem,"salePriceCents"|"quantity">)=>item.salePriceCents*BigInt(item.quantity);
export function retarget(items:PricingItem[],targetTotalCents:bigint):RetargetPreview{let costCents=0n,currentSale=0n;for(const item of items){costCents+=item.costCents*BigInt(item.quantity);currentSale+=subtotal(item)}if(targetTotalCents<costCents)throw new PricingError("El total objetivo no puede ser menor al costo total");const currentProfit=currentSale-costCents;if(currentProfit===0n)throw new PricingError("La ganancia actual no puede ser cero");const targetProfit=targetTotalCents-costCents;const next=items.map(item=>{const markupBps=Number(roundRatio(BigInt(item.markupBps)*targetProfit,currentProfit));if(markupBps<0)throw new PricingError("El markup resultante no puede ser negativo");const salePriceCents=saleFromCost(item.costCents,markupBps);return{...item,markupBps,salePriceCents,subtotalCents:salePriceCents*BigInt(item.quantity)}});let residue=targetTotalCents-next.reduce((sum,item)=>sum+item.subtotalCents,0n);for(const item of [...next].sort((a,b)=>a.subtotalCents===b.subtotalCents?a.position-b.position:a.subtotalCents>b.subtotalCents?-1:1)){if(residue===0n)break;const quantity=BigInt(item.quantity),delta=residue/quantity;if(delta!==0n&&item.salePriceCents+delta>=item.costCents){item.salePriceCents+=delta;item.subtotalCents+=delta*quantity;item.markupBps=markupFromPrices(item.costCents,item.salePriceCents);residue-=delta*quantity}}if(residue!==0n)throw new PricingError("El objetivo no puede distribuirse con estas cantidades");const saleCents=next.reduce((sum,item)=>sum+item.subtotalCents,0n),profitCents=saleCents-costCents,effectiveMarkupBps=costCents===0n?0:Number(roundRatio(profitCents*10000n,costCents));return{items:next,costCents,saleCents,profitCents,effectiveMarkupBps}}
export function parseArs(value:string):bigint{
  const trimmed=value.trim().replace(/\s/g,"").replace(/\$/g,"");
  if(!trimmed)return 0n;
  const negative=trimmed.startsWith("-");
  const raw=negative?trimmed.slice(1):trimmed;
  if(!raw)return 0n;
  let wholeDigits:string;
  let fracCents=0n;
  if(raw.includes(",")){
    const parts=raw.split(",");
    if(parts.length!==2)throw new PricingError("Importe inválido. Usá pesos enteros, ej. 50.000");
    wholeDigits=(parts[0]??"").replace(/\./g,"");
    fracCents=BigInt(((parts[1]??"")+"00").slice(0,2));
  }else if(/^\d+\.\d{1,2}$/.test(raw)){
    const parts=raw.split(".");
    wholeDigits=parts[0]??"0";
    fracCents=BigInt(((parts[1]??"")+"00").slice(0,2));
  }else{
    wholeDigits=raw.replace(/\./g,"");
  }
  if(!/^\d+$/.test(wholeDigits))throw new PricingError("Importe inválido. Usá pesos enteros, ej. 50.000");
  let pesos=BigInt(wholeDigits);
  if(fracCents>=50n)pesos+=1n;
  const cents=pesos*100n;
  return negative?-cents:cents;
}
export function formatArsInput(cents:bigint){
  const negative=cents<0n;
  const pesos=((negative?-cents:cents)+50n)/100n;
  return `${negative?"-":""}$ ${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g,".")}`;
}