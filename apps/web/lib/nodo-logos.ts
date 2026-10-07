import air from "./nodo-logos/air.png";
import ashir from "./nodo-logos/ashir.png";
import distecna from "./nodo-logos/distecna.png";
import elit from "./nodo-logos/elit.png";
import gruponucleo from "./nodo-logos/gruponucleo.png";
import invid from "./nodo-logos/invid.png";
import newbytes from "./nodo-logos/newbytes.png";
import newtree from "./nodo-logos/newtree.png";
import polytech from "./nodo-logos/polytech.png";
import sentey from "./nodo-logos/sentey.png";
import solutionbox from "./nodo-logos/solutionbox.png";
import web from "./nodo-logos/web.png";

/** Logo de cada distribuidor conocido, por nombre sin tildes ni espacios. */
const LOGOS: Record<string, string> = {
  air: air.src,
  ashir: ashir.src,
  distecna: distecna.src,
  elit: elit.src,
  gruponucleo: gruponucleo.src,
  nucleo: gruponucleo.src,
  invid: invid.src,
  newbytes: newbytes.src,
  nb: newbytes.src,
  newtree: newtree.src,
  polytech: polytech.src,
  sentey: sentey.src,
  solutionbox: solutionbox.src,
};

/** Logo de la tienda web. */
export const WEB_LOGO = web.src;

const slug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Logo del distribuidor, o null si no hay (los de demostración, o uno nuevo). */
export function providerLogo(name: string | undefined | null): string | null {
  return name ? LOGOS[slug(name)] ?? null : null;
}
