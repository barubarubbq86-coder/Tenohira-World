/** Player-placed hazards. Effects use simulation time; drawing uses no images. */
export class BlackHoleSystem {
  constructor(){this.holes=[];this.nextId=1;this.clock=0;}

  toggle(x,y,kind,game){
    const existing=this.holes.find(h=>Math.hypot(h.x-x,h.y-y)<Math.max(3,h.radius*.65));
    if(existing){this.holes=this.holes.filter(h=>h!==existing);return 'ブラックホールを消しました';}
    if(x<0||y<0||x>=game.world.width||y>=game.world.height)return '地図の中をタップしてください';
    if(this.holes.length>=4)return '同時に置けるブラックホールは4つまでです';
    this.holes.push({id:this.nextId++,x,y,kind,radius:kind==='people'?8:6,landRadius:0});
    return `${{people:'人間用',land:'陸地用',all:'人と陸地用'}[kind]}ブラックホールを出しました`;
  }

  update(dt,game){
    if(!this.holes.length)return;
    // One shared terrain update per second, even with several active holes.
    this.clock+=dt;
    for(const hole of this.holes){
      if(hole.kind==='land')continue;
      for(const person of game.people){
        if(!person.alive||person.shipId)continue;
        const distance=Math.hypot(person.x-hole.x,person.y-hole.y);
        if(distance>hole.radius)continue;
        if(distance<.85){person.alive=false;person.deathCause='blackHole';continue;}
        const pull=Math.min(distance,dt*(.6+(hole.radius-distance)*.65));
        person.x+=(hole.x-person.x)/distance*pull;
        person.y+=(hole.y-person.y)/distance*pull;
        person.setTask(null);
        person.action='ブラックホールに吸い寄せられる';
        if(distance-pull<.85){person.alive=false;person.deathCause='blackHole';}
        else if(!game.world.walkable(person.x,person.y))game.beginSwim(person);
      }
    }
    if(this.clock<1)return;
    const advances=Math.min(2,Math.floor(this.clock));this.clock-=advances;
    const world=game.world,changed=[];
    for(const hole of this.holes){
      if(hole.kind==='people')continue;
      hole.landRadius=Math.min(hole.radius,hole.landRadius+advances);
      const radius=hole.landRadius;
      for(let py=Math.max(0,Math.floor(hole.y-radius));py<=Math.min(world.height-1,Math.ceil(hole.y+radius));py++){
        for(let px=Math.max(0,Math.floor(hole.x-radius));px<=Math.min(world.width-1,Math.ceil(hole.x+radius));px++){
          if(Math.hypot(px+.5-hole.x,py+.5-hole.y)>radius)continue;
          const cell=py*world.width+px;
          if(world.tiles[cell]===0)continue;
          world.tiles[cell]=0;world.elevation[cell]=.2;changed.push(cell);
        }
      }
    }
    if(changed.length){
      for(const cell of changed)game.drawTerrainCell(cell);
      game.afterLandLost(changed);
    }
  }

  draw(ctx,game){
    for(const hole of this.holes){
      const x=game.x+hole.x*game.scale,y=game.y+hole.y*game.scale;
      const radius=hole.radius*game.scale;
      if(x+radius<0||y+radius<0||x-radius>game.w||y-radius>game.h)continue;
      ctx.save();ctx.globalAlpha=.88;
      ctx.strokeStyle=hole.kind==='people'?'#b060e8':hole.kind==='land'?'#45d0ec':'#ed67bb';
      ctx.lineWidth=Math.max(2,game.scale*.35);
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#1c1027';ctx.beginPath();ctx.arc(x,y,Math.max(4,game.scale*1.8),0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#e1b6ff';ctx.lineWidth=Math.max(1,game.scale*.2);
      ctx.beginPath();ctx.arc(x,y,Math.max(6,game.scale*2.7),0,Math.PI*2);ctx.stroke();
      ctx.restore();
    }
  }
}
