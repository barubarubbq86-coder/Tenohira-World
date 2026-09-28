import {BALANCE} from './settings.js';

/** Small, player-controlled effects. Terrain is changed only on explicit taps. */
export class WeatherSystem {
  constructor(){
    this.rain=false;this.lava=false;this.lavaCenter=null;this.lavaClock=0;
    this.wind=null;this.volcanoes=[];this.flashes=[];
  }

  toggleRain(){this.rain=!this.rain;return this.rain?'雨を降らせています':'雨を止めました';}
  toggleLava(x,y){
    this.lava=!this.lava;this.lavaClock=0;
    if(this.lava)this.lavaCenter={x,y};
    return this.lava?'溶岩雨を降らせています。地図をタップで降る場所を変更':'溶岩雨を止めました';
  }
  aimLava(x,y,world){
    if(x<0||y<0||x>=world.width||y>=world.height)return false;
    this.lavaCenter={x,y};return true;
  }
  startWind(x,y,toX,toY){
    const distance=Math.hypot(toX-x,toY-y);
    if(distance<3)return false;
    this.wind={dx:(toX-x)/distance,dy:(toY-y)/distance,left:12};return true;
  }

  strike(x,y,game){
    const world=game.world;
    if(x<0||y<0||x>=world.width||y>=world.height)return false;
    let hits=0;
    for(const p of game.people){
      if(!p.alive||p.shipId||Math.hypot(p.x-x,p.y-y)>2.5)continue;
      p.hp=Math.max(0,p.hp-85);p.setTask(null);p.action='落雷を受けた';hits++;
      if(p.hp<=0){p.alive=false;p.deathCause='lightning';}
    }
    for(const node of [...game.food.items,...game.materials.items])if(Math.hypot(node.x-x,node.y-y)<2){node.amount=0;node.timer=0;}
    this.flashes.push({x,y,kind:'lightning',left:.5});
    game.society.addNews(`雷が落ち、${hits}人が巻き込まれました。`);
    return true;
  }

  placeVolcano(x,y,kind,game){
    const world=game.world;
    if(x<0||y<0||x>=world.width||y>=world.height)return '地図の中をタップしてください';
    const wasSea=world.tile(x,y)===0;
    if(kind==='reverse'&&wasSea)return '逆火山は陸地に置いてください';
    const changed=[];
    const radius=kind==='reverse'?6:wasSea?5:4;
    for(let py=Math.max(0,Math.floor(y-radius));py<=Math.min(world.height-1,Math.ceil(y+radius));py++){
      for(let px=Math.max(0,Math.floor(x-radius));px<=Math.min(world.width-1,Math.ceil(x+radius));px++){
        const d=Math.hypot(px+.5-x,py+.5-y);
        if(d>radius)continue;
        const cell=py*world.width+px,old=world.tiles[cell];
        const next=kind==='reverse'?(old===0?2:old):wasSea?(d<=3?5:old===0?2:old):(old===0?0:6);
        if(next===old)continue;
        world.tiles[cell]=next;world.elevation[cell]=next===5?.58:next===6?.52:.56;changed.push(cell);
      }
    }
    if(!changed.length)return '地形は変わりませんでした';
    this.volcanoes.push({x,y,kind:kind==='reverse'?'reverse':'volcano'});
    if(this.volcanoes.length>16)this.volcanoes.shift();
    for(const cell of changed)game.drawTerrainCell(cell);
    game.meteor.forgetCells(changed);
    game.refreshLand(changed);
    if(kind==='volcano'){
      for(const p of game.people)if(p.alive&&!p.shipId&&Math.hypot(p.x-x,p.y-y)<4){p.hp=Math.max(0,p.hp-55);if(!p.hp){p.alive=false;p.deathCause='volcano';}}
    }
    const message=kind==='reverse'?'逆火山で陸地が広がりました':wasSea?'海に黒曜石の島ができました':'火山で土地が焦げました';
    game.society.addNews(message);return message;
  }

