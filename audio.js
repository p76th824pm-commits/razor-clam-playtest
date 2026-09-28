/* Small Web Audio cues generated locally; no downloaded sound assets. */
window.createSandboxAudio = function(){
  let context=null,noise=null,enabled=true;
  const played={};
  function unlock(){
    if(!enabled)return;
    try{
      context ||= new (window.AudioContext||window.webkitAudioContext)();
      if(context.state==='suspended')context.resume().catch(()=>{});
      if(!noise){
        noise=context.createBuffer(1,Math.floor(context.sampleRate*.5),context.sampleRate);
        const data=noise.getChannelData(0);
        for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      }
    }catch(_){enabled=false;}
  }
  function tone(at,f0,f1,duration,volume,type='sine'){
    const oscillator=context.createOscillator(),gain=context.createGain();
    oscillator.type=type;oscillator.frequency.setValueAtTime(f0,at);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(35,f1),at+duration);
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    oscillator.connect(gain).connect(context.destination);oscillator.start(at);oscillator.stop(at+duration+.01);
  }
  function hiss(at,duration,volume,frequency){
    const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.buffer=noise;filter.type='lowpass';filter.frequency.value=frequency;
    gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(volume,at+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,at+duration);
    source.connect(filter).connect(gain).connect(context.destination);source.start(at);source.stop(at+duration+.01);
  }
  function play(kind,amount=1){
    if(!enabled)return;
    unlock();if(!context||context.state==='suspended')return;
    played[kind]=(played[kind]||0)+1;
    const at=context.currentTime,level=Math.min(1.4,Math.max(.2,amount));
    if(kind==='salt')hiss(at,.045,.018*level,2600);
    else if(kind==='grab'){tone(at,130,78,.10,.055*level);hiss(at,.07,.016*level,350);}
    else if(kind==='strain'){tone(at,145,98,.12,.025*level,'triangle');hiss(at,.10,.012*level,750);}
    else if(kind==='success'){hiss(at,.19,.075*level,1150);tone(at+.025,90,220,.18,.085*level);}
    else if(kind==='escape'){hiss(at,.14,.035*level,850);tone(at,210,85,.19,.042*level);}
  }
  return {unlock,play,setEnabled:value=>{enabled=value;if(enabled)unlock();},getState:()=>({enabled,ready:context?.state==='running',played:{...played}})};
};
