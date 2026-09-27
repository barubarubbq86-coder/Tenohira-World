/** Music begins after a tap, as required by mobile browser audio policies. */
export class GameAudio {
  constructor(){
    this.music=new Audio('./assets/small-town-great-journey.mp3');
    this.music.loop=true;
    this.music.volume=.35;
    this.effect=new Audio('./assets/event-close-ricecooker.mp3');
    this.effect.volume=.75;
    this.enabled=true;
    this.unlocked=false;
    this.paused=false;
    this.lastEffect=-Infinity;
  }

  unlock(){
    if(this.unlocked)return;
    this.unlocked=true;
    this.resume();
  }

  resume(){
    if(this.unlocked&&this.enabled&&!this.paused)this.music.play().catch(()=>{});
  }

  setPaused(value){
    this.paused=value;
    if(value)this.music.pause();
    else this.resume();
  }

  setEnabled(value){
    this.enabled=value;
    if(value)this.resume();
    else{this.music.pause();this.effect.pause();}
  }

  setSpeed(speed){
    this.music.playbackRate=speed>1?2:1;
  }

  playEvent(){
    if(!this.unlocked||!this.enabled)return;
    const now=performance.now();
    if(now-this.lastEffect<350)return;
    this.lastEffect=now;
    this.effect.currentTime=0;
    this.effect.play().catch(()=>{});
  }
}
