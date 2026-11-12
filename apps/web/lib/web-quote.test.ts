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
  matchWebComponent,
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
  it('no cambia la capacidad ni la variante',()=>{
    const kits=[
      {id:1,name:'Memoria Kingston Fury Beast 32GB DDR4',sku:null,priceCents:'8000000'},
      {id:2,name:'Memoria Kingston Fury Beast 16GB DDR4',sku:null,priceCents:'4500000'},
    ];
    expect(pickWebMatch('Memoria Kingston Fury Beast 16GB DDR4',[kits[0]!])).toBeNull();
    expect(pickWebMatch('Memoria Kingston Fury Beast 16GB DDR4',kits)?.id).toBe(2);
    expect(pickWebMatch('Placa de Video RTX 4060 8GB',[{id:3,name:'Placa de Video RTX 4060 Ti 8GB',sku:null,priceCents:'1'}])).toBeNull();
    expect(pickWebMatch('Ryzen 5 5600',[{id:4,name:'Ryzen 5 5600 X',sku:null,priceCents:'1'}])).toBeNull();
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
  it('el mismo SKU manda, aunque no tenga stock y haya otro más barato con stock',()=>{
    expect(pickNodoMatch(web,[
      ...offers,
      {name:'Procesador AMD Ryzen 5 5600X 4.6GHz AM4',sku:'OTRO',costIvaCents:'10000000',inStock:true},
    ])?.costIvaCents).toBe('20000000');
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
  it('la refrigeración líquida sin placa de video deja el armado básico y el WiFi de las demás',()=>{
    const items=names('Ryzen 5 5600G','Refrigeración líquida 240mm');
    expect(assemblyCents(items)).toBe(ASSEMBLY_BASIC_CENTS);
    expect(wifiCents(items)).toBe(WIFI_OTHER_CENTS);
  });
});

describe('búsqueda web y NODO',()=>{
  it('si la tienda falla, el error llega y no se toma como sin resultados',async()=>{
    await expect(matchWebComponent('Ryzen 5 5600',async()=>{throw new Error('tienda caída');},async()=>[])).rejects.toThrow('tienda caída');
  });
  it('sin producto en la tienda no consulta un costo inventado',async()=>{
    const nodo=async()=>[{name:'Otra cosa',sku:null,costIvaCents:'1',inStock:true}];
    await expect(matchWebComponent('Gabinete Corsair 4000D',async()=>[],nodo)).resolves.toEqual({web:null,nodo:null});
  });
});

describe('WiFi ya incluido',()=>{
  it('detecta una placa madre con WiFi o AX, o un adaptador',()=>{
    expect(hasWifi(names('Mother ASUS B650M-A WIFI','Ryzen 5 7600'))).toBe(true);
    expect(hasWifi(names('Mother Gigabyte B650 AORUS ELITE AX'))).toBe(true);
    expect(hasWifi(names('Placa de red inalámbrica TP-Link AX3000'))).toBe(true);
  });
  it('un periférico inalámbrico no cuenta como WiFi de la PC',()=>{
    expect(hasWifi(names('Mouse Logitech inalámbrico','Mother ASUS A520M'))).toBe(false);
    expect(hasWifi(names('Mother ASUS A520M','Ryzen 5 5600G'))).toBe(false);
  });
});
