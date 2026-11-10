const $ = s => document.querySelector(s);
const canvas = $('canvas'), ctx = canvas.getContext('2d'), video = $('video');
const status = $('#status'), start = $('#start'), effect = $('#effect');
const cdn = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/';
let tracker, stream, active = false, magic = false, busy = false, colors, triangles;
let phase = 0, lastRoll, handSide, frame = 0;
async function initialize() {
  if (tracker) return;
  if (!window.Holistic) await new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = cdn + 'holistic.js'; script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });
  triangles = await (await fetch('triangles.json')).json();
  tracker = new Holistic({locateFile: file => cdn + file});
  tracker.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:true,
    smoothSegmentation:true,refineFaceLandmarks:true,minDetectionConfidence:.55,minTrackingConfidence:.55});
  tracker.onResults(draw);
}
function draw(r) {
  if (!active) return;
  const w = video.videoWidth, h = video.videoHeight;
  if (canvas.width !== w || canvas.height !== h) { canvas.width=w; canvas.height=h; }
  ctx.clearRect(0,0,w,h);
  if (!r.segmentationMask || !r.poseLandmarks) {
    status.textContent='寻找人体中，请面向镜头并让肩膀进入画面。'; lastRoll=undefined; return;
  }
  ctx.drawImage(r.segmentationMask,0,0,w,h);
  ctx.globalCompositeOperation='source-in';
  ctx.filter='grayscale(1) sepia(.7) hue-rotate(58deg) saturate(1.25) contrast(1.14)';
  ctx.drawImage(r.image,0,0,w,h);
  ctx.filter='none'; ctx.globalCompositeOperation='source-over';
  const face=r.faceLandmarks;
  if (face) triangles.forEach(([a,b,c],i)=>{
    const p=face[a], q=face[b], s=face[c];
    const cross=(q.x-p.x)*(s.y-p.y)-(q.y-p.y)*(s.x-p.x);
    if(cross>=0) return;
    const slope=((q.z-p.z)*(s.y-p.y)-(s.z-p.z)*(q.y-p.y))/cross;
    const light=Math.max(.35,Math.min(1.3,.89+slope*.32));
    const tint=colors?.[i] || [152,192,158];
    ctx.fillStyle='rgb('+tint.map(v=>Math.round(v*light)).join(',')+')';
    ctx.beginPath(); ctx.moveTo(p.x*w,p.y*h); ctx.lineTo(q.x*w,q.y*h); ctx.lineTo(s.x*w,s.y*h); ctx.closePath(); ctx.fill();
  });
  const side=r.rightHandLandmarks?'right':'left';
  const hand=r.rightHandLandmarks || r.leftHandLandmarks;
  if(magic && hand) {
    const center=hand[9], dx=(hand[5].x-hand[17].x)*w, dy=(hand[5].y-hand[17].y)*h;
    const roll=Math.atan2(dy,dx);
    if(lastRoll!==undefined && side===handSide) phase+=Math.atan2(Math.sin(roll-lastRoll),Math.cos(roll-lastRoll))*2;
    lastRoll=roll; handSide=side;
    const radius=Math.max(16,Math.hypot(dx,dy)*1.6);
    ctx.save(); ctx.translate(center.x*w,center.y*h);ctx.rotate(phase+roll);
    ctx.globalCompositeOperation='lighter';
    for(let j=0;j<9;j++){
      ctx.beginPath();ctx.strokeStyle='hsla('+ (125+j*4)+',82%,73%,.68)';
      ctx.lineWidth=radius*(j%3===0?.033:.014);
      ctx.ellipse(0,0,radius*(.84+j*.035),radius*(.26+.08*Math.sin(phase+j)),j*.075,phase+j*.7,phase+j*.7+4.7);
      ctx.stroke();
    }
    ctx.restore();
  } else lastRoll=undefined;
  status.textContent=magic?(hand?'转动手腕旋转光带，移动手掌改变位置。':'请张开手掌，让摄像头看到手指。'):'追踪中 · '+(face?'面部已捕捉':'寻找面部')+' · '+[r.leftHandLandmarks,r.rightHandLandmarks].filter(Boolean).length+' 只手';
}
function stop() {
  active=false; cancelAnimationFrame(frame); stream?.getTracks().forEach(t=>t.stop());
  video.srcObject=null; ctx.clearRect(0,0,canvas.width,canvas.height);
  magic=false;lastRoll=undefined;effect.disabled=true;effect.textContent='开启掌心光带';effect.setAttribute('aria-pressed','false');
  start.textContent='开启摄像头'; $('#intro').hidden=false;
}
async function loop() {
  if(!active)return;
  if(!busy && video.readyState>=2 && video.currentTime!==loop.last){
    loop.last=video.currentTime;busy=true;
    try {await tracker.send({image:video});} catch {stop();status.textContent='追踪中断，请重新开启摄像头。';} finally {busy=false;}
  }
  if(active)frame=requestAnimationFrame(loop);
}
start.onclick=async()=>{
  if(active){stop();status.textContent='摄像头已关闭。';return;}
  start.disabled=true;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false});
    video.srcObject=stream;await video.play();status.textContent='首次启动正在加载追踪模型…';
    await initialize();active=true;$('#intro').hidden=true;start.textContent='关闭摄像头';
    effect.disabled=false;await loop();
  }catch(e){stop();status.textContent=e.name==='NotAllowedError'?'请在浏览器的网站设置中允许使用摄像头。':'启动失败，请检查摄像头与网络后重试。';}
  finally{start.disabled=false;}
};
effect.onclick=()=>{magic=!magic;lastRoll=undefined;effect.setAttribute('aria-pressed',String(magic));effect.textContent=magic?'关闭掌心光带':'开启掌心光带';};
$('#photo').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  const input=e.target;input.disabled=true;start.disabled=true;
  let still,url;
  try{
    await initialize();status.textContent='正在提取照片面部…';
    const img=new Image();url=URL.createObjectURL(file);img.src=url;await img.decode();
    const sample=document.createElement('canvas');const scale=Math.min(1,960/Math.max(img.width,img.height));
    sample.width=Math.max(1,Math.round(img.width*scale));sample.height=Math.max(1,Math.round(img.height*scale));
    const sc=sample.getContext('2d');sc.drawImage(img,0,0,sample.width,sample.height);
    const pixels=sc.getImageData(0,0,sample.width,sample.height).data;
    still=new Holistic({locateFile:file=>cdn+file});still.setOptions({modelComplexity:1});
    let found=false;
    still.onResults(r=>{
      if(!r.faceLandmarks)return;
      colors=triangles.map(ids=>{
        const points=ids.map(i=>r.faceLandmarks[i]);
        const pixel=(key,size)=>Math.max(0,Math.min(size-1,Math.floor(points.reduce((n,p)=>n+p[key],0)*size/3)));
        const offset=4*(pixel('y',sample.height)*sample.width+pixel('x',sample.width));
        return Array.from(pixels.slice(offset,offset+3));
      });found=true;
    });
    await still.send({image:sample});status.textContent=found?'照片已载入，面部网格将使用照片颜色。':'没有检测到脸，请换一张清晰的正面照。';
    if(found)input.parentElement.firstChild.textContent='更换正脸照片';
  }catch{status.textContent='照片处理失败，请尝试清晰的 JPG 或 PNG 正面照。';}
  finally{if(url)URL.revokeObjectURL(url);try{await still?.close();}finally{input.value='';input.disabled=false;start.disabled=false;}}
};
window.addEventListener('pagehide',stop);
