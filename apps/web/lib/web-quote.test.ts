import {describe,expect,it} from 'vitest';
import {
  ASSEMBLY_BASIC_CENTS,
  ASSEMBLY_GPU_CENTS,
  ASSEMBLY_GPU_LIQUID_CENTS,
  assemblyCents,
  isExtraLine,
  wifiCents,
  hasWifi,
  WIFI_BASIC_CENTS,
  WIFI_OTHER_CENTS,
  matchScore,
  pickNodoMatch,
  pickWebMatch,
  searchQueries,
  warrantyCents,
  webQuoteExtras,
} from './web-quote';

const names=(...list:string[])=>list.map((name)=>({name}));

describe('armado según complejidad',()=>{
  it('PC básica sin placa de video',()=>{
    expect(assemblyCents(names('AMD Ryzen 5 5600G','Mother ASUS A520M','Memoria 16GB DDR4'))).toBe(ASSEMBLY_BASIC_CENTS);
  });
  it('con placa de video',()=>{
    expect(assemblyCents(names('AMD Ryzen 5 5600','Placa de Video RTX 4060 8GB'))).toBe(ASSEMBLY_GPU_CENTS);
  });
  it('con placa de video y refrigeración líquida',()=>{
    expect(assemblyCents(names('Intel i7 14700F','GeForce RTX 4070','Refrigeración Líquida 240mm Deepcool'))).toBe(ASSEMBLY_GPU_LIQUID_CENTS);
  });
  it('una motherboard que menciona la placa de video no cuenta como GPU',()=>{
    expect(assemblyCents(names('Motherboard B550M con salida para placa de video'))).toBe(ASSEMBLY_BASIC_CENTS);
  });
});

describe('garantía extendida y extras',()=>{
  it('7 % del total de componentes, sin armado ni licencias',()=>{
    const extras=webQuoteExtras([{name:'Ryzen 5 5600G',totalCents:20_000_000n},{name:'Mother A520M',totalCents:10_000_000n}]);
    expect(extras.map((e)=>e.name)).toEqual(['ARMADO Y TESTEO DE PC','GARANTÍA EXTENDIDA TGS','LICENCIA WINDOWS 11 PRO']);
    expect(extras[0]!.priceCents).toBe(4_500_000n);
    expect(extras[1]!.priceCents).toBe(2_100_000n);
    expect(extras[2]!.priceCents).toBe(6_500_000n);
  });
  it('redondea la garantía al peso',()=>{
    expect(warrantyCents(12_345_600n)).toBe(864_200n);
  });
  it('reconoce los ítems que agrega el botón',()=>{
    expect(isExtraLine('Armado básico')).toBe(true);
    expect(isExtraLine('GARANTÍA EXTENDIDA TGS')).toBe(true);
    expect(isExtraLine('Licencia Windows 11 Pro')).toBe(true);
    expect(isExtraLine('Placa madre ASUS')).toBe(false);
  });
});

describe('matching con la tienda',()=>{
  const web=[
    {id:1,name:'Procesador AMD Ryzen 5 5600X 4.6GHz AM4',sku:'100-100000065BOX',priceCents:25_000_000n.toString()},
    {id:2,name:'Procesador AMD Ryzen 5 5600 4.4GHz AM4',sku:null,priceCents:21_000_000n.toString()},
  ];
  it('no confunde 5600 con 5600X',()=>{
    expect(pickWebMatch('AMD Ryzen 5 5600 AM4',web)?.id).toBe(2);
    expect(pickWebMatch('AMD Ryzen 5 5600X AM4',web)?.id).toBe(1);
  });
  it('sin el mismo modelo no hay match',()=>{
    expect(pickWebMatch('AMD Ryzen 7 7800X3D',web)).toBeNull();
    expect(matchScore('Gabinete Corsair 4000D',web[0]!)).toBe(0);
  });
  it('arma consultas de la más específica a la más amplia',()=>{
    const queries=searchQueries('Procesador AMD Ryzen 5 5600X 4.6GHz AM4 Box');
    expect(queries[0]).toContain('ryzen');
    expect(queries.at(-1)).toContain('5600x');
  });
});

describe('costo desde NODO',()=>{
  const web={name:'Procesador AMD Ryzen 5 5600X 4.6GHz AM4',sku:'100-100000065BOX'};
  const offers=[
    {name:'AMD Ryzen 5 5600X AM4 Box',sku:'100-100000065BOX',costIvaCents:'20000000',inStock:false},
    {name:'CPU AMD Ryzen 5 5600X AM4',sku:null,costIvaCents:'21000000',inStock:true},
    {name:'CPU AMD Ryzen 5 5600X AM4 Tray',sku:null,costIvaCents:'19000000',inStock:true},
    {name:'AMD Ryzen 5 5600 AM4',sku:null,costIvaCents:'15000000',inStock:true},
  ];
  it('el mismo SKU manda, aunque no tenga stock',()=>{
    expect(pickNodoMatch(web,offers)?.costIvaCents).toBe('20000000');
  });
  it('sin SKU: con stock y más barata, y nunca otro modelo',()=>{
    expect(pickNodoMatch({name:web.name,sku:null},offers.slice(1))?.costIvaCents).toBe('19000000');
  });
  it('sin coincidencia devuelve null',()=>{
    expect(pickNodoMatch({name:'Gabinete Corsair 4000D',sku:null},offers)).toBeNull();
  });
});

describe('líneas fijas destildables',()=>{
  it('solo agrega las tildadas y la garantía sigue siendo el 7 % de los componentes',()=>{
    const extras=webQuoteExtras([{name:'Ryzen 5 5600G',totalCents:10_000_000n}],{assembly:false,warranty:true,windows:false});
    expect(extras).toEqual([{name:'GARANTÍA EXTENDIDA TGS',priceCents:700_000n,costCents:0n}]);
  });
});

describe('costos de líneas fijas y placa WiFi',()=>{
  it('servicios a costo $0 y Windows a $8.500',()=>{
    const extras=webQuoteExtras([{name:'Ryzen 5 5600G',totalCents:10_000_000n}]);
    expect(extras.map((e)=>e.costCents)).toEqual([0n,0n,850_000n]);
  });
  it('WiFi: $18.200 en la básica, $47.400 en las demás',()=>{
    expect(wifiCents(names('Ryzen 5 5600G'))).toBe(WIFI_BASIC_CENTS);
    expect(wifiCents(names('Ryzen 5 5600','RTX 4060'))).toBe(WIFI_OTHER_CENTS);
  });
});

describe('WiFi ya incluido',()=>{
  it('detecta una placa madre con WiFi u otro adaptador',()=>{
    expect(hasWifi(names('Mother ASUS B650M-A WIFI','Ryzen 5 7600'))).toBe(true);
    expect(hasWifi(names('Placa de red inalámbrica TP-Link AX3000'))).toBe(true);
  });
  it('sin WiFi en los componentes no lo detecta',()=>{
    expect(hasWifi(names('Mother ASUS A520M','Ryzen 5 5600G'))).toBe(false);
  });
});