  impact(game){
    const center=this.lavaCenter;
    if(!center)return;
    const nearby=game.people.filter(p=>p.alive&&!p.shipId&&Math.hypot(p.x-center.x,p.y-center.y)<12);
    for(let n=0;n<3;n++){
      const target=nearby.length&&n===0?nearby[Math.floor(Math.random()*nearby.length)]:null;
      const a=Math.random()*Math.PI*2,r=Math.sqrt(Math.random())*12;
      const x=target?target.x+(Math.random()-.5)*2:center.x+Math.cos(a)*r;
      const y=target?target.y+(Math.random()-.5)*2:center.y+Math.sin(a)*r;
      this.flashes.push({x,y,kind:'lava',left:.9});
      for(const p of game.people){
        if(!p.alive||p.shipId||Math.hypot(p.x-x,p.y-y)>2.5)continue;
        p.hp=Math.max(0,p.hp-35);p.setTask(null);p.action='溶岩雨から逃げる';
        if(!p.hp){p.alive=false;p.deathCause='lava';}
      }
      for(const node of [...game.food.items,...game.materials.items])if(Math.hypot(node.x-x,node.y-y)<2){node.amount=0;node.timer=0;}
    }
    if(this.flashes.length>30)this.flashes.splice(0,this.flashes.length-30);
  }

  update(dt,game){
    if(this.rain)for(const f of game.food.items)if(f.amount<BALANCE.foodCapacity)f.timer+=dt*.6;
    if(this.wind){
      this.wind.left-=dt;
      if(this.wind.left<=0)this.wind=null;
    }
    for(const p of game.people)p.weatherSlow=(this.wind&&this.wind.left>0)?0.82:1;
    if(this.lava){this.lavaClock+=dt;let ticks=0;while(this.lavaClock>=1&&ticks<2){this.lavaClock--;ticks++;this.impact(game);}}
    for(const flash of this.flashes)flash.left-=dt;
    this.flashes=this.flashes.filter(f=>f.left>0);
  }

  houseOffset(time){
    if(!this.wind)return {x:0,y:0};
    const sway=Math.sin(time*7)*.27*Math.min(1,this.wind.left);
    return {x:this.wind.dx*sway,y:this.wind.dy*sway};
  }

  draw(ctx,game){
    const point=(x,y)=>({x:game.x+x*game.scale,y:game.y+y*game.scale});
    for(const v of this.volcanoes){
      const p=point(v.x,v.y),r=Math.max(3,game.scale*1.4);
      if(p.x<0||p.y<0||p.x>game.w||p.y>game.h)continue;
      ctx.fillStyle=v.kind==='reverse'?'#8bd28d':'#372c39';
      ctx.beginPath();ctx.moveTo(p.x-r,p.y+r);ctx.lineTo(p.x,p.y-r);ctx.lineTo(p.x+r,p.y+r);ctx.closePath();ctx.fill();
      ctx.fillStyle=v.kind==='reverse'?'#d7f2aa':'#f08043';ctx.fillRect(p.x-r*.35,p.y-r*.4,r*.7,r*.5);
    }
    if(this.rain){
      ctx.strokeStyle='#a9d9e883';ctx.lineWidth=1;
      const shift=Math.floor(game.elapsedSeconds*35);
      for(let i=0;i<46;i++){
        const x=((i*73+shift*3)%Math.max(1,Math.floor(game.w))),y=((i*139+shift*5)%Math.max(1,Math.floor(game.h)));
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-3,y+10);ctx.stroke();
      }
    }
    if(this.lava&&this.lavaCenter){
      const p=point(this.lavaCenter.x,this.lavaCenter.y),r=12*game.scale;
      ctx.save();ctx.setLineDash([5,5]);ctx.strokeStyle='#ff9155';ctx.lineWidth=2;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
    for(const f of this.flashes){
      const p=point(f.x,f.y),r=Math.max(5,game.scale*(f.kind==='lava'?1.6:2.3));
      ctx.fillStyle=f.kind==='lava'?'#ff8b31':'#f4f9d0';
      ctx.fillRect(p.x-r,p.y-r,r*2,r*2);
      ctx.strokeStyle=f.kind==='lava'?'#f04c35':'#e8f9ff';ctx.lineWidth=Math.max(2,game.scale*.3);
      ctx.beginPath();ctx.moveTo(p.x,p.y-r*3);ctx.lineTo(p.x-r*.5,p.y);ctx.lineTo(p.x+r*.2,p.y);ctx.stroke();
    }
  }
}
