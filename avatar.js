import * as T from './assets/engine.js';
export async function createAvatar(canvas){
  const renderer=new T.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new T.Scene(), camera=new T.PerspectiveCamera(30,1,.01,20);
  scene.add(new T.HemisphereLight(0xfff7ed,0x797a80,2.4));
  const key=new T.DirectionalLight(0xffeee3,2.1); key.position.set(2,3,4);scene.add(key);
  const [{scene:model},photo]=await Promise.all([new T.GLTFLoader().loadAsync('assets/body.glb'),new T.TextureLoader().loadAsync('assets/portrait.jpg')]);
  photo.colorSpace=T.SRGBColorSpace;
  model.scale.setScalar(.01);scene.add(model);model.updateMatrixWorld(true);
  const bones={},rest={},targets={};
  model.traverse(o=>{if(o.isBone){const name=o.name.replace('mixamorig','');bones[name]=o;rest[name]=o.quaternion.clone();targets[name]=o.quaternion.clone();}});
  const pos=b=>b.getWorldPosition(new T.Vector3());
  const head=pos(bones.Head),height=.22;
  const [bodyMap,headMap]=await Promise.all(['body','head'].map(async name=>{
    const map=await new T.TextureLoader().loadAsync('assets/'+name+'.jpg');
    map.colorSpace=T.SRGBColorSpace;map.flipY=true;return map;
  }));
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh)return;
    mesh.frustumCulled=false;
    const part=mesh.material.name;
    if(part.includes('opacity')){mesh.visible=false;return;}
    mesh.material.map=part.includes('body')?bodyMap:headMap;
    if(part.includes('body'))return;
    const uv=[],attr=mesh.geometry.attributes.position;
    for(let i=0;i<attr.count;i++){
      const p=mesh.localToWorld(mesh.getVertexPosition(i,new T.Vector3()));
      uv.push(.5+(p.x-head.x)/(height*.85),(p.y-head.y)/height,(p.z-head.z)/height);
    }
    mesh.geometry.setAttribute('portraitCoord',new T.Float32BufferAttribute(uv,3));
    mesh.material.onBeforeCompile=shader=>{
      shader.uniforms.babyPhoto={value:photo};
      shader.vertexShader='attribute vec3 portraitCoord; varying vec3 faceCoord;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfaceCoord=portraitCoord;');
      shader.fragmentShader='uniform sampler2D babyPhoto; varying vec3 faceCoord;\n'+shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      vec2 uvBaby=vec2(.50+(faceCoord.x-.5)*.75,.045+faceCoord.y*.82);
      float blend=smoothstep(-.12,-.02,faceCoord.y)*smoothstep(.04,.22,faceCoord.z)*(1.-smoothstep(.44,.56,abs(faceCoord.x-.5)));
      diffuseColor.rgb=mix(diffuseColor.rgb,texture2D(babyPhoto,clamp(uvBaby,0.,1.)).rgb,blend);`);
    };
  });
  const dir=new T.Vector3();
  function aim(name,child,delta){
    const bone=bones[name],end=bones[child];
    if(!bone||!end||delta.lengthSq()<.000001)return;
    const local=delta.normalize().applyQuaternion(bone.parent.getWorldQuaternion(new T.Quaternion()).invert());
    targets[name].setFromUnitVectors(end.position.clone().normalize().applyQuaternion(rest[name]),local).multiply(rest[name]);
  }
  const handEffect=new T.Group();scene.add(handEffect);
  for(let i=0;i<8;i++){
    const ring=new T.Mesh(new T.TorusGeometry(.12+i*.003,.0018,6,80,5.8),new T.MeshBasicMaterial({color:new T.Color().setHSL(.33+i*.012,.85,.68),blending:T.AdditiveBlending}));
    ring.rotation.set(i*.16,i*.24,i*.6);handEffect.add(ring);
  }
  const rootTarget=new T.Vector3();
  let anchor=null,side=null,roll=0,magic=false,last=0,seen=0;
  const restHeadWorld=bones.Head.getWorldQuaternion(new T.Quaternion());
  const restBodyWorld=bones.Pelvis.getWorldQuaternion(new T.Quaternion());
  function orient(name,rotation,bind){
    targets[name].copy(bones[name].parent.getWorldQuaternion(new T.Quaternion()).invert())
      .multiply(new T.Quaternion().setFromEuler(rotation)).multiply(bind);
  }
  function idle(){
    for(const name in rest)targets[name].copy(rest[name]);
    for(const [s,sign] of [['Left',1],['Right',-1]])aim(s+'Arm',s+'ForeArm',new T.Vector3(sign*.2,-1,.08));
    side=null;anchor=null;rootTarget.set(0,0,0);
  }
  idle();
  for(const name in bones)bones[name].quaternion.copy(targets[name]);
  function track(r,aspect){
    const pose=r.poseWorldLandmarks||r.poseLandmarks;if(!pose)return;
    seen=performance.now();
    const world=!!r.poseWorldLandmarks;
    const vector=(a,b,ratio)=>new T.Vector3(b.x-a.x,-(b.y-a.y)*ratio,a.z-b.z);
    const ratio=world?1:aspect;
    const move=(name,child,a,b)=>{if(Math.min(a.visibility??1,b.visibility??1)>.5)aim(name,child,vector(a,b,ratio));};
    const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2,visibility:Math.min(a.visibility??1,b.visibility??1)});
    const image=r.poseLandmarks;
    if(Math.min(image[23].visibility??1,image[24].visibility??1)>.6){
      const center=mid(image[23],image[24]);
      if(!anchor)anchor=center;
      rootTarget.set(T.MathUtils.clamp((center.x-anchor.x)*2.5,-.65,.65),T.MathUtils.clamp((anchor.y-center.y)*1.8,-.55,.35),0);
    }
    const across=vector(pose[24],pose[23],ratio);
    if(Math.min(pose[23].visibility??1,pose[24].visibility??1)>.6)
      orient('Pelvis',new T.Euler(0,-Math.atan2(across.z,across.x),0),restBodyWorld);
    move('Spine','Spine1',mid(pose[23],pose[24]),mid(pose[11],pose[12]));
    const face=r.faceLandmarks;
    if(face){
      const a=face[33],b=face[263],yaw=Math.atan2(a.z-b.z,b.x-a.x),tilt=Math.atan2((a.y-b.y)*aspect,b.x-a.x);
      const pitch=T.MathUtils.clamp(Math.atan2(face[10].z-face[152].z,(face[152].y-face[10].y)*aspect),-.8,.8);
      orient('Head',new T.Euler(pitch,-yaw,tilt,'YXZ'),restHeadWorld);
    }
    for(const [s,j] of [['Left',0],['Right',1]]){
      for(const [a,b,i,k] of [['Arm','ForeArm',11,13],['ForeArm','Hand',13,15],['UpLeg','Leg',23,25],['Leg','Foot',25,27],['Foot','ToeBase',27,31]])
        move(s+a,s+b,pose[i+j],pose[k+j]);
      const hand=j?r.rightHandLandmarks:r.leftHandLandmarks;
      if(hand){
        aim(s+'Hand',s+'HandMiddle1',vector(hand[0],hand[9],aspect));
        ['Thumb','Index','Middle','Ring','Pinky'].forEach((finger,k)=>{
          for(let n=1;n<=3;n++)aim(s+'Hand'+finger+n,s+'Hand'+finger+(n+1),vector(hand[k*4+n],hand[k*4+n+1],aspect));
        });
      }
    }
    side=r.rightHandLandmarks?'Right':r.leftHandLandmarks?'Left':null;
    if(side){const h=r.rightHandLandmarks||r.leftHandLandmarks;roll=Math.atan2((h[5].y-h[17].y)*aspect,h[5].x-h[17].x);}
  }
  new ResizeObserver(()=>{
    const {width,height}=canvas.parentElement.getBoundingClientRect();renderer.setSize(width,height,false);
    camera.aspect=width/height;camera.position.set(0,.93,Math.max(3.95,3.8/camera.aspect));camera.lookAt(0,.93,0);camera.updateProjectionMatrix();
  }).observe(canvas.parentElement);
  renderer.setAnimationLoop(t=>{
    const alpha=1-Math.exp(-Math.min(.1,(t-last)/1000)*19); last=t;
    if(seen && t-seen>650){idle();seen=0;}
    model.position.lerp(rootTarget,alpha);
    for(const name in bones)bones[name].quaternion.slerp(targets[name],alpha);
    handEffect.visible=magic&&!!side;
    if(handEffect.visible){bones[side+'HandMiddle1'].getWorldPosition(dir);handEffect.position.copy(dir);handEffect.rotation.set(.4,roll,roll*2+t*.00035);}
    renderer.render(scene,camera);
  });
  return {track,idle,setEffect:value=>{magic=value;}};
}
