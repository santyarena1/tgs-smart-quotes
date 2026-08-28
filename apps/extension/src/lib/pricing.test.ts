import{describe,expect,it}from"vitest";
import{markupFromPrices,parseArs,retarget,saleFromCost}from"./pricing";
describe("pricing de extensión",()=>{
  it("calcula venta y markup con enteros",()=>{expect(saleFromCost(101n,500)).toBe(106n);expect(markupFromPrices(10000n,13000n)).toBe(3000)});
  it("previsualiza total objetivo con residuo estable",()=>{const result=retarget([{id:"a",costCents:10000n,salePriceCents:13000n,markupBps:3000,quantity:1,position:0},{id:"b",costCents:5000n,salePriceCents:6500n,markupBps:3000,quantity:1,position:1}],18001n);expect(result.saleCents).toBe(18001n);expect(result.items[0]?.salePriceCents).toBe(12000n)});
  it("rechaza objetivo menor al costo",()=>expect(()=>retarget([{costCents:100n,salePriceCents:130n,markupBps:3000,quantity:1,position:0}],99n)).toThrow("costo total"));
  it.each([
    ["485.000,00",48500000n],
    ["1.500",150000n],
    ["1500,50",150100n],
    ["1500.50",150100n],
    ["1.234.567",123456700n],
    ["150000",15000000n],
  ])("parsea ARS %s como %s centavos",(input,expected)=>expect(parseArs(input)).toBe(expected));
});