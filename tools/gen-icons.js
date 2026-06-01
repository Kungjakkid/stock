// สร้างไอคอนแอป (ขวดทดลอง บนพื้นไล่เฉดทอง) เป็น PNG — ใช้ zlib ในตัว ไม่ต้องพึ่ง canvas
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const M = 1536; // ความละเอียด master (render สูงแล้วย่อ = ขอบเนียน)

// ---- สี ----
const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
const GOLD = hex('#cda23e');   // มุมบนซ้าย
const BROWN = hex('#7a540d');  // มุมล่างขวา
const WHITE = [255,255,255];
const LIQUID = [255,205,110];  // สีน้ำยาในขวด

function lerp(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }

// ---- รูปทรงขวด (พิกัดอ้างอิง 512 จะถูกสเกลเป็น master) ----
const S = M/512;
const flask = [
  [228,150],[284,150],            // ปากขวด (lip)
  [276,156],[276,250],            // คอขวดขวา
  [362,396],[354,410],[340,418],  // ลาดขวา + มุมล่างขวา
  [172,418],[158,410],[150,396],  // มุมล่างซ้าย
  [236,250],[236,156]             // ลาดซ้าย + คอขวดซ้าย
].map(p=>[p[0]*S,p[1]*S]);
const LIQUID_TOP = 330*S; // ระดับผิวน้ำยา

function inPoly(x,y,poly){
  let inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const xi=poly[i][0],yi=poly[i][1],xj=poly[j][0],yj=poly[j][1];
    if(((yi>y)!==(yj>y)) && (x < (xj-xi)*(y-yi)/(yj-yi)+xi)) inside=!inside;
  }
  return inside;
}

// ---- วาด master RGBA ----
const master = Buffer.alloc(M*M*4);
const cx=0.30*M, cy=0.25*M, R=0.95*M;
for(let y=0;y<M;y++){
  for(let x=0;x<M;x++){
    let col;
    if(inPoly(x,y,flask)){
      col = (y>LIQUID_TOP) ? LIQUID.slice() : WHITE.slice();
    } else {
      // พื้นไล่เฉดทแยง + แสงไฮไลต์มุมบนซ้าย
      const t=(x+y)/(2*M);
      col = lerp(GOLD,BROWN,t);
      const d=Math.hypot(x-cx,y-cy)/R;
      const hl=Math.max(0,0.32*(1-d));
      col=[col[0]+(255-col[0])*hl, col[1]+(255-col[1])*hl, col[2]+(255-col[2])*hl];
    }
    const i=(y*M+x)*4;
    master[i]=Math.round(col[0]); master[i+1]=Math.round(col[1]); master[i+2]=Math.round(col[2]); master[i+3]=255;
  }
}

// ---- ย่อแบบเฉลี่ยพื้นที่ (area resample) จาก master → ขนาดเป้าหมาย ----
function resample(size){
  const out=Buffer.alloc(size*size*4);
  const sc=M/size;
  for(let oy=0;oy<size;oy++){
    const y0=Math.floor(oy*sc), y1=Math.max(y0+1,Math.floor((oy+1)*sc));
    for(let ox=0;ox<size;ox++){
      const x0=Math.floor(ox*sc), x1=Math.max(x0+1,Math.floor((ox+1)*sc));
      let r=0,g=0,b=0,n=0;
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const i=(y*M+x)*4; r+=master[i]; g+=master[i+1]; b+=master[i+2]; n++; }
      const o=(oy*size+ox)*4;
      out[o]=Math.round(r/n); out[o+1]=Math.round(g/n); out[o+2]=Math.round(b/n); out[o+3]=255;
    }
  }
  return out;
}

// ---- PNG encoder ----
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
function crc32(buf){let c=0xffffffff;for(let i=0;i<buf.length;i++)c=CRC[(c^buf[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;}
function chunk(type,data){
  const len=Buffer.alloc(4); len.writeUInt32BE(data.length,0);
  const t=Buffer.from(type,'ascii');
  const crc=Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t,data])),0);
  return Buffer.concat([len,t,data,crc]);
}
function png(size,rgba){
  const sig=Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(size,0); ihdr.writeUInt32BE(size,4);
  ihdr[8]=8; ihdr[9]=6; ihdr[10]=0; ihdr[11]=0; ihdr[12]=0;
  const raw=Buffer.alloc(size*(size*4+1));
  for(let y=0;y<size;y++){ raw[y*(size*4+1)]=0; rgba.copy(raw, y*(size*4+1)+1, y*size*4, (y+1)*size*4); }
  const idat=zlib.deflateSync(raw,{level:9});
  return Buffer.concat([sig,chunk('IHDR',ihdr),chunk('IDAT',idat),chunk('IEND',Buffer.alloc(0))]);
}

const outDir = path.join(__dirname,'..','icons');
fs.mkdirSync(outDir,{recursive:true});
for(const sz of [512,192,180]){
  fs.writeFileSync(path.join(outDir,`icon-${sz}.png`), png(sz, resample(sz)));
  console.log('wrote icons/icon-'+sz+'.png');
}
