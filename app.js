import {createAvatar} from './avatar.js';
const $ = s => document.querySelector(s);
const canvas = $('canvas'), video = document.createElement('video');
const status = $('#status'), start = $('#start');
const cdn = 'https://cdn.jsdelivr.net/npm/@mediapipe/holistic@0.5.1675471629/';
let tracker, stream, active = false, busy = false;
video.muted=true;video.playsInline=true;
let avatar;
start.disabled=true;
try {avatar=await createAvatar(canvas); $('#intro').hidden=true;start.disabled=false;} catch(e){console.error(e);$('#intro').textContent='角色载入失败，请刷新重试';}
const preview = $('#preview'), toggle = $('#face');
const previewContext = preview.getContext('2d');
let crop;
function drawPreview(face) {
  if (preview.hidden) return;
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return;
  let target = {x:w/2, y:h/2, size:Math.min(w,h)};
  if (face?.length) {
    const left = face[234], right = face[454], forehead = face[10], chin = face[152];
    target = {
      x:(left.x+right.x)*w/2, y:(forehead.y+chin.y)*h/2,
      size:Math.min(w,h,Math.max(Math.abs(left.x-right.x)*w,Math.abs(chin.y-forehead.y)*h)*1.75)
    };
  }
  if (!crop) crop = {...target};
  for (const k of ['x','y','size']) crop[k] += (target[k]-crop[k])*.32;
  const size = Math.max(1,crop.size);
  const x = Math.max(0,Math.min(w-size,crop.x-size/2));
  const y = Math.max(0,Math.min(h-size,crop.y-size/2));
  previewContext.drawImage(video,x,y,size,size,0,0,preview.width,preview.height);
}
toggle.onclick=()=>{
  preview.hidden=!preview.hidden;
  toggle.setAttribute('aria-pressed',String(!preview.hidden));
  crop=null;
  drawPreview();
};
let frame = 0;
async function initialize() {
  if (tracker) return;
  if (!window.Holistic) await new Promise((resolve,reject) => {
    const script = document.createElement('script');
    script.src = cdn + 'holistic.js'; script.onload = resolve; script.onerror = reject;
    document.head.append(script);
  });

  tracker = new Holistic({locateFile: file => cdn + file});
  tracker.setOptions({modelComplexity:1,smoothLandmarks:true,enableSegmentation:false,
    smoothSegmentation:true,refineFaceLandmarks:true,minDetectionConfidence:.55,minTrackingConfidence:.55});
  tracker.onResults(r=>{
    if(!active)return;
    drawPreview(r.faceLandmarks);
    avatar.track(r,video.videoHeight/video.videoWidth);
    status.textContent=r.poseLandmarks?'角色追踪中':'等待人物入镜…';
  });
}
function stop() {
  active=false; cancelAnimationFrame(frame); stream?.getTracks().forEach(t=>t.stop());
  preview.hidden=true;toggle.disabled=true;toggle.setAttribute('aria-pressed','false');crop=null;
  previewContext.clearRect(0,0,preview.width,preview.height);
  video.srcObject=null; avatar?.idle();
  start.ariaLabel='开启摄像头';start.setAttribute('aria-pressed','false'); 
}
async function loop() {
  if(!active)return;
  if(!busy && video.readyState>=2 && video.currentTime!==loop.last){
    loop.last=video.currentTime;busy=true;
    try {await tracker.send({image:video});} catch {stop();status.classList.add('error');status.textContent='追踪中断，请重新开启摄像头。';} finally {busy=false;}
  }
  if(active)frame=requestAnimationFrame(loop);
}
start.onclick=async()=>{
  if(active){stop();status.textContent='摄像头已关闭。';return;}
  status.classList.remove('error');start.disabled=true;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}},audio:false});
    video.srcObject=stream;await video.play();status.textContent='首次启动正在加载追踪模型…';
    await initialize();active=true;toggle.disabled=false;$('#intro').hidden=true;start.ariaLabel='关闭摄像头';start.setAttribute('aria-pressed','true');
    await loop();
  }catch(e){stop();status.classList.add('error');status.textContent=e.name==='NotAllowedError'?'请在浏览器的网站设置中允许使用摄像头。':'启动失败，请检查摄像头与网络后重试。';}
  finally{start.disabled=false;}
};
window.addEventListener('pagehide',stop);
