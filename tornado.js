/** Player-drawn storms and a small moss hazard. Effects only scan live actors. */
export class TornadoSystem {
  constructor(){this.storms=[];this.moss=[];this.debris=[];this.nextId=1;}

  start(x,y,toX,toY,kind,game){
    const world=game.world;
    if(this.storms.length>=2||x<0||y<0||x>=world.width||y>=world.height)return false;
    const distance=Math.hypot(toX-x,toY-y);
    if(distance<3)return false;
    this.storms.push({id:this.nextId++,kind,startX:x,startY:y,toX:Math.max(0,Math.min(world.width-1,toX)),toY:Math.max(0,Math.min(world.height-1,toY)),x,y,age:0,closing:false,shrink:0,houseClock:0});
    game.society.addNews(`${kind==='strong'?'強台風':'台風'}が発生しました。`);
    return true;
  }

  tap(x,y){
    const storm=this.storms.find(s=>Math.hypot(x-s.x,y-s.y)<Math.max(5,(s.kind==='strong'?50:25)*.55));
    if(!storm)return false;
    storm.closing=true;return true;
  }

  toggleMoss(x,y,game){
    if(!game.world.walkable(x,y))return 'コケは陸地に置いてください';
    const existing=this.moss.find(m=>Math.hypot(m.x-x,m.y-y)<2);
    if(existing){this.moss=this.moss.filter(m=>m!==existing);return 'コケを取り除きました';}
    if(this.moss.length>=80)return 'コケは80か所まで置けます';
    this.moss.push({x:Math.floor(x)+.5,y:Math.floor(y)+.5});return 'コケを置きました';
  }

  release(storm,game){
    for(const p of game.people)if(p.tornadoId===storm.id){
      p.tornadoId=null;p.setTask(null);
      const shore=game.world.walkable(p.x,p.y)?{x:p.x,y:p.y}:game.nearestShore(p.x,p.y,18);
      if(shore){p.x=shore.x;p.y=shore.y;p.action='台風から解放された';}
      else game.beginSwim(p);
    }
  }

  flyHouse(storm,game){
    const range=storm.kind==='strong'?75:25;
    const candidates=game.buildings.items.filter(h=>Math.hypot(h.x-storm.x,h.y-storm.y)<range);
    if(!candidates.length)return;
    candidates.sort((a,b)=>Math.hypot(a.x-storm.x,a.y-storm.y)-Math.hypot(b.x-storm.x,b.y-storm.y));
    const house=candidates[0];
    game.buildings.items=game.buildings.items.filter(h=>h!==house);
    for(const p of game.people){
      if(p.home===house)p.home=null;
      if(p.site===house){p.site=null;p.setTask(null);}
    }
    for(const v of game.society.villages)v.houseIds=v.houseIds.filter(id=>id!==house.id);
    const dx=storm.toX-storm.startX,dy=storm.toY-storm.startY,length=Math.hypot(dx,dy)||1;
    this.debris.push({x:house.x,y:house.y,toX:Math.max(0,Math.min(game.world.width-1,house.x+dx/length*range)),toY:Math.max(0,Math.min(game.world.height-1,house.y+dy/length*range)),age:0});
    game.society.addNews('台風で家が吹き飛ばされました。');
    game.society.update(0,game.people,true);
  }

