// src/intelligence/specExtractor.js

const COLOR_WORDS=[
  "black","white","blue","red","green","yellow","purple","pink","gold",
  "silver","gray","grey","graphite","midnight","navy","orange","violet",
  "cream","beige","ivory","teal","cyan","bronze","pearl","titanium",
  "starlight","lavender","mint","ocean","forest","desert","sand"
];

function find(regex,text){
  const m=text.match(regex);
  return m?m[1]:null;
}

export function extractSpecs(title=""){
  const text=title.toLowerCase();

  const specs={};

  specs.ram=find(/(\d{1,3})\s*gb\s*(?:ram)?/i,text);

  const rom=text.match(/(?:\/|\+)?\s*(\d{2,4})\s*(gb|tb)\b/i);
  if(rom){
    specs.storage=rom[1]+" "+rom[2].toUpperCase();
  }

  const battery=find(/(\d{4,5})\s*mah/i,text);

  if(battery){
    specs.battery=battery+" mAh";
  }

  const display=find(/(\d+(?:\.\d+)?)\s*(?:inch|inches|")/i,text);

  if(display){
    specs.display=display+'"';
  }

  const refresh=find(/(\d{2,3})\s*hz/i,text);

  if(refresh){
    specs.refreshRate=refresh+" Hz";
  }

  const camera=find(/(\d{2,3})\s*mp/i,text);

  if(camera){
    specs.camera=camera+" MP";
  }

  const cpu=text.match(
    /\b(snapdragon\s*\d+|dimensity\s*\d+|helio\s*[a-z0-9]+|exynos\s*\d+|kirin\s*\d+|apple\s*a\d+|tensor\s*g\d+|core\s*i[3579]-?\d+|ryzen\s*[3579]\s*\d+)\b/i
  );

  if(cpu){
    specs.cpu=cpu[1];
  }

  const gpu=text.match(
    /\b(rtx\s*\d{3,4}|gtx\s*\d{3,4}|rx\s*\d{4}|arc\s*[a-z0-9]+)\b/i
  );

  if(gpu){
    specs.gpu=gpu[1].toUpperCase();
  }

  const color=COLOR_WORDS.find(c=>text.includes(c));

  if(color){
    specs.color=color.charAt(0).toUpperCase()+color.slice(1);
  }

  const network=text.match(/\b(4g|5g)\b/i);

  if(network){
    specs.network=network[1].toUpperCase();
  }

  const sim=text.match(/\b(single sim|dual sim)\b/i);

  if(sim){
    specs.sim=sim[1];
  }

  return specs;
}
