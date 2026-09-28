/* Sideways articulated hand with finger-pad contact probes for Phase 3. */
window.createSandboxHand = function({THREE:T,scene,camera,canvas,material,terrain}) {
  const hand=new T.Group();hand.name='PlayerHand';scene.add(hand);
  const skin=material('#efbb90'),nail=material('#ffe3c6');
  const sleeveMat=material('#81ada0'),cuffMat=material('#dbe2bf');
  function part(geometry,mat,parent=hand){const m=new T.Mesh(geometry,mat);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function oval(parent,position,scale,mat=skin){const m=part(new T.SphereGeometry(1,20,12),mat,parent);m.position.set(...position);m.scale.set(...scale);return m;}
  oval(hand,[0,0,0],[.044,.018,.055]);
  oval(hand,[-.026,-.003,.003],[.024,.017,.033]);
  const fingers=[];
  // The right thumb is on the left when looking at the back of the hand.
  const specs=[[-.029,.032,.022,.018,.0095],[-.009,.038,.025,.019,.010],[.012,.035,.024,.018,.0095],[.031,.027,.019,.016,.008]];
  specs.forEach(([x,a,b,c,r],i)=>{
    const root=new T.Group();root.position.set(x,0,-.039+Math.abs(x)*.15);hand.add(root);
    const joints=[];let parent=root;
    [a,b,c].forEach((length,j)=>{
      const joint=new T.Group();if(j)joint.position.y=[a,b][j-1];parent.add(joint);
      oval(joint,[0,0,0],[r,r,r]);
      const bone=part(new T.CapsuleGeometry(r,length-r*2,6,12),skin,joint);bone.position.y=length/2;
      if(j===2)oval(joint,[0,length*.67,r*.90],[r*.64,length*.28,.0012],nail);
      joints.push(joint);parent=joint;
    });
    fingers.push({root,joints,tipLength:c,radius:r,spread:(i-1.4)*.075});
  });
  const thumb=new T.Group();thumb.position.set(-.036,-.002,.003);hand.add(thumb);
  const thumbA=new T.Group(),thumbB=new T.Group();thumb.add(thumbA);thumbA.add(thumbB);thumbB.position.y=.030;
  for(const [joint,len,r] of [[thumbA,.030,.0115],[thumbB,.025,.010]]){
    oval(joint,[0,0,0],[r,r,r]);const bone=part(new T.CapsuleGeometry(r,len-r*2,6,14),skin,joint);bone.position.y=len/2;
  }
  oval(thumbB,[0,.018,.009],[.0065,.0065,.0012],nail);
  // Sleeve stretches from a wrist to an off-screen right forearm anchor.
  const forearm=new T.Group();scene.add(forearm);
  const sleeve=part(new T.CylinderGeometry(.025,.038,1,18),sleeveMat,forearm);
  const wrist=part(new T.CylinderGeometry(.022,.025,.047,18),skin,hand);wrist.rotation.x=Math.PI/2;wrist.position.z=.062;
  const cuff=part(new T.CylinderGeometry(.027,.028,.018,18),cuffMat,hand);cuff.rotation.x=Math.PI/2;cuff.position.z=.086;
  const shadowGeo=new T.CircleGeometry(.077,32);
  const shadow=part(shadowGeo,new T.MeshBasicMaterial({color:'#82694e',transparent:true,opacity:.10,depthWrite:false}),scene);
  shadow.rotation.x=-Math.PI/2;shadow.scale.y=.7;shadow.castShadow=false;shadow.receiveShadow=false;
  // Approved pose 2: handshake orientation. Local thumb side (-X) points UP,
  // little-finger edge (+X) points DOWN; the fingers curl around a vertical shell.
  const yaw=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),.90);
  const edgeDown=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-Math.PI/2);
  hand.quaternion.copy(yaw).multiply(edgeDown);
  const handHeight=.048;
  const rest=new T.Vector3(.23,handHeight,.20),target=rest.clone();hand.position.copy(rest);
  // Aim the open C-shaped space beside the palm, not the extended fingertips.
  const gripOffset=new T.Vector3(0,-.037,-.052).applyQuaternion(hand.quaternion);
  const raycaster=new T.Raycaster(),pointer=new T.Vector2(),hit=new T.Vector3();
  const workPlane=new T.Plane(new T.Vector3(0,1,0),-handHeight);
  const wristWorld=new T.Vector3(),anchor=new T.Vector3(),direction=new T.Vector3(),axis=new T.Vector3(0,1,0);
  let held=false,curl=0,response=14,activePointer=null,closingArmed=false,grabbed=false,contactCurl=.7,enabled=true,toolMode=false,snapPoint=null;
  const lockedPosition=new T.Vector3();
  const pullOffset=new T.Vector3();let pointerY=0,pullDemand=0;
  function aim(e){
    if(!enabled)return;
    if(grabbed){pullDemand=T.MathUtils.clamp(pullDemand+(pointerY-e.clientY)/Math.max(500,canvas.clientHeight)*.9,0,.55);pointerY=e.clientY;return;}
    pointerY=e.clientY;
    const rect=canvas.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);
    if(raycaster.ray.intersectPlane(workPlane,hit)){
      target.copy(hit).sub(gripOffset);
      target.x=T.MathUtils.clamp(target.x,-.29,.36);target.z=T.MathUtils.clamp(target.z,-.16,.40);
      target.y=terrain(target.x,target.z).height+handHeight;
      if(!snapPoint)hand.position.copy(target);
    }
  }
  function release(){held=false;closingArmed=false;grabbed=false;if(activePointer!==null&&canvas.hasPointerCapture(activePointer))canvas.releasePointerCapture(activePointer);activePointer=null;}
  canvas.addEventListener('pointermove',e=>{if(enabled&&(e.pointerType==='mouse'||e.pointerId===activePointer))aim(e);});
  canvas.addEventListener('pointerdown',e=>{if(!enabled||e.button!==0)return;if(toolMode){aim(e);return;}e.preventDefault();activePointer=e.pointerId;canvas.setPointerCapture(e.pointerId);aim(e);closingArmed=curl<.18;held=true;});
  canvas.addEventListener('pointerup',release);canvas.addEventListener('pointercancel',release);
  canvas.addEventListener('lostpointercapture',()=>{held=false;activePointer=null;});
  window.addEventListener('blur',release);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)release();});
  canvas.style.cursor='none';
  function reset(){release();target.copy(rest);hand.position.copy(rest);curl=0;}
  function update(dt){
    if(grabbed&&held)hand.position.copy(lockedPosition).add(pullOffset);
    else if(snapPoint&&!toolMode){
      const grip=target.clone().add(gripOffset),distance=Math.hypot(grip.x-snapPoint.x,grip.z-snapPoint.z);
      const weight=.86*(1-T.MathUtils.smoothstep(distance,.025,.085));
      const desired=target.clone().lerp(snapPoint.clone().sub(gripOffset),weight);
      if(weight>0)hand.position.lerp(desired,1-Math.exp(-Math.max(14,response)*dt));
      else hand.position.copy(target);
    }else hand.position.copy(target);
    curl=T.MathUtils.damp(curl,toolMode?.55:held?(grabbed?contactCurl:1):0,held?12:20,dt);
    if(curl>.90)closingArmed=false;
    fingers.forEach(({root,joints,spread},i)=>{
      root.rotation.set(-Math.PI/2,0,spread*.40*(1-curl));
      // Keep a small open arc at rest; close to a cylindrical grip, not a fist.
      joints[0].rotation.x=-(.10+curl*(.62+(i===3?.06:0)));
      joints[1].rotation.x=-(.12+curl*.93);
      joints[2].rotation.x=-(.08+curl*.64);
    });
    thumb.rotation.set(-Math.PI/2,0,.64-curl*.32);
    thumbA.rotation.x=-(.10+curl*.63);thumbB.rotation.x=-(.08+curl*.62);
    hand.updateMatrixWorld(true);wristWorld.set(0,0,.086).applyMatrix4(hand.matrixWorld);
    anchor.set(.62,handHeight,.55);direction.subVectors(wristWorld,anchor);
    sleeve.position.copy(anchor).add(wristWorld).multiplyScalar(.5);
    sleeve.quaternion.setFromUnitVectors(axis,direction.clone().normalize());sleeve.scale.y=direction.length();
    shadow.position.set(hand.position.x,terrain(hand.position.x,hand.position.z).height+.001,hand.position.z-.025);
  }
  hand.visible=false;forearm.visible=false;shadow.visible=false;
  update(0);
  function probes(){
    const result=fingers.slice(0,3).map(f=>({kind:'finger',center:new T.Vector3(0,f.tipLength*.65,0).applyMatrix4(f.joints[2].matrixWorld),radius:f.radius}));
    result.push({kind:'thumb',center:new T.Vector3(0,.018,0).applyMatrix4(thumbB.matrixWorld),radius:.010});
    return result;
  }
  return {update,reset,release,probes,setResponse:v=>{response=v;},setSnapPoint:v=>{snapPoint=v?.clone()||null;},setToolMode:v=>{toolMode=v;release();curl=v?.55:0;},setEnabled:v=>{enabled=v;reset();hand.visible=false;forearm.visible=false;shadow.visible=false;canvas.style.cursor='none';},
    latch:()=>{grabbed=true;closingArmed=false;contactCurl=curl;lockedPosition.copy(hand.position);pullDemand=0;pullOffset.set(0,0,0);},
    setPullOffset:(x,y,z)=>pullOffset.set(x,y,z),
    getGripCenter:()=>hand.position.clone().add(gripOffset),
    getState:()=>({held,curl,response,grabbed,closingArmed,pullDemand,enabled,toolMode,snapping:!!snapPoint&&Math.hypot(target.x+gripOffset.x-snapPoint.x,target.z+gripOffset.z-snapPoint.z)<.085,pose:'direct-cursor',position:hand.position.toArray(),target:target.toArray()})};
};