  update(dt,game){
    const world=game.world;
    for(const s of this.storms){
      s.age+=dt;
      const progress=Math.min(1,s.age/8);
      s.x=s.startX+(s.toX-s.startX)*progress;s.y=s.startY+(s.toY-s.startY)*progress;
      if(s.closing)s.shrink=Math.min(1,s.shrink+dt/3);
      const radius=(s.kind==='strong'?50:25)*(1-s.shrink);
      const core=(s.kind==='strong'?9:5)*(1-s.shrink);
      for(const p of game.people){
        if(!p.alive||p.shipId)continue;
        if(p.tornadoId===s.id){
          const orbit=Math.min(3,Math.max(.4,core*.45));
          const angle=s.age*4+p.id*2;
          p.x=s.x+Math.cos(angle)*orbit;p.y=s.y+Math.sin(angle)*orbit;
          p.action='台風に巻き込まれている';
          continue;
        }
        if(p.tornadoId||p.swimming||s.closing)continue;
        const distance=Math.hypot(p.x-s.x,p.y-s.y);
        if(distance<core){p.tornadoId=s.id;p.setTask(null);p.action='台風に巻き込まれた';}
        else if(distance<radius&&distance>.001){
          const step=dt*(s.kind==='strong'?1.3:.8);
          const x=p.x+(p.x-s.x)/distance*step,y=p.y+(p.y-s.y)/distance*step;
          if(world.walkable(x,y)){p.x=x;p.y=y;p.tornadoFlee=.6;p.action='台風から逃げる';p.setTask(null);}
        }
      }
      if(!s.closing){
        s.houseClock+=dt;
        if(s.houseClock>=1){s.houseClock-=1;this.flyHouse(s,game);}
      }
      if(s.shrink>=1)this.release(s,game);
    }
    this.storms=this.storms.filter(s=>s.shrink<1);
    for(const p of game.people){
      if(p.slipCooldown>0)p.slipCooldown=Math.max(0,p.slipCooldown-dt);
      if(!p.alive||p.shipId||p.tornadoId||p.swimming||p.slipCooldown>0)continue;
      if(this.moss.some(m=>Math.hypot(p.x-m.x,p.y-m.y)<1.4)){
        p.slipLeft=.65;p.slipCooldown=5;p.slipAngle=p.angle;p.setTask(null);
        if(Math.random()<.05){p.alive=false;p.deathCause='moss';p.action='コケで転倒した';}
      }
    }
    for(const h of this.debris){
      h.age+=dt;
      if(h.age<2)continue;
      for(const p of game.people)if(p.alive&&!p.shipId&&Math.hypot(p.x-h.toX,p.y-h.toY)<2.5){p.alive=false;p.deathCause='fallingHouse';}
      h.done=true;
    }
    this.debris=this.debris.filter(h=>!h.done);
  }

  drawMoss(ctx,game){
    const screen=(x,y)=>({x:game.x+x*game.scale,y:game.y+y*game.scale});
    for(const m of this.moss){
      const p=screen(m.x,m.y),size=Math.max(3,game.scale*1.25);
      if(p.x<0||p.y<0||p.x>game.w||p.y>game.h)continue;
      ctx.fillStyle='#315e3c';ctx.fillRect(p.x-size,p.y-size*.45,size*2,size);
      ctx.fillStyle='#8aca67';ctx.fillRect(p.x-size*.45,p.y-size*.6,size*.9,size*.65);
    }
  }

  draw(ctx,game){
    const screen=(x,y)=>({x:game.x+x*game.scale,y:game.y+y*game.scale});
    for(const s of this.storms){
      const p=screen(s.x,s.y),radius=(s.kind==='strong'?50:25)*(1-s.shrink)*game.scale;
      if(p.x+radius<0||p.y+radius<0||p.x-radius>game.w||p.y-radius>game.h)continue;
      ctx.save();ctx.strokeStyle=s.kind==='strong'?'#f5d2fa':'#d2e9eb';
      ctx.lineWidth=Math.max(2,game.scale*.38);ctx.setLineDash([9,7]);
      ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      for(let ring=1;ring<=3;ring++){
        const r=Math.max(3,game.scale*ring*(s.kind==='strong'?2.6:1.8)*(1-s.shrink));
        ctx.strokeStyle=ring%2?'#dce8f0':'#739eb0';ctx.lineWidth=Math.max(2,game.scale*.6);
        ctx.beginPath();ctx.arc(p.x,p.y,r,s.age*3+ring,s.age*3+ring+Math.PI*1.4);ctx.stroke();
      }
      ctx.restore();
    }
    for(const h of this.debris){
      const t=Math.min(1,h.age/2),p=screen(h.x+(h.toX-h.x)*t,h.y+(h.toY-h.y)*t);
      const size=Math.max(4,game.scale*1.8);
      ctx.save();ctx.translate(p.x,p.y-Math.sin(t*Math.PI)*size*2);ctx.rotate(t*7);
      ctx.fillStyle='#b8a78e';ctx.fillRect(-size*.6,-size*.2,size*1.2,size);
      ctx.fillStyle='#dc7c59';ctx.beginPath();ctx.moveTo(-size,0);ctx.lineTo(0,-size);ctx.lineTo(size,0);ctx.fill();ctx.restore();
    }
  }
}
