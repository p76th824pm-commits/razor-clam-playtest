/* Phase 1: a measurable 3D space with shallow water and settling sand. Units: metres. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  function fail(message) { $('error').hidden = false; $('error-detail').textContent = message; }
  if (!window.THREE) { fail('vendor/three.min.js 파일을 확인해 주세요.'); return; }
  const T = window.THREE;
  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias:true, powerPreference:'low-power' }); }
  catch (e) { fail(e.message); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.NoToneMapping;
  $('stage').appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','호미로 파낸 갯벌에 얕게 고인 물과 불규칙한 작은 구멍. 젖은 모래가 구멍으로 천천히 흘러들어갑니다.');
  renderer.domElement.addEventListener('webglcontextlost', e => { e.preventDefault(); fail('그래픽 연결이 끊겼습니다. 페이지를 새로고침해 주세요.'); });
  const sound=window.createSandboxAudio();
  document.addEventListener('pointerdown',()=>sound.unlock(),{passive:true});
  $('sound-enabled').addEventListener('change',e=>sound.setEnabled(e.target.checked));
  const scene = new T.Scene();
  scene.background = new T.Color('#e8ceaa');
  scene.fog = new T.Fog('#e8ceaa', 3.5, 9);
  const camera = new T.PerspectiveCamera(43, 1, .01, 20);
  const cameraBase=new T.Vector3(),cameraTarget=new T.Vector3(0,.025,0);
  const cameraFeedback={impulse:0,load:0,peak:0};
  function kickCamera(amount){cameraFeedback.impulse=Math.min(.022,cameraFeedback.impulse+amount);cameraFeedback.peak=Math.max(cameraFeedback.peak,cameraFeedback.impulse);}
  function applyCameraFeedback(dt){
    cameraFeedback.impulse*=Math.exp(-dt*9);
    cameraFeedback.load=T.MathUtils.damp(cameraFeedback.load,pull.phase==='pulling'?Math.min(1.5,pull.tension/6):0,8,dt);
    const amount=$('camera-feedback').checked?cameraFeedback.impulse+cameraFeedback.load*.0024:0;
    camera.position.copy(cameraBase);
    if(amount){
      camera.position.x+=Math.sin(environmentTime*54)*amount*.65;
      camera.position.y+=Math.cos(environmentTime*42)*amount*.45;
      camera.position.z-=cameraFeedback.impulse*.65;
    }
    camera.lookAt(cameraTarget);
  }
  scene.add(new T.HemisphereLight('#fff5e7','#bda2aa',1.25));
  const sun = new T.DirectionalLight('#fff4df',1.7);
  sun.position.set(-2.5,4,1.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-1.4,right:1.4,top:1.4,bottom:-1.4,near:.1,far:9});
  sun.shadow.normalBias=.002; sun.shadow.bias=-.0001; sun.shadow.radius=3;
  scene.add(sun);
  let seed=8247;
  function random(){seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;}
  // Three broad shade bands and restrained outlines replace photographic shading.
  const shadeRamp=new T.DataTexture(new Uint8Array([100,177,240]),3,1,T.RedFormat);
  shadeRamp.minFilter=T.NearestFilter;shadeRamp.magFilter=T.NearestFilter;shadeRamp.needsUpdate=true;
  const mat=(color,_roughness=.8,extra={})=>new T.MeshToonMaterial({color,gradientMap:shadeRamp,...extra});
  function mesh(geo, material, parent=scene){const m=new T.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function outlined(geo,material,parent=scene){
    const m=mesh(geo,material,parent);
    const outline=new T.Mesh(geo,new T.MeshBasicMaterial({color:'#775647',side:T.BackSide,clippingPlanes:material.clippingPlanes}));
    outline.scale.setScalar(1.035);m.add(outline);return m;
  }
  // The hoe scrape is a shallow, irregular excavation. The burrow is a separate
  // small opening in its floor, with only a few millimetres around the shell.
  const floorY=-.052;
  function holeRadius(a){
    // Two joined openings make the razor-clam clue visible at close range.
    const c=Math.cos(a), s=Math.sin(a), r=.021, offset=.010;
    return (Math.abs(offset*s)+Math.sqrt(r*r-offset*offset*c*c))*(1+.035*Math.sin(a*3+.4)+.025*Math.sin(a*7-1.1));
  }
  function terrain(x,z){
    const r=Math.hypot(x,z),a=Math.atan2(z,x);
    const q=(Math.abs((x+.015)/.205)**4+Math.abs((z-.018)/.155)**4)**.25;
    const edge=q*(1+.035*Math.sin(a*7)+.025*Math.cos(a*11));
    const dug=1-T.MathUtils.smoothstep(edge,.80,1.02);
    const centre=T.MathUtils.smoothstep(r,.044,.085);
    const natural=Math.sin(x*5+z*3)*Math.cos(z*7)*.001;
    // Parallel shallow cuts left by dragging a hoe across the exposed floor.
    const scrape=-.0007*Math.pow(.5+.5*Math.sin(x*95+z*8),8)*dug*centre;
    return {height:-.004+(floorY+.004)*dug+natural*(1-dug)+scrape,dug};
  }
  const groundGeo=new T.BufferGeometry(), vertices=[],colors=[],indices=[];
  const sectors=192,rings=180;
  for(let ring=0;ring<=rings;ring++){
    const t=ring/rings;
    for(let s=0;s<=sectors;s++){
      const a=s/sectors*Math.PI*2;
      const inner=holeRadius(a);
      const r=inner+6*t*t, x=Math.cos(a)*r,z=Math.sin(a)*r;
      const sample=terrain(x,z);vertices.push(x,sample.height,z);
      const color=new T.Color('#e6c38d').lerp(new T.Color('#b88d6c'),sample.dug*.85);
      colors.push(color.r,color.g,color.b);
      if(ring<rings&&s<sectors){const n=ring*(sectors+1)+s;indices.push(n,n+1,n+sectors+1,n+1,n+sectors+2,n+sectors+1);}
    }
  }
  groundGeo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  groundGeo.setIndex(indices);groundGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));groundGeo.computeVertexNormals();
  mesh(groundGeo,mat('#ffffff',.83,{vertexColors:true}));
  const wallVertices=[],wallIndices=[];
  for(let row=0;row<2;row++)for(let s=0;s<=sectors;s++){
    const a=s/sectors*Math.PI*2,r=holeRadius(a)*(row? .86:1);
    wallVertices.push(Math.cos(a)*r,floorY-row*.105,Math.sin(a)*r);
    if(!row&&s<sectors){const n=s;wallIndices.push(n,n+1,n+sectors+1,n+1,n+sectors+2,n+sectors+1);}
  }
  const wallGeo=new T.BufferGeometry();wallGeo.setAttribute('position',new T.Float32BufferAttribute(wallVertices,3));wallGeo.setIndex(wallIndices);wallGeo.computeVertexNormals();
  mesh(wallGeo,mat('#70534e',.75,{side:T.DoubleSide}));
  const bottom=mesh(new T.CircleGeometry(.045,48),new T.MeshBasicMaterial({color:'#443a43'}));bottom.rotation.x=-Math.PI/2;bottom.position.y=floorY-.105;
  // A few millimetres of translucent water, with the same irregular opening.
  const waterY=floorY+.004,waterVertices=[],waterIndices=[];
  const waterRings=16,waterSectors=128;
  for(let row=0;row<=waterRings;row++)for(let s=0;s<=waterSectors;s++){
    const a=s/waterSectors*Math.PI*2;
    const outer=(1/Math.sqrt((Math.cos(a)/.142)**2+(Math.sin(a)/.108)**2))*(1+.055*Math.sin(a*5)+.025*Math.cos(a*9));
    const r=T.MathUtils.lerp(holeRadius(a),outer,row/waterRings);
    waterVertices.push(Math.cos(a)*r,waterY,Math.sin(a)*r);
    if(row<waterRings&&s<waterSectors){const n=row*(waterSectors+1)+s;waterIndices.push(n,n+1,n+waterSectors+1,n+1,n+waterSectors+2,n+waterSectors+1);}
  }
  const waterGeo=new T.BufferGeometry();waterGeo.setAttribute('position',new T.Float32BufferAttribute(waterVertices,3));waterGeo.setIndex(waterIndices);waterGeo.computeVertexNormals();
  const waterMat=new T.MeshBasicMaterial({color:'#88c9c1',transparent:true,opacity:.72,depthWrite:false});
  const water=mesh(waterGeo,waterMat);water.castShadow=false;water.renderOrder=2;
  // Broad, hand-drawn-looking highlights make the shallow water readable.
  const highlightMat=new T.MeshBasicMaterial({color:'#e4f5d9',transparent:true,opacity:.8,depthWrite:false});
  for(const [start,length,r] of [[.3,.48,.10],[2.2,.65,.086],[4.25,.48,.112]]){
    const points=[];
    for(let i=0;i<=24;i++){const a=start+length*i/24;points.push(new T.Vector3(Math.cos(a)*r,waterY+.001,Math.sin(a)*r*.8));}
    const highlight=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.001,5,false),highlightMat);
    highlight.castShadow=false;highlight.renderOrder=3;
  }
  const rippleGeo=new T.BufferGeometry();const rippleVertices=new Float32Array(3*2*22*3);
  rippleGeo.setAttribute('position',new T.BufferAttribute(rippleVertices,3));
  const ripples=new T.LineSegments(rippleGeo,new T.LineBasicMaterial({color:'#edfbe1',transparent:true,opacity:.55,depthWrite:false}));
  ripples.renderOrder=3;scene.add(ripples);
  // Short, staggered slides of wet grains. Each follows the floor then sinks
  // at the lip, instead of orbiting the burrow or flying through the air.
  const grainCount=48,grainData=[];
  const flowingSand=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),mat('#f1d09a',.76),grainCount);
  flowingSand.instanceMatrix.setUsage(T.DynamicDrawUsage);flowingSand.frustumCulled=false;scene.add(flowingSand);
  for(let i=0;i<grainCount;i++)grainData.push({angle:random()*Math.PI*2,start:.055+random()*.055,duration:3+random()*3,offset:random(),size:.001+random()*.0011});
  const sandTransform=new T.Object3D();
  let environmentTime=0;
  function animateEnvironment(time){
    environmentTime=time;
    const wp=waterGeo.attributes.position;
    for(let i=0;i<wp.count;i++){
      const x=wp.getX(i),z=wp.getZ(i),r=Math.hypot(x,z);
      wp.setY(i,waterY+Math.sin(r*145+time*1.7)*.00032+Math.sin(x*83-z*67-time*.8)*.00015);
    }
    wp.needsUpdate=true;waterGeo.computeVertexNormals();
    let index=0;
    for(let arc=0;arc<3;arc++){
      const phase=(time*.14+arc/3)%1,r=.10-phase*.054;
      for(let s=0;s<22;s++)for(let endpoint=0;endpoint<2;endpoint++){
        const a=arc*2.1+(s+endpoint)/22*.7+.1*Math.sin(time*.35);
        rippleVertices[index++]=Math.cos(a)*r;
        rippleVertices[index++]=waterY+.0008;
        rippleVertices[index++]=Math.sin(a)*r*.81;
      }
    }
    rippleGeo.attributes.position.needsUpdate=true;
    for(let i=0;i<grainCount;i++){
      const g=grainData[i],p=(time/g.duration+g.offset)%1;
      const a=g.angle+.015*Math.sin(p*7+g.angle);
      const edge=holeRadius(a),r=T.MathUtils.lerp(g.start,edge-.002,p*p);
      const sink=T.MathUtils.smoothstep(p,.9,1);
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      const y=terrain(x,z).height+g.size*.5-sink*.012;
      const scale=g.size*Math.min(1,p*9)*(1-sink*.8);
      sandTransform.position.set(x,y,z);sandTransform.rotation.set(p*2,a,p*1.3);sandTransform.scale.set(scale,scale*.6,scale*.8);sandTransform.updateMatrix();flowingSand.setMatrixAt(i,sandTransform.matrix);
    }
    flowingSand.instanceMatrix.needsUpdate=true;
  }
  // Broken slabs and smaller clods are pushed to one side, not a circular rim.
  const clodMaterials=[mat('#c99b70'),mat('#d5ac7a'),mat('#b88b69')];
  const clodGeo=new T.SphereGeometry(1,12,8);
  for(let i=0;i<19;i++){
    const along=random(),x=.155+random()*.11,z=-.14+along*.34;
    const width=.01+random()*.023,depth=.014+random()*.027,height=.005+random()*.012;
    const clod=outlined(clodGeo,clodMaterials[i%3]);
    clod.scale.set(width,height,depth);clod.rotation.set(random()*.45,random()*6,random()*.5);
    clod.position.set(x,terrain(x,z).height+height*.7,z);
  }
  for(let i=0;i<7;i++){
    const x=-.16+random()*.29,z=-.155-random()*.045;
    const clod=outlined(clodGeo,clodMaterials[i%3]);
    clod.scale.set(.016+random()*.021,.008+random()*.011,.009+random()*.015);
    clod.rotation.y=random()*6;clod.position.set(x,terrain(x,z).height+.005,z);
  }
  const scrapeMat=mat('#b28666',.9);
  for(let i=0;i<5;i++){
    const x=-.13+i*.065,points=[];
    for(let j=0;j<=20;j++){
      const z=-.09+j*.008,px=x+Math.sin(z*7)*.012;
      if(Math.hypot(px,z)<.044)continue;
      points.push(new T.Vector3(px,terrain(px,z).height+.0008,z));
    }
    // Skip the central stroke to keep the burrow completely unobstructed.
    if(Math.abs(x)<.04)continue;
    const stroke=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),28,.0011,5,false),scrapeMat);
    stroke.castShadow=false;
  }
  const clam=new T.Group();scene.add(clam);
  // Keep the head visible inside the burrow; terrain and burrow walls occlude it.
  // Only clip below the shaft bottom, not at the mouth of the hole.
  const clip=new T.Plane(new T.Vector3(0,1,0),-(floorY-.105));
  // Approved concept B: a single closed, plump shell (about 4.6:1).
  // The two valves meet on the narrow sides, not down the broad front face.
  const shellRadius=.029,shellStraight=.21;
  const shellGeo=new T.CapsuleGeometry(shellRadius,shellStraight,12,40);
  shellGeo.scale(1,1,.68);
  const shellColors=[],shellPositions=shellGeo.attributes.position;
  for(let i=0;i<shellPositions.count;i++){
    const x=shellPositions.getX(i);
    const shellTone=new T.Color('#f6eee5');
    const stripe=Math.exp(-(((x+.010)/.012)**2));
    shellTone.lerp(new T.Color('#ffffff'),stripe*.65);
    const edge=T.MathUtils.smoothstep(Math.abs(x),.019,.029);
    shellTone.lerp(new T.Color('#ae9e99'),edge*.34);
    shellColors.push(shellTone.r,shellTone.g,shellTone.b);
  }
  shellGeo.setAttribute('color',new T.Float32BufferAttribute(shellColors,3));
  // Bands run along the shell so the rainbow remains visible when it emerges.
  const rainbowShellColors=[];
  for(let i=0;i<shellPositions.count;i++){
    const x=shellPositions.getX(i);
    const across=T.MathUtils.clamp((x+.029)/.058,0,1);
    const pigment=new T.Color().setHSL(across*.78,.96,.55);
    const stripe=Math.exp(-(((x+.010)/.012)**2));
    pigment.lerp(new T.Color('#fff9ed'),stripe*.17);
    rainbowShellColors.push(pigment.r,pigment.g,pigment.b);
  }
  const shellMat=mat('#ffffff',.8,{vertexColors:true,clippingPlanes:[clip]});
  const shell=outlined(shellGeo,shellMat,clam);
  // Narrow cream lip along the two long valve edges and rounded ends.
  const rimPoints=[];
  const rimRadius=.0276;
  for(let i=0;i<=28;i++){
    const a=i/28*Math.PI;
    rimPoints.push(new T.Vector3(Math.cos(a)*rimRadius,shellStraight/2+Math.sin(a)*rimRadius,.006));
  }
  for(let i=1;i<20;i++)rimPoints.push(new T.Vector3(-rimRadius,shellStraight/2-shellStraight*i/20,.006));
  for(let i=0;i<=28;i++){
    const a=Math.PI+i/28*Math.PI;
    rimPoints.push(new T.Vector3(Math.cos(a)*rimRadius,-shellStraight/2+Math.sin(a)*rimRadius,.006));
  }
  for(let i=1;i<20;i++)rimPoints.push(new T.Vector3(rimRadius,-shellStraight/2+shellStraight*i/20,.006));
  const rimCurve=new T.CatmullRomCurve3(rimPoints,true,'centripetal');
  const rim=mesh(new T.TubeGeometry(rimCurve,140,.0009,6,true),mat('#f8dfa8',.8,{clippingPlanes:[clip]}),clam);
  rim.castShadow=false;
  // A seam only on the side keeps the shell reading as one object.
  const seamPoints=[new T.Vector3(.0286,-.103,0),new T.Vector3(.0292,0,0),new T.Vector3(.0286,.103,0)];
  const seam=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(seamPoints),24,.00055,5,false),mat('#9e6d43',.8,{clippingPlanes:[clip]}),clam);
  seam.castShadow=false;
  // Broad, sparse growth curves follow the shell, rather than metal-like hoops.
  const bandMat=mat('#d29b5c',.8,{clippingPlanes:[clip]});
  for(const centreY of [-.075,.006,.081])for(const offset of [0,.003]){
    const points=[];
    for(let i=0;i<=36;i++){
      const a=.19+(Math.PI-.38)*i/36;
      points.push(new T.Vector3(Math.cos(a)*.02915,centreY+offset-.006*Math.sin(a),Math.sin(a)*.01985));
    }
    const band=mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points),36,.00038,4,false),bandMat,clam);band.castShadow=false;
  }
  // Two short cream siphons with recessed openings, as in the selected image.
  const fleshMat=mat('#f7dfad',.8,{clippingPlanes:[clip]});
  for(const [x,h] of [[-.009,.015],[.009,.012]]){
    const baseY=.123;
    const tube=mesh(new T.CylinderGeometry(.0064,.0073,h,24,1,true),fleshMat,clam);
    tube.position.set(x,baseY+h/2,0);
    const lip=mesh(new T.TorusGeometry(.0062,.00085,8,28),mat('#fbe8bc',.8,{clippingPlanes:[clip]}),clam);
    lip.rotation.x=-Math.PI/2;lip.position.set(x,baseY+h,0);
    const opening=mesh(new T.CircleGeometry(.0055,24),mat('#a87f50',.8,{clippingPlanes:[clip]}),clam);
    opening.rotation.x=-Math.PI/2;opening.position.set(x,baseY+h-.0012,0);
  }
  // Each type has a small, distinct face. All ten share the same shell silhouette.
  const faceStyles=[
    {eye:[.86,1],mouth:'smile',mouthSize:.0046},
    {eye:[1.16,1.28],mouth:'round',mouthSize:.0026,brows:'raised'},
    {eye:[1.23,.58],mouth:'smile',mouthSize:.0066,cheeks:true},
    {eye:[.78,1.38],mouth:'frown',mouthSize:.0038,brows:'worried'},
    {eye:[1.12,.66],mouth:'flat',mouthSize:.0048,brows:'heavy'},
    {eye:[1.12,1.08],mouth:'smile',mouthSize:.0054,brows:'raised'},
    {eye:[1.28,.95],mouth:'smile',mouthSize:.006,brows:'heavy'},
    {eye:[.97,.72],mouth:'smile',mouthSize:.0045},
    {eye:[.84,.72],mouth:'round',mouthSize:.0025,brows:'worried'},
    {eye:[1.15,1.2],mouth:'smile',mouthSize:.0062,cheeks:true},
    {eye:[1.2,1.15],mouth:'smile',mouthSize:.0068,cheeks:true,brows:'raised'}
  ];
  const faceVariants=faceStyles.map((style,index)=>{
    const face=new T.Group();clam.add(face);face.visible=index===0;
    const ink=mat(index===3?'#3e4240':'#49372f');
    for(const x of [-.0115,.0115]){
      const eye=mesh(new T.SphereGeometry(.003,12,10),ink,face);
      eye.scale.set(style.eye[0],style.eye[1],.75);
      eye.position.set(x,.130,.014);
      const shine=mesh(new T.SphereGeometry(.00075,8,6),mat('#fff8e9'),face);
      shine.position.set(x-.0006,.1312,.0165);shine.scale.set(1,style.eye[1],1);
      if(style.brows){
        const angle=style.brows==='worried'?(x<0?-.28:.28):style.brows==='raised'?0:(x<0?.16:-.16);
        const brow=mesh(new T.CapsuleGeometry(.0006,.005,4,8),ink,face);
        brow.rotation.z=Math.PI/2+angle;brow.position.set(x,.137,style.brows==='heavy'?.015:.013);
      }
      if(style.cheeks){
        const cheek=mesh(new T.SphereGeometry(.0025,10,8),mat('#d88e80'),face);
        cheek.scale.set(1.7,.65,.55);cheek.position.set(x*1.75,.121,.017);
      }
    }
    let mouth;
    if(style.mouth==='flat'){
      mouth=mesh(new T.CapsuleGeometry(.00055,style.mouthSize*2,4,8),ink,face);
      mouth.rotation.z=Math.PI/2;
    }else{
      const arc=style.mouth==='round'?Math.PI*2:Math.PI;
      mouth=mesh(new T.TorusGeometry(style.mouthSize,.00072,6,20,arc),ink,face);
      mouth.rotation.z=style.mouth==='smile'?Math.PI:0;
    }
    mouth.position.set(0,.119,.021);
    return face;
  });
  // A deliberately exaggerated face appears only while a clam protests the pull.
  const panicFace=new T.Group();clam.add(panicFace);panicFace.visible=false;
  const panicInk=mat('#48333a');
  for(const [x,y,twist] of [[-.012,.131,-.35],[.013,.129,.32]]){
    const eye=mesh(new T.SphereGeometry(.0044,12,10),panicInk,panicFace);
    eye.scale.set(.75,1.35,.7);eye.rotation.z=twist;eye.position.set(x,y,.016);
    const brow=mesh(new T.CapsuleGeometry(.0008,.008,4,8),panicInk,panicFace);
    brow.rotation.z=Math.PI/2-twist;brow.position.set(x,.141,.014);
  }
  const scream=mesh(new T.TorusGeometry(.0049,.001,7,20),panicInk,panicFace);
  scream.scale.set(1,1.45,1);scream.position.set(0,.115,.022);
  // A short, curved piece of flesh is left in the hand when a clam sheds its tip to escape.
  // It has no face: the tapered segments and torn, wet base should read like a lizard's dropped tail.
  const falseMask=new T.Group();scene.add(falseMask);falseMask.visible=false;
  const maskMat=mat('#e9b483');
  const maskBackMat=mat('#b9685c');
  const maskEdgeMat=mat('#f2c9a1');
  const maskBack=mesh(new T.CapsuleGeometry(.010,.034,8,18),maskMat,falseMask);
  maskBack.scale.set(1,.92,.72);maskBack.rotation.z=-.18;maskBack.position.set(0,.002,0);
  const maskPlate=mesh(new T.CapsuleGeometry(.0075,.024,8,16),maskMat,falseMask);
  maskPlate.scale.set(1,.92,.70);maskPlate.rotation.z=.52;maskPlate.position.set(.010,.027,.001);
  const tailTip=mesh(new T.CapsuleGeometry(.0048,.014,7,14),maskMat,falseMask);
  tailTip.scale.z=.66;tailTip.rotation.z=.90;tailTip.position.set(.025,.043,.001);
  const maskEdge=mesh(new T.CylinderGeometry(.0105,.0088,.004,18),maskBackMat,falseMask);
  maskEdge.rotation.x=Math.PI/2;maskEdge.position.set(-.004,-.016,.001);
  const tornCore=mesh(new T.SphereGeometry(1,12,8),maskEdgeMat,falseMask);
  tornCore.scale.set(.0048,.0022,.0065);tornCore.position.set(-.004,-.018,.004);
  const maskGlint=mesh(new T.CapsuleGeometry(.0012,.016,4,10),mat('#ffe7c7'),falseMask);
  maskGlint.rotation.z=.42;maskGlint.position.set(-.004,.009,.008);
  const trueBody=new T.Group();scene.add(trueBody);trueBody.visible=false;
  const trueShell=outlined(new T.CapsuleGeometry(.018,.092,10,24),mat('#567575'),trueBody);
  trueShell.scale.z=.7;
  for(const x of [-.007,.007]){
    const eye=mesh(new T.SphereGeometry(.0022,8,8),mat('#2f3e42'),trueBody);
    eye.position.set(x,.051,.012);
  }
  const sprayDrops=[];
  const sprayGeometry=new T.SphereGeometry(.0024,8,6);
  const sprayMaterial=new T.MeshBasicMaterial({color:'#d7f8ff',transparent:true,opacity:.9,depthWrite:false});
  for(let i=0;i<36;i++){
    const drop=mesh(sprayGeometry,sprayMaterial);drop.visible=false;drop.castShadow=false;
    sprayDrops.push({mesh:drop,velocity:new T.Vector3(),life:0});
  }
  const faceSplash=document.createElement('div');
  faceSplash.className='face-splash';faceSplash.hidden=true;faceSplash.setAttribute('aria-hidden','true');
  faceSplash.innerHTML='<div class="splash-sheet"></div><div class="splash-impact"></div><div class="splash-blink-top"></div><div class="splash-blink-bottom"></div>';
  for(const [i,[x,y,size,delay]] of [[49,46,112,0],[60,34,92,.03],[37,60,98,.04],[73,54,78,.07],[25,39,86,.02],[52,70,105,.09],[82,25,70,.11],[16,69,66,.07],[9,18,64,.04],[38,13,74,.06],[69,10,82,.1],[91,42,105,.03],[86,76,88,.12],[67,91,66,.14],[30,90,98,.06],[5,88,62,.09],[12,50,41,.04],[95,15,46,.1],[48,24,58,.02],[52,82,47,.08]].entries()){
    const drop=document.createElement('i');drop.className='splash-on-lens';
    drop.style.setProperty('--x',x+'%');drop.style.setProperty('--y',y+'%');
    drop.style.setProperty('--size',size+'px');drop.style.setProperty('--delay',delay+'s');
    const run=170+Math.round(random()*220);
    drop.style.setProperty('--run',run+'px');
    drop.style.setProperty('--run-near',Math.round(run*.12)+'px');
    drop.style.setProperty('--run-mid',Math.round(run*.66)+'px');
    drop.style.setProperty('--trail',Math.min(140,Math.max(30,Math.round(run*.35)))+'px');
    if(i%3!==1)drop.classList.add('is-dripping');
    faceSplash.appendChild(drop);
  }
  document.body.appendChild(faceSplash);
  const reactionBubble=document.createElement('div');
  reactionBubble.className='clam-reaction-bubble';reactionBubble.hidden=true;reactionBubble.setAttribute('role','status');
  $('stage').appendChild(reactionBubble);
  let bubbleUntil=0,maskFallSpeed=0,splashUntil=0,grimaceUntil=0;
  function sayReaction(message,duration){reactionBubble.textContent=message;bubbleUntil=environmentTime+duration;reactionBubble.hidden=false;}
  function sprayWater(){
    clam.updateMatrixWorld(true);
    const mouth=clam.localToWorld(new T.Vector3(0,.14,.003));
    sprayDrops.forEach((drop,i)=>{
      const a=i*2.399,spread=.06+.08*random();
      drop.mesh.visible=true;drop.mesh.position.copy(mouth);
      drop.velocity.set(Math.cos(a)*spread,.16+.15*random(),.12+.22*random());
      drop.mesh.scale.setScalar(.6+random()*.9);drop.life=0;
    });
    faceSplash.hidden=false;faceSplash.classList.remove('is-splashed');
    void faceSplash.offsetWidth;faceSplash.classList.add('is-splashed');
    splashUntil=environmentTime+2.7;
    sayReaction('푸악!',.9);
  }
  function updateSurprises(dt){
    for(const drop of sprayDrops){
      if(!drop.mesh.visible)continue;
      drop.life+=dt;drop.velocity.y-=.55*dt;
      drop.mesh.position.addScaledVector(drop.velocity,dt);
      if(drop.life>.95||drop.mesh.position.y<floorY)drop.mesh.visible=false;
    }
    if(pull.phase==='maskEscape'){
      maskFallSpeed-=.42*dt;
      falseMask.position.y=Math.max(floorY+.023,falseMask.position.y+maskFallSpeed*dt);
      falseMask.position.x+=.027*dt;
      const landed=falseMask.position.y<=floorY+.0231;
      falseMask.rotation.z+=(landed?Math.sin(pull.timer*27)*.025:dt*3.6);
      falseMask.rotation.y+=landed?0:dt*2.4;
      falseMask.rotation.x+=landed?0:dt*2.3;
      if(landed){
        falseMask.scale.y=activeClamType.length*.82*(1+.06*Math.sin(pull.timer*31));
        falseMask.scale.z=activeClamType.width*.86*(1-.04*Math.sin(pull.timer*31));
      }
      trueBody.position.y=T.MathUtils.damp(trueBody.position.y,floorY-.14,7,dt);
      trueBody.position.x=Math.sin(pull.timer*22)*.006;
    }
    if(panicFace.visible){
      const remaining=Math.max(0,grimaceUntil-environmentTime),strength=Math.min(1,remaining*2);
      const wobble=Math.sin(environmentTime*31);
      panicFace.rotation.z=wobble*.16*strength;panicFace.scale.set(1+wobble*.13*strength,1-wobble*.10*strength,1);
      // The whole shell bucks sideways and twists against the pull, while its face distorts.
      clam.rotation.z=Math.sin(environmentTime*27)*.18*strength;
      clam.rotation.x=Math.sin(environmentTime*34+.8)*.08*strength;
      clam.position.x+=Math.sin(environmentTime*26)*.006*strength;
    }
    if(!faceSplash.hidden&&environmentTime>=splashUntil){faceSplash.hidden=true;faceSplash.classList.remove('is-splashed');}
    reactionBubble.hidden=environmentTime>=bubbleUntil;
    if(!reactionBubble.hidden){
      const anchor=new T.Vector3(0,floorY+.27,0).project(camera);
      const bounds=renderer.domElement.getBoundingClientRect();
      reactionBubble.style.left=bounds.left+(anchor.x+1)*bounds.width/2+'px';
      reactionBubble.style.top=bounds.top+(1-anchor.y)*bounds.height/2+'px';
    }
  }
  function resetSurprises(){
    panicFace.visible=false;falseMask.visible=false;trueBody.visible=false;
    clam.rotation.x=0;clam.rotation.z=0;grimaceUntil=0;
    faceSplash.hidden=true;faceSplash.classList.remove('is-splashed');splashUntil=0;
    faceVariants.forEach((face,index)=>{face.visible=index===clamTypes.indexOf(activeClamType);});
    sprayDrops.forEach(drop=>{drop.mesh.visible=false;});
    reactionBubble.hidden=true;bubbleUntil=0;
  }
  let clamTop=.139;
  clam.rotation.y=-.20;
  // Small, quiet environmental clues: damp patches, grit and a few shell fragments.
  const damp=new T.MeshBasicMaterial({color:'#c8c69e',transparent:true,opacity:.28,depthWrite:false});
  for(let i=0;i<9;i++){const x=(random()-.5)*3,z=(random()-.5)*2.3;if(Math.hypot(x,z)<.30)continue;const patch=mesh(new T.CircleGeometry(.025+random()*.09,30),damp);patch.rotation.x=-Math.PI/2;patch.rotation.z=random()*6;patch.position.set(x,.001,z);patch.scale.y=.3+random()*.6;patch.castShadow=false;}
  const gritGeo=new T.IcosahedronGeometry(1,1),gritMat=mat('#caa477');
  const grit=new T.InstancedMesh(gritGeo,gritMat,90);grit.receiveShadow=true;
  const dummy=new T.Object3D();
  for(let i=0;i<90;i++){let x=(random()-.5)*3.5,z=(random()-.5)*3;if(Math.hypot(x,z)<.07)x+=.3;const s=.001+random()*.004;dummy.position.set(x,terrain(x,z).height+s*.3,z);dummy.rotation.set(random()*3,random()*6,random()*3);dummy.scale.set(s,s*.4,s*.8);dummy.updateMatrix();grit.setMatrixAt(i,dummy.matrix);}scene.add(grit);
  const shellChipMat=mat('#fae4c7');
  for(let i=0;i<8;i++){const x=(random()-.5)*1.8,z=(random()-.5)*1.3;if(Math.hypot(x,z)<.30)continue;const chip=outlined(new T.SphereGeometry(.012,10,6),shellChipMat);chip.scale.set(1,.18,.55);chip.rotation.y=random()*6;chip.position.set(x,.004,z);}
  // The same small container becomes the player's movable pouring tool.
  const salt=new T.Group();salt.position.set(-.32,.023,.11);salt.rotation.z=-Math.PI/2;salt.rotation.y=.3;scene.add(salt);
  outlined(new T.CylinderGeometry(.023,.023,.09,24),mat('#f4e6c8',.7),salt);
  const lid=outlined(new T.CylinderGeometry(.025,.025,.017,24),mat('#70aa96',.8),salt);lid.position.y=.053;
  const label=mesh(new T.CylinderGeometry(.0232,.0232,.032,24),mat('#fff4de'),salt);
  const ruler=new T.Group();ruler.position.set(-.07,.008,.24);scene.add(ruler);ruler.visible=false;
  const rulerMat=new T.LineBasicMaterial({color:'#f1e8c6'});
  const rulerPoints=[new T.Vector3(0,0,0),new T.Vector3(.1,0,0)];
  for(let i=0;i<=10;i++)rulerPoints.push(new T.Vector3(i*.01,0,-.003),new T.Vector3(i*.01,0,i%5===0?.009:.004));
  ruler.add(new T.LineSegments(new T.BufferGeometry().setFromPoints(rulerPoints),rulerMat));
  const playerHand=window.createSandboxHand({THREE:T,scene,camera,canvas:renderer.domElement,material:mat,terrain});
  const saltTool={held:false,pouring:false,pointer:null,aim:new T.Vector3(0,floorY,0),dose:0,landed:0,outside:0,emission:0,emitted:0,particles:[]};
  const saltRay=new T.Raycaster(),saltPointer=new T.Vector2(),saltHit=new T.Vector3();
  const saltMouth=new T.Vector3(0,.061,0),saltMouthWorld=new T.Vector3();
  const saltPlane=new T.Plane(new T.Vector3(0,1,0),-floorY);
  const saltGeo=new T.IcosahedronGeometry(1,0),saltMat=mat('#fff4d9');
  const settledSalt=new T.InstancedMesh(saltGeo,saltMat,700);settledSalt.count=0;settledSalt.frustumCulled=false;scene.add(settledSalt);
  const saltDummy=new T.Object3D(),fallingSalt=new T.Group();scene.add(fallingSalt);
  const reactionCue=new T.Group();scene.add(reactionCue);
  const cueMat=new T.MeshBasicMaterial({color:'#f8f1d5',transparent:true,opacity:.65,depthWrite:false});
  const cueRing=mesh(new T.RingGeometry(.038,.041,48),cueMat,reactionCue);cueRing.rotation.x=-Math.PI/2;cueRing.position.y=waterY+.019;cueRing.castShadow=false;cueRing.renderOrder=8;
  const cueBubbles=[];
  for(let i=0;i<5;i++){
    const bubble=mesh(new T.SphereGeometry(.0035+i%2*.001,10,8),cueMat,reactionCue);
    bubble.castShadow=false;bubble.renderOrder=8;cueBubbles.push(bubble);
  }
  function updateReactionCue(){
    const active=['waiting','rising','retreating','pause','exposed'].includes(behavior.phase);
    reactionCue.visible=active;
    if(!active)return;
    const t=environmentTime;
    cueRing.scale.setScalar(.85+.17*Math.sin(t*7));
    cueMat.opacity=.68;
    cueBubbles.forEach((bubble,i)=>{
      const a=i*2.4+t*.6,r=.017+.007*Math.sin(t*2+i);
      bubble.position.set(Math.cos(a)*r,waterY+.020+.007*(.5+.5*Math.sin(t*5+i*1.7)),Math.sin(a)*r*.75);
      bubble.scale.setScalar(.65+.35*(.5+.5*Math.sin(t*6+i)));
    });
  }
  const bottleRest=new T.Vector3(-.32,.023,.11);
  function clearSalt(){
    saltTool.particles.forEach(p=>fallingSalt.remove(p.mesh));
    saltTool.particles.length=0;
    saltTool.dose=0;saltTool.landed=0;saltTool.outside=0;
    saltTool.emission=0;settledSalt.count=0;
    updateSaltText();
  }
  function updateSaltText(){
    $('salt-state').textContent=`구멍에 소금 ${saltTool.dose} / 12 · 주변 소금 ${saltTool.outside}알`;
    $('salt-tool').textContent=saltTool.held?'소금통 내려놓기':'소금통 들기';
    $('salt-tool').setAttribute('aria-pressed',String(saltTool.held));
  }
  function equipSalt(on){
    saltTool.held=on;saltTool.pouring=false;saltTool.pointer=null;
    playerHand.setToolMode(on);
    if(!on){salt.position.copy(bottleRest);salt.rotation.set(0,.3,-Math.PI/2);}
    updateSaltText();
  }
  $('salt-tool').addEventListener('click',()=>{if(pull.phase!=='ready')return;equipSalt(!saltTool.held);});
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(saltTool.held||pull.phase!=='ready'||e.button!==0)return;
    const rect=renderer.domElement.getBoundingClientRect(),screen=salt.position.clone().project(camera);
    const x=rect.left+(screen.x+1)*rect.width/2,y=rect.top+(1-screen.y)*rect.height/2;
    if(Math.hypot(e.clientX-x,e.clientY-y)>42)return;
    e.preventDefault();e.stopImmediatePropagation();equipSalt(true);
    grab.message='소금통을 집었습니다. 구멍 위에서 누른 채 뿌려 주세요.';
  });
  function aimSalt(e){
    const rect=renderer.domElement.getBoundingClientRect();
    saltPointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    saltRay.setFromCamera(saltPointer,camera);
    if(saltRay.ray.intersectPlane(saltPlane,saltHit))saltTool.aim.set(T.MathUtils.clamp(saltHit.x,-.3,.34),floorY,T.MathUtils.clamp(saltHit.z,-.23,.38));
  }
  renderer.domElement.addEventListener('pointermove',e=>{if(saltTool.held)aimSalt(e);});
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(!saltTool.held||e.button!==0)return;
    e.preventDefault();aimSalt(e);saltTool.pouring=true;saltTool.pointer=e.pointerId;renderer.domElement.setPointerCapture(e.pointerId);
  });
  function stopPour(e){if(saltTool.pointer===null||e&&e.pointerId!==saltTool.pointer)return;saltTool.pouring=false;saltTool.pointer=null;}
  renderer.domElement.addEventListener('pointerup',stopPour);renderer.domElement.addEventListener('pointercancel',stopPour);
  addEventListener('blur',()=>stopPour());
  function emitSalt(){
    if(saltTool.emitted++%5===0)sound.play('salt',.6);
    const angle=random()*Math.PI*2,radius=Math.sqrt(random())*.006;
    const x=saltTool.aim.x+Math.cos(angle)*radius,z=saltTool.aim.z+Math.sin(angle)*radius;
    const dot=mesh(saltGeo,saltMat,fallingSalt);dot.castShadow=false;
    const size=.0016+random()*.0013;dot.scale.setScalar(size);
    salt.localToWorld(saltMouthWorld.copy(saltMouth));
    dot.position.set(x,saltMouthWorld.y,z);
    saltTool.particles.push({mesh:dot,x,z,vy:-.045,size});
  }
  function updateSalt(dt){
    if(saltTool.held){
      salt.rotation.z=T.MathUtils.damp(salt.rotation.z,saltTool.pouring?-1.05:0,13,dt);
      salt.rotation.x=T.MathUtils.damp(salt.rotation.x,saltTool.pouring?.45:0,13,dt);
      saltMouthWorld.copy(saltMouth).applyQuaternion(salt.quaternion);
      salt.position.set(saltTool.aim.x-saltMouthWorld.x,floorY+.12-saltMouthWorld.y,saltTool.aim.z-saltMouthWorld.z);
      if(saltTool.pouring){saltTool.emission+=dt*24;while(saltTool.emission>=1){emitSalt();saltTool.emission--;}}
    }
    for(let i=saltTool.particles.length-1;i>=0;i--){
      const p=saltTool.particles[i];p.vy-=.7*dt;
      p.mesh.position.y+=p.vy*dt;
      const a=Math.atan2(p.z,p.x),inside=Math.hypot(p.x,p.z)<holeRadius(a)*.82;
      const ground=inside?floorY-.006:terrain(p.x,p.z).height+.002;
      if(p.mesh.position.y>ground)continue;
      fallingSalt.remove(p.mesh);saltTool.particles.splice(i,1);
      if(settledSalt.count<700){
        saltDummy.position.set(p.x,ground,p.z);saltDummy.rotation.set(random()*3,random()*6,random()*3);
        saltDummy.scale.set(p.size,p.size*.6,p.size);saltDummy.updateMatrix();settledSalt.setMatrixAt(settledSalt.count++,saltDummy.matrix);settledSalt.instanceMatrix.needsUpdate=true;
      }
      saltTool.landed++;
      if(inside){saltTool.dose=Math.min(12,saltTool.dose+1);if(saltTool.dose>=12&&['idle','manual'].includes(behavior.phase)){equipSalt(false);startReaction();}}
      else saltTool.outside++;
      updateSaltText();
    }
  }
  // Sphere/triangle contact uses the actual closed shell surface, not a click ray.
  const grab={active:false,ready:false,contacts:0,thumbContact:false,count:0,aimTime:0,aimProgress:0,alignment:1,error:0,tolerance:0,message:'소금을 뿌리고, 맛조개 몸통이 보이면 직접 클릭해 주세요.'};
  const pull={phase:'ready',lift:0,velocity:0,baseY:0,required:.18,time:0,timer:0,resistance:1.2,mass:150,eventTriggered:false,maskEscaped:false,tension:0,mudClock:0,soundClock:0,yielded:false,slipTime:0,slipped:false,successes:0,failures:0,streak:0,bestStreak:0};
  const difficulties={
    practice:{window:1.2,variation:.7,rise:.8,retreat:.3,chances:3,feints:0,distance:.075,notice:.16,grace:.65,grabBand:.64,hold:.07,lockRadius:30,snapRadius:46,snap:.72,track:38,slip:.75,wobble:3},
    normal:{window:.65,variation:.25,rise:.55,retreat:.19,chances:2,feints:1,distance:.085,notice:.12,grace:.5,grabBand:.44,hold:.13,lockRadius:21,snapRadius:32,snap:.43,track:26,slip:.48,wobble:6},
    challenge:{window:.36,variation:.20,rise:.39,retreat:.13,chances:2,feints:2,distance:.09,notice:.09,grace:.4,grabBand:.28,hold:.20,lockRadius:15,snapRadius:22,snap:.22,track:18,slip:.34,wobble:10}
  };
  const clamTypes=[
    {id:'small',name:'꼬마',length:0.43,width:0.52,strength:.78,caution:.80,response:.78,rise:.88,window:1.22,retreat:1.05,feints:0,tint:'#fff4df',band:'#dba96c',temper:'겁은 적지만 재빠름',feel:'작고 가볍게 빠짐'},
    {id:'curious',name:'호기심쟁이',length:0.81,width:0.79,strength:.90,caution:.76,response:.68,rise:.92,window:1.35,retreat:1.10,feints:0,tint:'#f0afb4',band:'#bd7887',temper:'소금에 빨리 반응함',feel:'가늘고 비교적 쉬움'},
    {id:'plump',name:'통통이',length:0.87,width:1.16,strength:1.22,caution:.92,response:1.17,rise:1.16,window:1.25,retreat:1.12,feints:0,tint:'#efb874',band:'#b77945',temper:'느긋하게 올라옴',feel:'짧지만 묵직함'},
    {id:'nervous',name:'긴장쟁이',length:1.13,width:0.73,strength:1.04,caution:1.15,response:1.08,rise:1.04,window:.88,retreat:.84,feints:1,tint:'#a9c6b9',band:'#779e93',temper:'자주 멈칫하고 경계함',feel:'길고 가늘어 민감함'},
    {id:'giant',name:'왕맛조개',length:1.34,width:1.30,strength:1.40,caution:1.10,response:1.32,rise:1.22,window:1.02,retreat:.95,feints:1,tint:'#986950',band:'#795747',temper:'천천히 나오지만 신중함',feel:'크고 힘이 셈'},
    {id:'golden',name:'황금이',length:1.02,width:0.93,strength:1.16,caution:1.30,response:1.35,rise:1.10,window:.78,retreat:.82,feints:2,tint:'#ffd73e',band:'#db8a15',temper:'조심스럽고 귀함',feel:'빛나지만 쉽게 잡히지 않음'},
    {id:'scarlet',name:'빨간번개',length:1.12,width:0.84,strength:1.23,caution:.92,response:.86,rise:.80,window:.85,retreat:.72,feints:1,tint:'#ed514f',band:'#ad292e',temper:'성급하게 튀어나옴',feel:'빠르게 움츠러들고 힘이 셈'},
    {id:'blue',name:'파도',length:1.01,width:1.06,strength:1.08,caution:.86,response:1.05,rise:1.0,window:1.20,retreat:1.10,feints:0,tint:'#4c9fe4',band:'#2469b4',temper:'차분히 움직임',feel:'넓게 드러나 잡기 편함'},
    {id:'violet',name:'보라꿈',length:0.62,width:0.70,strength:.85,caution:1.25,response:1.22,rise:1.0,window:.85,retreat:.85,feints:2,tint:'#b17ce0',band:'#754fa4',temper:'수줍어하며 망설임',feel:'작지만 쉽게 놀람'},
    {id:'teal',name:'청록이',length:1.19,width:0.95,strength:1.12,caution:.72,response:.74,rise:.85,window:1.15,retreat:1.0,feints:0,tint:'#41c7b6',band:'#168b82',temper:'대담하게 고개를 내밈',feel:'긴 몸통이 오래 보임'},
    {id:'rainbow',name:'무지개',length:1.06,width:1.04,strength:1.15,caution:1.03,response:1.0,rise:1.0,window:1.12,retreat:1.0,feints:1,tint:'#ffffff',band:'#f8eedf',rainbow:true,temper:'톡톡 튀며 고개를 내밈',feel:'알록달록하고 적당히 힘이 셈'}
  ];
  let activeClamType=clamTypes[0],foundClamType=0,foundWeightFactor=1,activeWeightGrams=150,foundPullEvent='none',activePullEvent='none';
  const riseLevels=[8,10,12.5,14.5,16.5]; // Lv3 is about 30% above the former 9.5 cm rise.
  const catchHeight=()=>Math.max(2,5*activeClamType.length);
  const behavior={phase:'idle',mode:'auto',difficulty:'challenge',timer:0,index:0,from:-6,delay:1,plan:[],level:null,nearTime:0,retreatFrom:0,escapes:0,attempt:0,reactionDistance:.09};
  const behaviorLabels={idle:'반응 대기',waiting:'소금에 반응하는 중',rising:'조금씩 올라오는 중',pause:'멈칫…',exposed:'몸통이 드러났어요',alert:'놀라서 움츠러듭니다',escaping:'구멍으로 도주',caught:'잡힘',maskEscape:'몸 끝을 끊고 탈출 중',manual:'수동 높이 테스트'};
  function applyClamType(index, preview=false){
    const kind=clamTypes[index]||clamTypes[0];
    activeClamType=kind;
    activeWeightGrams=Math.round(145*kind.length*kind.width*kind.width*(preview?1:foundWeightFactor));
    clam.scale.set(kind.width,kind.length,kind.width*.96);
    clamTop=.139*kind.length;
    shellMat.color.set(kind.tint);
    shellGeo.attributes.color.array.set(kind.rainbow?rainbowShellColors:shellColors);
    shellGeo.attributes.color.needsUpdate=true;
    bandMat.color.set(kind.band);
    faceVariants.forEach((face,faceIndex)=>{face.visible=faceIndex===index;});
    panicFace.visible=false;
    const chosenEvent=$('pull-event-preview').value;
    activePullEvent=chosenEvent==='actual'?(preview?'none':foundPullEvent):chosenEvent;
    behavior.reactionDistance=difficulties[behavior.difficulty].distance*kind.caution;
    $('reaction-distance').value=behavior.reactionDistance*100;
    $('reaction-distance-value').textContent=(behavior.reactionDistance*100).toFixed(1)+' cm';
    $('clam-preview').value=preview?String(index):'actual';
    $('clam-kind').textContent=preview?'미리보기 · '+kind.name+' · '+kind.temper+' · '+kind.feel:'맛조개 종류 · 소금을 뿌려 확인';
    setClamHeight(preview?14*kind.length:-7);
  }
  $('clam-preview').addEventListener('change',e=>{releaseGrab();equipSalt(false);clearSalt();stopBehavior();if(e.target.value==='actual')applyClamType(foundClamType);else applyClamType(Number(e.target.value),true);});
  $('pull-event-preview').addEventListener('change',()=>{releaseGrab();equipSalt(false);clearSalt();stopBehavior();setClamHeight(-7);activePullEvent=$('pull-event-preview').value==='actual'?($('clam-preview').value==='actual'?foundPullEvent:'none'):$('pull-event-preview').value;grab.message='반응을 골랐어요. 소금을 뿌려 다시 시작하세요.';});
  function setClamHeight(height){
    state.height=height;clam.visible=height>-6;clam.position.set(0,floorY+height/100-clamTop,0);updateHeightUI();
  }
  function startReaction(){
    if(!['idle','manual'].includes(behavior.phase)||pull.phase!=='ready')return;
    releaseGrab();equipSalt(false);playerHand.reset();
    Object.assign(behavior,{phase:'waiting',mode:'auto',timer:0,index:0,level:null,nearTime:0,warnings:0,cooldown:0,delay:(.5+random()*1.5)*activeClamType.response,from:-6,attempt:behavior.attempt+1});
    const tuning=difficulties[behavior.difficulty],kind=activeClamType;
    $('clam-kind').textContent=kind.name+' · '+kind.temper+' · '+kind.feel;
    behavior.plan=[
      // A clear first peek confirms the salt worked, but remains too low to grab.
      {height:4.5,duration:.38+random()*.18,pause:.20+random()*.15},
      {height:-3-random(),duration:.22+random()*.15,pause:.35+random()*.4},
      {height:(1.5+random())*kind.length,duration:.6+random()*.4,pause:.3+random()*.5},
      {height:-1.5-random(),duration:tuning.retreat*kind.retreat,pause:.3+random()*.3}
    ];
    // Shuffle readable shallow feints among real opportunities; never a hidden
    // success roll. The same physical shell and finger contact rules still apply.
    const beats=Array(tuning.chances).fill(true).concat(Array(tuning.feints+kind.feints+(random()<.5?1:0)).fill(false));
    for(let i=beats.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[beats[i],beats[j]]=[beats[j],beats[i]];}
    beats.forEach((real,i)=>{
      const level=real?1+Math.floor(random()*riseLevels.length):null;
      behavior.plan.push({height:real?riseLevels[level-1]*kind.length:(3.2+random()*1.2)*kind.length,level,duration:tuning.rise*kind.rise+random()*.16,pause:real?tuning.window*kind.window+random()*tuning.variation:.12+random()*.14});
      if(i<beats.length-1)behavior.plan.push({height:-1-random()*2.5,duration:tuning.retreat*kind.retreat+random()*.06,pause:.25+random()*.55});
    });
    setClamHeight(-6);grab.message='소금에 반응했어요. 몸통이 올라오기를 기다리세요.';
  }
  function scare(reason){
    behavior.phase='alert';behavior.timer=0;behavior.retreatFrom=state.height;behavior.escapes++;pull.streak=0;
    clearSalt();grab.message=reason;sound.play('escape',.6);kickCamera(.004);emitMud(5,.4);
  }
  function stopBehavior(){behavior.phase='manual';behavior.mode='manual';behavior.timer=0;behavior.nearTime=0;}
  function updateBehavior(dt){
    const b=behavior;
    b.timer+=dt;b.cooldown=Math.max(0,(b.cooldown||0)-dt);
    const close=playerHand.getState().held&&playerHand.probes().some(p=>Math.hypot(p.center.x,p.center.z)<b.reactionDistance&&p.center.y<floorY+.15);
    if(b.phase==='waiting'&&b.timer>=b.delay){b.phase='rising';b.timer=0;b.from=-6;}
    if(['rising','retreating'].includes(b.phase)){
      const step=b.plan[b.index],t=Math.min(1,b.timer/step.duration);
      b.level=step.level||null;
      setClamHeight(T.MathUtils.lerp(b.from,step.height,t*t*(3-2*t)));
      if(t>=1){b.phase=b.index===b.plan.length-1?'exposed':'pause';b.timer=0;if(state.height>=catchHeight())grab.message='몸통이 올라왔어요. 옆에서 감싸 쥐고 위로 당겨 보세요.';}
    }else if(b.phase==='pause'&&b.timer>=b.plan[b.index].pause){b.from=state.height;b.index++;b.phase=b.plan[b.index].height<b.from?'retreating':'rising';b.timer=0;}
    else if(b.phase==='warning'){
      setClamHeight(T.MathUtils.lerp(b.retreatFrom,-3,Math.min(1,b.timer/.25)));
      if(b.timer>difficulties[b.difficulty].grace/activeClamType.caution){
        if(close||b.warnings>=2)scare('계속 가까이 있어 완전히 도망갔어요.');
        else{b.from=state.height;b.phase='rising';b.timer=0;b.cooldown=.7;grab.message='커서를 물리니 다시 나옵니다. 움직임을 지켜보세요.';}
      }
    }
    else if(b.phase==='exposed'&&b.timer>=b.plan[b.index].pause)scare('기회를 놓쳤어요. 맛조개가 다시 들어갑니다.');
    else if(b.phase==='alert'){
      setClamHeight(b.retreatFrom-Math.min(1,b.timer/.2)*1.1);
      if(b.timer>.25){b.phase='escaping';b.timer=0;b.retreatFrom=state.height;}
    }else if(b.phase==='escaping'){
      setClamHeight(T.MathUtils.lerp(b.retreatFrom,-7,Math.min(1,b.timer/.45)));
      if(b.timer>1.0){b.phase='idle';b.level=null;clearSalt();setClamHeight(-7);grab.message='다시 준비됐어요. 소금을 다시 뿌려 보세요.';if(searchEnabled) search.start('맛조개가 숨어 버렸어요. 근처의 다른 구멍을 찾아보세요.', {outcome:'escaped'});}
    }
    // Waiting underground is safe. Only a shallow, emerging clam is wary.
    if(['rising','pause'].includes(b.phase)&&state.height>=-1.2&&state.height<5){
      b.nearTime=close?b.nearTime+dt:0;
      if(b.nearTime>difficulties[b.difficulty].notice/activeClamType.caution&&!b.cooldown){b.phase='warning';b.timer=0;b.retreatFrom=state.height;b.warnings=(b.warnings||0)+1;grab.message='움츠러들었어요. 커서를 잠깐 물려 주세요.';}
    }else b.nearTime=0;
    $('behavior-state').textContent=(b.level&&['rising','pause','exposed'].includes(b.phase)?`Lv${b.level} · `:'')+(b.phase==='retreating'?'쏙 들어갔다가…':b.phase==='warning'?'경계 · 커서를 물려 주세요':b.phase==='exposed'&&state.height<5?'살짝 내다보는 중':b.phase==='pause'&&state.height>=5?'잠깐 몸통이 드러났어요':behaviorLabels[b.phase]);
    $('start-reaction').disabled=!['idle','manual'].includes(b.phase)||pull.phase!=='ready';
    $('salt-tool').disabled=pull.phase!=='ready';
  }
  $('start-reaction').addEventListener('click',startReaction);
  $('difficulty').addEventListener('change',e=>{
    releaseGrab();playerHand.reset();Object.assign(behavior,{difficulty:e.target.value,phase:'idle',mode:'auto',timer:0,nearTime:0});
    saltTool.dose=0;updateSaltText();
    behavior.reactionDistance=difficulties[behavior.difficulty].distance*activeClamType.caution;
    $('reaction-distance').value=behavior.reactionDistance*100;$('reaction-distance-value').textContent=(behavior.reactionDistance*100)+' cm';
    setClamHeight(-7);grab.message='난이도를 바꿨어요. 소금을 뿌려 주세요.';
  });
  $('reaction-distance').addEventListener('input',e=>{behavior.reactionDistance=Number(e.target.value)/100;$('reaction-distance-value').textContent=e.target.value+' cm';});
  const mudBits=[];
  for(let i=0;i<56;i++){
    const size=.0025+random()*.0035;
    const bit=mesh(new T.IcosahedronGeometry(size,0),mat(i%3===0?'#a77d5c':'#b78c62'));
    bit.visible=false;bit.castShadow=false;mudBits.push({mesh:bit,v:new T.Vector3(),life:0});
  }
  const mudStretchMat=new T.MeshBasicMaterial({color:'#8e6755',transparent:true,opacity:.5,depthWrite:false,side:T.DoubleSide});
  const mudStretch=mesh(new T.RingGeometry(.030,.038,40),mudStretchMat);
  mudStretch.rotation.x=-Math.PI/2;mudStretch.position.y=floorY+.003;mudStretch.castShadow=false;mudStretch.visible=false;
  function emitMud(count,power=1){
    for(let i=0;i<count;i++){
      const bit=mudBits.find(b=>!b.mesh.visible);if(!bit)break;
      const a=random()*Math.PI*2;
      bit.mesh.visible=true;bit.mesh.position.set(Math.cos(a)*.034,floorY+.005,Math.sin(a)*.027);
      bit.v.set(Math.cos(a)*(.035+random()*.085)*power,(.075+random()*.16)*power,Math.sin(a)*(.035+random()*.085)*power);
      bit.life=0;
    }
  }
  function updateMud(dt){
    mudBits.forEach(bit=>{
      if(!bit.mesh.visible)return;
      bit.life+=dt;bit.v.y-=.68*dt;bit.mesh.position.addScaledVector(bit.v,dt);
      bit.mesh.rotation.x+=dt*8;
      if(bit.life>.75||bit.mesh.position.y<terrain(bit.mesh.position.x,bit.mesh.position.z).height)bit.mesh.visible=false;
    });
  }
  function trialAgain(){const caught=pull.phase==='success',maskEscaped=pull.maskEscaped;releaseGrab();clearSalt();behavior.phase='idle';behavior.mode='auto';behavior.level=null;state.height=-7;update();if(searchEnabled) search.start(caught?activeClamType.name+' '+activeWeightGrams+'g 채집 성공! 바구니에 담았어요. 주변의 다른 구멍을 찾아보세요.':maskEscaped?'끊어진 몸 끝만 남기고 맛조개가 도망갔어요. 다른 구멍을 찾아보세요.':'맛조개를 놓쳤어요. 주변의 다른 구멍을 찾아보세요.', {outcome:caught?'caught':'escaped',weight:caught?activeWeightGrams:0,clam:caught?{id:activeClamType.id,name:activeClamType.name,color:activeClamType.tint,rainbow:!!activeClamType.rainbow,length:activeClamType.length,width:activeClamType.width}:null});grab.message=pull.streak>0?`연속 ${pull.streak}마리! 한 마리만 더 잡아 볼까요?`:behavior.mode==='auto'?'다시 준비됐어요. 소금을 뿌려 주세요.':'다시 준비됐어요. 옆에서 잡고 위로 당겨 보세요.';}
  function triggerPullSurprise(){
    pull.eventTriggered=true;
    if(activePullEvent==='spray'){
      sprayWater();grab.message='푸악! 화면을 향해 물을 뿜었습니다. 잠깐 눈을 깜빡여도 계속 당길 수 있어요.';
      kickCamera(.004);sound.play('salt',.8);
    }else if(activePullEvent==='grimace'){
      faceVariants.forEach(face=>{face.visible=false;});panicFace.visible=true;grimaceUntil=environmentTime+1.4;
      sayReaction('으아 싫어!!!',1.3);
      grab.message='으아 싫어!!! 맛조개 얼굴이 일그러졌어요. 계속 당겨 보세요.';
      kickCamera(.004);
    }else if(activePullEvent==='mask'){
      clam.updateMatrixWorld(true);
      maskMat.color.set(activeClamType.rainbow?'#e9b483':activeClamType.tint).lerp(new T.Color('#e9a883'),.42);
      maskBackMat.color.copy(maskMat.color).multiplyScalar(.52);
      maskEdgeMat.color.copy(maskMat.color).lerp(new T.Color('#ffd2ad'),.58);
      falseMask.scale.set(activeClamType.width*.86,activeClamType.length*.82,activeClamType.width*.86);
      falseMask.position.copy(clam.localToWorld(new T.Vector3(0,.116,.024)));
      falseMask.rotation.set(0,clam.rotation.y,0);falseMask.visible=true;maskFallSpeed=.035;
      trueBody.scale.set(activeClamType.width,activeClamType.length,activeClamType.width);
      trueBody.position.copy(clam.position);trueBody.position.y+=.025;trueBody.position.z=-.012;trueBody.visible=true;
      clam.visible=false;playerHand.release();grab.active=false;
      pull.phase='maskEscape';pull.timer=0;pull.maskEscaped=true;pull.streak=0;pull.tension=0;
      behavior.phase='maskEscape';behavior.escapes++;
      mudStretch.visible=false;clearSalt();
      sayReaction('몸을 끊고 도망갔어?!',1.25);
      grab.message='툭! 잡힌 몸 끝만 끊어 내고 맛조개는 구멍으로 도망갔어요.';
      sound.play('escape');kickCamera(.012);emitMud(9,.7);
    }
  }
  function updatePull(dt){
    const h=playerHand.getState();
    if(pull.phase==='pulling'&&h.grabbed){
      pull.time+=dt;
      const tuning=difficulties[behavior.difficulty],tracking=trackingState();
      grab.alignment=tracking.score;grab.error=tracking.error;grab.tolerance=tracking.tolerance;
      const severe=tracking.error>tracking.tolerance*1.55;
      pull.slipTime=pull.time<.18?0:severe?pull.slipTime+dt:Math.max(0,pull.slipTime-dt*(tracking.aligned?3:.65));
      if(pull.slipTime>tuning.slip&&!pull.slipped){
        pull.slipped=true;playerHand.release();grab.message='중앙에서 벗어나 손이 미끄러졌어요!';
      }
      // Mud grips the buried end first, then yields once the shell is partway out.
      // Pull demand still comes only from upward pointer movement.
      const progress=Math.min(1,pull.lift/pull.required);
      pull.tension=Math.max(0,h.pullDemand-pull.lift)*18;
      const grip=progress<.25?1.55:progress<.65?1.23:.78;
      const resistance=pull.resistance*activeClamType.strength*grip*(1+.10*Math.sin(pull.time*18));
      const massRatio=T.MathUtils.clamp(pull.mass/150,.25,2.8);
      const targetSpeed=T.MathUtils.clamp((pull.tension-resistance)*.16,-.045,.18/Math.sqrt(massRatio));
      // Mass affects both acceleration and maximum ascent speed, beyond the type's strength.
      pull.velocity=T.MathUtils.damp(pull.velocity,targetSpeed,10/massRatio,dt);
      pull.lift=Math.max(0,pull.lift+pull.velocity*dt);
      const tremble=Math.sin(pull.time*25)*.0015*Math.min(1,pull.tension/4);
      clam.position.set(tremble,pull.baseY+pull.lift,0);playerHand.setPullOffset(tremble,pull.lift,0);
      mudStretch.visible=true;mudStretch.scale.setScalar(1+Math.min(.17,pull.tension*.018));mudStretchMat.opacity=.35+.25*Math.min(1,pull.tension/5);
      if(progress>.28&&!pull.yielded){pull.yielded=true;emitMud(7,.55);kickCamera(.004);sound.play('strain',.9);}
      if(!pull.eventTriggered&&pull.lift/pull.required>.30)triggerPullSurprise();
      if(pull.phase==='maskEscape'){updateMud(dt);return;}
      pull.mudClock+=dt;pull.soundClock+=dt;
      if(pull.tension>1.5&&Math.abs(pull.velocity)>.018&&pull.mudClock>.18){emitMud(2,.45);pull.mudClock=0;}
      if(pull.tension>2&&pull.soundClock>.30){sound.play('strain',Math.min(1,pull.tension/5));pull.soundClock=0;}
      if(pull.lift>=pull.required){
        pull.phase='success';pull.timer=0;pull.successes++;pull.streak++;pull.bestStreak=Math.max(pull.bestStreak,pull.streak);clearSalt();
        pull.tension=0;mudStretch.visible=false;grab.message=`툭! ${activeWeightGrams}g ${activeClamType.name} 채집 성공 · 연속 ${pull.streak}마리!`;
        emitMud(28,1.2);kickCamera(.018);sound.play('success');
      }
    }else if(pull.phase==='success'){
      pull.timer+=dt;
      // Resistance vanishes: a small, shared release motion of hand and shell.
      pull.lift=T.MathUtils.damp(pull.lift,pull.required+.022,13,dt);
      clam.position.set(0,pull.baseY+pull.lift,0);playerHand.setPullOffset(0,pull.lift,0);
      if(pull.timer>1.6||(!h.held&&pull.timer>.45))trialAgain();
    }else if(pull.phase==='escaping'){
      pull.timer+=dt;clam.position.y=T.MathUtils.damp(clam.position.y,floorY-clamTop-.075,12,dt);clam.position.x=0;
      if(pull.timer>1.1)trialAgain();
    }else if(pull.phase==='maskEscape'){
      pull.timer+=dt;if(pull.timer>1.5)trialAgain();
    }
    updateMud(dt);
    $('pull-result').textContent=`채집 ${pull.successes} · 연속 ${pull.streak} · 놓침 ${pull.failures} · 도주 ${behavior.escapes}`;
    const weightFeel=pull.mass<110?'가볍게 올라와요':pull.mass>220?'묵직하게 올라와요':'서서히 올라와요';
    $('pull-feel').textContent=pull.phase==='pulling'?weightFeel+' · 중앙 '+Math.round(grab.alignment*100)+'% · '+(pull.yielded?'진흙이 풀립니다':'계속 위로 당기세요'):pull.phase==='success'?activeWeightGrams+'g · 툭! 진흙이 터지며 빠져나왔어요':pull.phase==='escaping'?(pull.slipped?'중앙에서 벗어나 손이 미끄러졌어요':'손을 놓쳐 구멍으로 들어갔어요'):pull.phase==='maskEscape'?'끊어진 몸 끝이 꿈틀거리고 본체는 도망갔어요':'잡은 뒤 위로 당기면 진흙의 저항이 느껴집니다.';
  }
  const triangle=new T.Triangle(),closest=new T.Vector3(),localPoint=new T.Vector3();
  const colliderPositions=shellGeo.attributes.position,colliderIndex=shellGeo.index;
  const contactGroup=new T.Group();scene.add(contactGroup);contactGroup.visible=false;
  const probeVisuals=Array.from({length:4},()=>{const m=new T.Mesh(new T.SphereGeometry(1,12,8),new T.MeshBasicMaterial({color:'#efb35c',wireframe:true,depthTest:false,transparent:true,opacity:.65}));contactGroup.add(m);return m;});
  function shellContact(probe){
    if(!clam.visible||state.height<catchHeight()||['waiting','warning','retreating','alert','escaping','idle'].includes(behavior.phase)||probe.center.y+probe.radius<floorY+.007)return false;
    if(Math.hypot(probe.center.x,probe.center.z)>.055)return false;
    localPoint.copy(probe.center);shell.worldToLocal(localPoint);
    let best=Infinity;
    for(let i=0;i<colliderIndex.count;i+=3){
      triangle.a.fromBufferAttribute(colliderPositions,colliderIndex.getX(i));
      triangle.b.fromBufferAttribute(colliderPositions,colliderIndex.getX(i+1));
      triangle.c.fromBufferAttribute(colliderPositions,colliderIndex.getX(i+2));
      triangle.closestPointToPoint(localPoint,closest);
      // Ignore the buried shell: only genuinely exposed material may be held.
      if(closest.y*clam.scale.y+clam.position.y<floorY+.005)continue;
      best=Math.min(best,closest.distanceToSquared(localPoint));
    }
    return best<=(probe.radius+.003)**2;
  }
  const grabRay=new T.Raycaster(),grabPointer=new T.Vector2();
  const catchCursor=document.createElement('div');
  catchCursor.id='catch-cursor';catchCursor.hidden=true;catchCursor.setAttribute('aria-hidden','true');$('stage').appendChild(catchCursor);
  let cursorInside=false,cursorX=0,cursorY=0,lastAimAt=performance.now();
  renderer.domElement.addEventListener('pointermove',e=>{
    if(e.pointerType!=='mouse')return;
    cursorInside=true;cursorX=e.clientX;cursorY=e.clientY;
    catchCursor.style.left=cursorX+'px';catchCursor.style.top=cursorY+'px';
  });
  renderer.domElement.addEventListener('pointerleave',()=>{if(!grab.active){cursorInside=false;catchCursor.hidden=true;}});
  function grabTargetScreen(withFeint=true){
    const rect=renderer.domElement.getBoundingClientRect(),tuning=difficulties[behavior.difficulty];
    const massFactor=T.MathUtils.clamp(Math.sqrt(activeWeightGrams/150),.72,1.35);
    const wobble=tuning.wobble*activeClamType.caution*massFactor;
    const point=new T.Vector3(clam.position.x,floorY+Math.max(.012,state.height/100*.52),.018).project(camera);
    return {x:rect.left+(point.x+1)*rect.width/2+(withFeint?Math.sin(environmentTime*8.7)*wobble:0),y:rect.top+(1-point.y)*rect.height/2,wobble};
  }
  function assistedCursor(x,y){
    const tuning=difficulties[behavior.difficulty],target=grabTargetScreen(),distance=Math.hypot(x-target.x,y-target.y);
    const influence=1-T.MathUtils.smoothstep(distance,tuning.snapRadius*.35,tuning.snapRadius),strength=tuning.snap*influence;
    return {x:T.MathUtils.lerp(x,target.x,strength),y:T.MathUtils.lerp(y,target.y,strength),target,distance};
  }
  function rawCatchHit(x,y){
    if(saltTool.held||pull.phase!=='ready'||state.height<catchHeight()||!['manual','rising','pause','exposed'].includes(behavior.phase))return null;
    const rect=renderer.domElement.getBoundingClientRect();
    grabPointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);
    grabRay.setFromCamera(grabPointer,camera);clam.updateMatrixWorld(true);
    const visibleHeight=state.height/100,band=difficulties[behavior.difficulty].grabBand,low=.5-band/2,high=.5+band/2;
    return grabRay.intersectObject(shell,false).find(contact=>{
      const fromFloor=contact.point.y-floorY;
      return fromFloor>=visibleHeight*low&&fromFloor<=visibleHeight*high;
    })||null;
  }
  function catchHit(x,y){const assisted=assistedCursor(x,y);return rawCatchHit(assisted.x,assisted.y);}
  function trackingState(){
    const tuning=difficulties[behavior.difficulty],target=grabTargetScreen(false);
    const massFactor=T.MathUtils.clamp(Math.sqrt(Math.max(35,pull.mass||activeWeightGrams)/150),.72,1.35);
    const tolerance=tuning.track/massFactor,error=Math.abs(cursorX-target.x);
    return {target,tolerance,error,aligned:error<=tolerance,score:Math.max(0,1-error/(tolerance*1.8))};
  }
  function updateCatchCursor(){
    catchCursor.hidden=!cursorInside;
    if(!cursorInside)return;
    const now=performance.now(),dt=Math.min(.1,(now-lastAimAt)/1000);lastAimAt=now;
    const assisted=assistedCursor(cursorX,cursorY),tuning=difficulties[behavior.difficulty];
    const effectiveDistance=Math.hypot(assisted.x-assisted.target.x,assisted.y-assisted.target.y);
    const available=!grab.active&&!saltTool.held&&pull.phase==='ready'&&state.height>=catchHeight()&&['manual','rising','pause','exposed'].includes(behavior.phase);
    const aimable=available&&effectiveDistance<=tuning.lockRadius;
    if(aimable)grab.aimTime+=dt;else grab.aimTime=Math.max(0,grab.aimTime-dt*1.6);
    grab.aimProgress=Math.min(1,grab.aimTime/tuning.hold);
    const ready=aimable&&grab.aimProgress>=1,near=available&&!ready&&assisted.distance<tuning.snapRadius*1.9;
    grab.ready=ready;
    const tracking=grab.active?trackingState():null;
    if(tracking){grab.alignment=tracking.score;grab.error=tracking.error;grab.tolerance=tracking.tolerance;}
    catchCursor.style.left=(grab.active?cursorX:assisted.x)+'px';catchCursor.style.top=(grab.active?cursorY:assisted.y)+'px';
    catchCursor.style.setProperty('--aim',grab.aimProgress.toFixed(3));
    catchCursor.classList.toggle('near-grab',near||aimable&&!ready);
    catchCursor.classList.toggle('can-grab',ready);
    catchCursor.classList.toggle('pulling',grab.active);
    catchCursor.classList.toggle('slipping',!!tracking&&!tracking.aligned);
  }
  renderer.domElement.addEventListener('pointerdown',e=>{
    if(e.button!==0||saltTool.held||pull.phase!=='ready'||grab.active)return;
    const tuning=difficulties[behavior.difficulty];
    const assisted=assistedCursor(e.clientX,e.clientY),effectiveDistance=Math.hypot(assisted.x-assisted.target.x,assisted.y-assisted.target.y);
    if(!grab.ready||effectiveDistance>tuning.lockRadius){if(state.height>=catchHeight())grab.message=grab.aimProgress>0?'좋아요. 노란 조준점을 그대로 조금만 더 유지하세요.':'몸통 중앙의 노란 조준점을 맞춰 주세요.';return;}
    playerHand.latch();grab.active=true;grab.ready=false;grab.count++;grab.message='잡았다! 중앙을 따라가며 위로 당겨 주세요.';
    behavior.phase='caught';
    Object.assign(pull,{phase:'pulling',mass:activeWeightGrams,eventTriggered:false,maskEscaped:false,lift:0,velocity:0,baseY:clam.position.y,required:Math.max(.025,floorY+.008-(clam.position.y-.134*clam.scale.y)),time:0,tension:0,mudClock:0,soundClock:0,yielded:false,slipTime:0,slipped:false});
    sound.play('grab');kickCamera(.005);emitMud(3,.35);
    updateCatchCursor();
  });
  function updateGrab(){
    const h=playerHand.getState();
    if(grab.active&&!h.grabbed){
      grab.active=false;
      if(pull.phase==='pulling'){pull.phase='escaping';pull.timer=0;pull.failures++;pull.streak=0;pull.tension=0;mudStretch.visible=false;clearSalt();grab.message=pull.slipped?'중앙을 놓쳐 미끄러졌어요! 맛조개가 다시 들어갑니다.':'놓쳤어요! 구멍으로 들어갑니다. 곧 다시 시도할 수 있어요.';sound.play('escape');kickCamera(.006);emitMud(6,.55);}
      grab.ready=false;grab.aimTime=0;grab.aimProgress=0;
    }
    grab.contacts=grab.active?1:0;grab.thumbContact=false;
    $('hand-state').textContent=pull.phase==='success'?'● 채집 성공!':pull.phase==='escaping'?'놓침 · 다시 준비 중':grab.active?(grab.alignment<.55?'주황 · 미끄러짐 주의':'● 중앙 유지 · 위로 당기기'):'몸통 중앙을 맞추고 초록색이 되면 잡기';
    $('grab-message').textContent=grab.message;$('grab-count').textContent=grab.count;
    $('hand-state').classList.toggle('is-grabbed',grab.active);
    updateCatchCursor();
  }
  function releaseGrab(){playerHand.release();grab.active=false;grab.ready=false;grab.aimTime=0;grab.aimProgress=0;grab.alignment=1;pull.phase='ready';pull.lift=0;pull.velocity=0;pull.tension=0;pull.slipTime=0;pull.slipped=false;mudStretch.visible=false;clam.position.x=0;resetSurprises();mudBits.forEach(b=>b.mesh.visible=false);grab.message='몸통 중앙에 커서를 잠깐 유지한 뒤 잡아 보세요.';}
  $('pull-resistance').addEventListener('input',e=>{pull.resistance=Number(e.target.value);$('pull-resistance-value').textContent=pull.resistance.toFixed(1);});
  const defaults={distance:85,angle:72,height:-7};
  const state={...defaults};
  let requested=false,lastFrame=0;
  function render(){if(requested||document.hidden)return;requested=true;requestAnimationFrame(frame);}
  function frame(now){
    requested=false;if(document.hidden){lastFrame=0;return;}
    // Cap the continuous environmental preview at 30 fps; pause in hidden tabs.
    if(!lastFrame||now-lastFrame>=1000/30){
      const dt=lastFrame?Math.min((now-lastFrame)/1000,.1):0;lastFrame=now;
      animateEnvironment(environmentTime+dt);updateSalt(dt);updateBehavior(dt);updateReactionCue();updatePull(dt);
      playerHand.update(dt);updateGrab();applyCameraFeedback(dt);updateSurprises(dt);renderer.render(scene,camera);
    }
    render();
  }
  document.addEventListener('visibilitychange',()=>{lastFrame=0;render();});
  function update(){
    const angle=state.angle*Math.PI/180,d=state.distance/100;
    cameraBase.set(.035,Math.sin(angle)*d+cameraTarget.y,Math.cos(angle)*d);camera.position.copy(cameraBase);camera.lookAt(cameraTarget);
    // Leave space for desktop controls while keeping the hole in the viewing area.
    camera.setViewOffset(innerWidth,innerHeight,innerWidth>700?innerWidth*.075:0,0,innerWidth,innerHeight);
    clam.visible=state.height>-6;clam.position.y=floorY+state.height/100-clamTop;
    for(const key of ['distance','angle']){$(key).value=state[key];$(key+'-value').textContent=state[key]+(key==='angle'?'°':' cm');}
    updateHeightUI();render();
  }
  function updateHeightUI(){
    $('height').value=state.height;
    const shown=Math.abs(state.height).toFixed(1);
    $('height-value').textContent=state.height<=-6?'숨음':state.height<0?`구멍 안 ${shown} cm`:state.height===0?'구멍 입구':`입구 위 ${shown} cm`;
    document.querySelectorAll('[data-height]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.height)===state.height)));
  }
  for(const key of ['distance','angle','height'])$(key).addEventListener('input',e=>{if(key==='height'||pull.phase!=='ready'){stopBehavior();releaseGrab();}state[key]=Number(e.target.value);update();});
  document.querySelectorAll('[data-height]').forEach(b=>b.addEventListener('click',()=>{stopBehavior();releaseGrab();state.height=Number(b.dataset.height);update();}));
  $('scale').addEventListener('change',()=>{ruler.visible=$('scale').checked;render();});
  function reset(){foundClamType=0;foundWeightFactor=1;foundPullEvent='none';$('pull-event-preview').value='actual';applyClamType(0);Object.assign(state,defaults);releaseGrab();equipSalt(false);clearSalt();saltTool.emitted=0;Object.assign(behavior,{phase:'idle',mode:'auto',timer:0,nearTime:0,escapes:0});grab.count=0;Object.assign(pull,{successes:0,failures:0,streak:0,bestStreak:0,resistance:1.2});cameraFeedback.impulse=0;cameraFeedback.peak=0;$('scale').checked=false;ruler.visible=false;playerHand.reset();$('pull-resistance').value='1.2';$('pull-resistance-value').textContent='1.2';update();if(searchEnabled)search.start(undefined,{fresh:true});}
  $('reset').addEventListener('click',reset);
  function toggle(){const hidden=!$('panel').hidden;$('panel').hidden=hidden;$('toggle').setAttribute('aria-expanded',String(!hidden));}
  $('toggle').addEventListener('click',toggle);
  if(innerWidth<=700){$('panel').hidden=true;$('toggle').setAttribute('aria-expanded','false');}
  addEventListener('keydown',e=>{if(e.target.matches('input,button')||e.ctrlKey||e.altKey||e.metaKey)return;if(e.key.toLowerCase()==='r')reset();if(e.key.toLowerCase()==='h')toggle();});
  renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();if(pull.phase!=='ready')return;state.distance=T.MathUtils.clamp(state.distance+Math.sign(e.deltaY)*3,55,135);update();},{passive:false});
  function resize(){if(pull.phase!=='ready'){stopBehavior();releaseGrab();}camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);update();}
  addEventListener('resize',resize);resize();
  const searchEnabled=!new URLSearchParams(location.search).has('skipSearch');
  const search=window.createBurrowSearch((typeIndex,weightFactor,pullEvent)=>{foundClamType=typeIndex??0;foundWeightFactor=weightFactor??1;foundPullEvent=pullEvent??'none';$('pull-event-preview').value='actual';applyClamType(foundClamType);grab.message='맛조개일 것 같은 구멍입니다. 소금통을 들어 직접 뿌려 보세요.';});
  addEventListener('mudflat:hole-flooded',()=>{
    releaseGrab();equipSalt(false);clearSalt();resetSurprises();
    Object.assign(behavior,{phase:'idle',mode:'auto',timer:0,index:0,level:null,nearTime:0});
    Object.assign(pull,{phase:'ready',lift:0,velocity:0,tension:0,eventTriggered:false,maskEscaped:false});
    setClamHeight(-7);
    search.start('바닷물이 들어와 구멍이 바로 메워졌어요. 마른 갯벌에서 다른 기척을 찾아보세요.',{outcome:'escaped'});
  });
  addEventListener('mudflat:tide-end',()=>{
    releaseGrab();equipSalt(false);clearSalt();resetSurprises();
    Object.assign(behavior,{phase:'idle',mode:'auto',timer:0,index:0,level:null,nearTime:0});
    Object.assign(pull,{phase:'ready',lift:0,velocity:0,tension:0,eventTriggered:false,maskEscaped:false});
    setClamHeight(-7);grab.message='밀물이 들어와 채집을 중단하고 해안으로 돌아왔습니다.';
  });
  $('return-search').addEventListener('click',()=>{releaseGrab();equipSalt(false);clearSalt();behavior.phase='idle';behavior.mode='auto';behavior.level=null;setClamHeight(-7);pull.phase='ready';search.start('같은 갯벌로 돌아왔어요. 주변 구멍을 더 살펴보세요.', {outcome:'left'});});
  applyClamType(0);
  if(searchEnabled)search.start();else search.close();
  // Read-only scene measurements for smoke checks and later phase integration.
  window.sandbox={getState:()=>({...state,search:search.getState(),clamVisible:clam.visible,rulerVisible:ruler.visible,phase:17,pullEvent:activePullEvent,foundPullEvent,visibleSprayDrops:sprayDrops.filter(drop=>drop.mesh.visible).length,splashVisible:!faceSplash.hidden,maskVisible:falseMask.visible,maskDepth:maskPlate.scale.z+maskBack.scale.z,trueBodyVisible:trueBody.visible,panicVisible:panicFace.visible,clamBodyTwist:clam.rotation.z,clamWeightGrams:activeWeightGrams,clamWeightFactor:foundWeightFactor,clamType:{id:activeClamType.id,name:activeClamType.name,length:activeClamType.length,width:activeClamType.width,strength:activeClamType.strength,caution:activeClamType.caution},environmentTime,waterDepth:waterY-floorY,salt:{held:saltTool.held,pouring:saltTool.pouring,dose:saltTool.dose,landed:saltTool.landed,outside:saltTool.outside,settled:settledSalt.count,falling:saltTool.particles.length,aim:saltTool.aim.toArray(),position:salt.position.toArray()},hand:playerHand.getState(),grab:{...grab},gripTuning:{...difficulties[behavior.difficulty]},pull:{...pull},behavior:{...behavior},feedback:{audio:sound.getState(),camera:{...cameraFeedback},mudVisible:mudBits.filter(b=>b.mesh.visible).length},clamY:clam.position.y}),setTideElapsed:ms=>search.setTideElapsed(ms),triggerSearchClue:kind=>search.triggerClue(kind),getSearchDebug:()=>search.getDebugHoles(),getOctopusDebug:()=>search.getDebugOctopuses(),getRenderInfo:()=>({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}),getClamScreenPoint:()=>{const p=new T.Vector3(0,floorY+Math.min(.07,Math.max(.02,state.height/100*.7)),0).project(camera),r=renderer.domElement.getBoundingClientRect(),x=r.left+(p.x+1)*r.width/2,y=r.top+(1-p.y)*r.height/2;const valid=[];for(let dy=-40;dy<=40;dy+=2)if(catchHit(x,y+dy))valid.push(y+dy);return {x,y:valid.length?valid[Math.floor(valid.length/2)]:y};},getContactDebug:()=>playerHand.probes().map(p=>({kind:p.kind,center:p.center.toArray(),radius:p.radius,touch:shellContact(p)}))};
})();
