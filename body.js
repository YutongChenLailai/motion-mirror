// Project connected, tapered body sections into the camera plane. Pose z uses image-width units.
export function drawBody(ctx, landmarks, w, h) {
  const p = landmarks.map(v => [v.x*w, v.y*h, v.z*w, v.visibility ?? 1]);
  const midpoint = (a,b) => a.map((v,i)=>(v+b[i])/2);
  const width = Math.hypot(...p[11].slice(0,3).map((v,i)=>v-p[12][i]));
  if (!Number.isFinite(width) || width < 5) return;
  const faces = [];
  function section(a,b,rx,ry,depth=1,side=null) {
    if(Math.min(a[3],b[3])<.52)return;
    const axis=b.slice(0,3).map((v,i)=>v-a[i]);
    const length=Math.hypot(...axis);
    if(length<1)return;
    const n=axis.map(v=>v/length);
    const unit=v=>v.map(x=>x/(Math.hypot(...v)||1));
    const cross=(u,v)=>[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    const u=side?unit(cross(n,cross(side,n))):unit(cross(n,Math.abs(n[2])>.9?[0,1,0]:[0,0,1]));
    const v=cross(n,u);
    let previous;
    for(const [t,f] of [[-.035,.38],[.06,.91],[.3,1],[.72,.94],[.96,.79],[1.025,.28]]){
      const ring=Array.from({length:16},(_,j)=>{
        const angle=j*Math.PI/8,rad=width*(rx+(ry-rx)*t)*f;
        return a.slice(0,3).map((base,k)=>base+axis[k]*t+rad*(u[k]*Math.cos(angle)+v[k]*Math.sin(angle)*depth));
      });
      if(previous)ring.forEach((point,j)=>{
        const k=(j+1)%16, quad=[previous[j],previous[k],ring[k],point];
        const normal=unit(cross(quad[1].map((x,i)=>x-quad[0][i]),point.map((x,i)=>x-quad[0][i])));
        if(normal[2]>=0)return;
        const light=.48+.49*Math.max(0,-.44*normal[0]-.51*normal[1]-.73*normal[2]);
        faces.push({quad,z:quad.reduce((sum,v)=>sum+v[2],0)/4,light});
      });
      previous=ring;
    }
  }
  section(midpoint(p[11],p[12]),midpoint(p[23],p[24]),.54,.42,.58,p[12].slice(0,3).map((v,i)=>v-p[11][i]));
  for(const s of [0,1]){
    section(p[11+s],p[13+s],.16,.103);section(p[13+s],p[15+s],.117,.072);
    section(p[23+s],p[25+s],.22,.145);section(p[25+s],p[27+s],.15,.084);
  }
  ctx.save();ctx.globalCompositeOperation='source-atop';
  for(const {quad,light} of faces.sort((a,b)=>b.z-a.z)){
    ctx.fillStyle='rgb('+[171,204,176].map(v=>Math.round(v*light)).join(',')+')';
    ctx.beginPath();quad.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();
  }
  ctx.restore();
}
