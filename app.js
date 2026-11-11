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
    avatar.track(r,video.videoHeight/video.videoWidth);
    status.textContent=r.poseLandmarks?'角色追踪中':'等待人物入镜…';
  });
}
function stop() {
  active=false; cancelAnimationFrame(frame); stream?.getTracks().forEach(t=>t.stop());
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
    await initialize();active=true;$('#intro').hidden=true;start.ariaLabel='关闭摄像头';start.setAttribute('aria-pressed','true');
    await loop();
  }catch(e){stop();status.classList.add('error');status.textContent=e.name==='NotAllowedError'?'请在浏览器的网站设置中允许使用摄像头。':'启动失败，请检查摄像头与网络后重试。';}
  finally{start.disabled=false;}
};
window.addEventListener('pagehide',stop);
