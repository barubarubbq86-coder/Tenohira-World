/** Media playback is retried from a gesture when a mobile browser rejects it. */
export class GameAudio {
  constructor(){
    this.music=new Audio('./assets/small-town-great-journey.mp3');
    this.music.loop=true;
    this.music.preload='auto';
    this.music.volume=.45;
    this.effect=new Audio('./assets/event-close-ricecooker.mp3');
    this.effect.volume=.75;
    this.meteorEffect=new Audio('./assets/meteor-explosion.mp3');
    this.meteorEffect.volume=.8;
    const Context=globalThis.AudioContext||globalThis.webkitAudioContext;
    this.context=Context?new Context():null;
    this.buffers={};
    this.loadEffect('event','./assets/event-close-ricecooker.mp3');
    this.loadEffect('meteor','./assets/meteor-explosion.mp3');
    this.enabled=true;
    this.unlocked=false;
    this.paused=false;
    this.status='waiting';
    this.lastEffect=-Infinity;
    this.requestId=0;
    this.onStatus=()=>{};
    this.music.addEventListener('error',()=>{if(this.enabled&&!this.paused)this.setStatus('error');});
  }

  setStatus(status){
    this.status=status;
    this.onStatus(status);
  }

  loadEffect(name,path){
    if(!this.context)return;
    fetch(path).then(response=>{
      if(!response.ok)throw new Error('音声を読み込めません');
      return response.arrayBuffer();
    }).then(data=>this.context.decodeAudioData(data))
      .then(buffer=>{this.buffers[name]=buffer;}).catch(()=>{});
  }

  unlock(){
    this.context?.resume().catch(()=>{});
    if(this.status!=='playing')this.resume();
  }

  resume(){
    if(!this.enabled||this.paused)return;
    this.context?.resume().catch(()=>{});
    const requestId=++this.requestId;
    this.setStatus('loading');
    let request;
    try{request=this.music.play();}
    catch{this.unlocked=false;this.setStatus('error');return;}
    Promise.resolve(request).then(()=>{
      if(requestId===this.requestId&&this.enabled&&!this.paused){this.unlocked=true;this.setStatus('playing');}
    }).catch(()=>{
      if(requestId===this.requestId&&this.enabled&&!this.paused){this.unlocked=false;this.setStatus('error');}
    });
  }

  setPaused(value){
    this.paused=value;
    if(value){this.requestId++;this.music.pause();this.setStatus('paused');}
    else this.resume();
  }

  setEnabled(value){
    this.enabled=value;
    if(value)this.resume();
    else{this.requestId++;this.music.pause();this.effect.pause();this.meteorEffect.pause();this.setStatus('off');}
  }

  setSpeed(speed){
    this.music.playbackRate=speed>1?2:1;
  }

  playEffect(name,element){
    if(!this.enabled)return;
    if(this.context?.state==='running'&&this.buffers[name]){
      const source=this.context.createBufferSource();
      const gain=this.context.createGain();
      source.buffer=this.buffers[name];gain.gain.value=name==='meteor'?.8:.75;
      source.connect(gain).connect(this.context.destination);
      source.start();return;
    }
    element.currentTime=0;
    element.play().catch(()=>{});
  }

  playEvent(){
    if(!this.unlocked||!this.enabled)return;
    const now=performance.now();
    if(now-this.lastEffect<350)return;
    this.lastEffect=now;
    this.playEffect('event',this.effect);
  }

  playMeteor(){this.playEffect('meteor',this.meteorEffect);}
}
