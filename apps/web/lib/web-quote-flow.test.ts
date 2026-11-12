import {describe,expect,it,vi} from 'vitest';

vi.mock('./api',()=>({
  api:vi.fn(async (_path:string,opts:{query:{q:string}})=>{
    // La tienda solo tiene el Ryzen y el gabinete; el resto no se encuentra.
    const q=opts.query.q.toLowerCase();
    if(q.includes('5600g')) return {items:[{id:1,name:'Procesador AMD Ryzen 5 5600G AM4',sku:null,priceCents:'20000000',inStock:true,url:null,imageUrl:null}]};
    return {items:[]};
  }),
}));

import {buildWebQuote,DEFAULT_WEB_FIXED,type WebDraft} from './web-quote-flow';

const draft=(name:string,costArs:string,saleArs:string):WebDraft=>({
  key:name,productId:'p',lineId:'',name,quantity:'1',costArs,markupPct:'30',saleArs,priceMode:'sale',ivaPct:'21',ivaAuto:true,
});
const blank=():WebDraft=>draft('','','');

describe('Presupuesto Web (flujo compartido)',()=>{
  it('pone el precio de la web, suma las líneas fijas con su costo y el WiFi aparte',async()=>{
    const out=await buildWebQuote([draft('Ryzen 5 5600G AM4','150.000','195.000'),draft('Gabinete raro sin web','30.000','40.000')],blank,{fixed:DEFAULT_WEB_FIXED,free:[]});
    const byName=(n:string)=>out.items.find((i)=>i.name.includes(n))!;
    // El componente encontrado toma el precio web (200.000) y pierde el productId.
    expect(byName('RYZEN').saleArs).toBe('200.000');
    expect(byName('RYZEN').productId).toBe('');
    // El que no se encuentra conserva su precio y se avisa.
    expect(byName('Gabinete').saleArs).toBe('40.000');
    expect(out.noWeb).toEqual(['Gabinete raro sin web']);
    // Armado, Windows y garantía (7 % de 200.000 + 40.000 = 16.800), con sus costos.
    expect(byName('ARMADO').saleArs).toBe('45.000');
    expect(byName('ARMADO').costArs).toBe('0');
    expect(byName('LICENCIA').costArs).toBe('8.500');
    expect(byName('GARANTÍA').saleArs).toBe('16.800');
    expect(out.wifiAddon).toEqual({name:'PLACA WIFI PCIE',priceCents:'1820000'});
  });
  it('respeta lo destildado y suma ítems libres',async()=>{
    const out=await buildWebQuote([draft('Ryzen 5 5600G AM4','1','2')],blank,{fixed:{assembly:false,warranty:false,windows:true,wifi:false},free:[{key:'a',name:'cable hdmi',priceArs:'5.000'}]});
    expect(out.items.map((i)=>i.name)).toEqual(['PROCESADOR AMD RYZEN 5 5600G AM4','LICENCIA WINDOWS 11 PRO','CABLE HDMI']);
    expect(out.wifiAddon).toBeNull();
  });
  it('un ítem libre sin precio es un error',async()=>{
    await expect(buildWebQuote([draft('Ryzen 5 5600G AM4','1','2')],blank,{fixed:DEFAULT_WEB_FIXED,free:[{key:'a',name:'x',priceArs:''}]})).rejects.toThrow('ítem libre');
  });
});
