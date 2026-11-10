import * as T from './assets/engine.js';

// Load the MakeHuman infant surface with its original joint locations and skin weights.
export async function loadInfant(){
  const response=await fetch('assets/infant.json');
  if(!response.ok)throw new Error('Infant asset unavailable');
  const data=await response.json();
  const bones=data.bones.map(([name,parent,xyz])=>{
    const bone=new T.Bone();bone.name=name;bone.position.fromArray(xyz);
    if(parent>=0)bone.position.sub(new T.Vector3().fromArray(data.bones[parent][2]));
    return bone;
  });
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(data.position,3));
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(data.joints,4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(data.weights,4));
  geometry.setIndex(data.index);geometry.computeVertexNormals();
  const skin=new T.MeshStandardMaterial({color:0xe5b59d,roughness:.88});
  const body=new T.SkinnedMesh(geometry,skin);
  data.bones.forEach(([,parent],i)=>(parent<0?body:bones[parent]).add(bones[i]));
  body.updateMatrixWorld(true);body.bind(new T.Skeleton(bones));body.normalizeSkinWeights();
  for(const eye of bones.filter(b=>b.name.endsWith('eye'))){
    const globe=new T.Mesh(new T.SphereGeometry(.031,24,16),new T.MeshStandardMaterial({color:0xd9c6b4}));
    const iris=new T.Mesh(new T.SphereGeometry(.016,16,12),new T.MeshStandardMaterial({color:0x332822}));
    iris.position.z=.026;eye.add(globe,iris);
  }
  return body;
}
