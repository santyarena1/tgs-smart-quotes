const DEFAULT_BUBBLE_THRESHOLD=160;

function splitLongUnit(value:string,threshold:number):string[]{
  const clauses=value.split(/(?<=[,;:])\s+/).map(part=>part.trim()).filter(Boolean);
  if(clauses.length>1&&clauses.every(clause=>clause.length<=threshold))return packParts(clauses,threshold);
  const tokens=value.match(/https?:\/\/\S+|(?:ARS|USD|US\$|\$)\s*[\d.,]+|\S+/gi)??[];
  return packParts(tokens,threshold);
}

function packParts(parts:string[],threshold:number):string[]{
  const chunks:string[]=[];
  let current='';
  for(const part of parts){
    const combined=current?`${current} ${part}`:part;
    if(current&&combined.length>threshold){chunks.push(current);current=part}
    else current=combined;
  }
  if(current)chunks.push(current);
  return chunks;
}

function splitBubble(value:string,threshold:number):string[]{
  const text=value.trim();
  if(!text)return [];
  if(text.length<=threshold)return [text];
  const sentences=text
    .split(/(?:\r?\n+|(?<=[.!?])\s+)/)
    .map(part=>part.trim())
    .filter(Boolean)
    .flatMap(part=>part.length>threshold?splitLongUnit(part,threshold):[part]);
  const bubbles:string[]=[];
  let current='';
  let partCount=0;
  for(const sentence of sentences){
    const combined=current?`${current} ${sentence}`:sentence;
    if(current&&(combined.length>threshold||partCount>=2)){
      bubbles.push(current);current=sentence;partCount=1;
    }else{
      current=combined;partCount+=1;
    }
  }
  if(current)bubbles.push(current);
  return bubbles;
}

/** Garantiza burbujas breves sin perder texto ni cortar URLs o precios internamente. */
export function splitChatbotAiMessages(
  messages:string[],
  fallbackReply:string,
  maxBubbles:number,
  threshold=DEFAULT_BUBBLE_THRESHOLD,
):string[]{
  const source=messages.map(message=>message.trim()).filter(Boolean);
  const split=(source.length?source:[fallbackReply.trim()])
    .filter(Boolean)
    .flatMap(message=>splitBubble(message,threshold));
  const limit=Math.max(1,Math.floor(maxBubbles));
  if(split.length<=limit)return split;
  return [...split.slice(0,limit-1),split.slice(limit-1).join(' ')];
}
