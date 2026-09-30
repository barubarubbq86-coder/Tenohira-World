/** One tap causes a wide, bounded explosion. The map bitmap uses four pixels per tile:
 * a 35-tile radius therefore appears about 280 bitmap pixels across at native scale. */
export class BigBangSystem {
  constructor(){this.bursts=[];this.fragments=[];}

  launch(x,y,game){
    const world=game.world;
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=world.width||y>=world.height)return false;
    // Start the flash immediately; apply the one-time damage at its center frame.
    if(this.bursts.length>=1)return false;
    this.bursts.push({x,y,age:0,hit:false});
    return true;
  }

  update(dt,game){
    for(const burst of this.bursts){
      burst.age+=Math.min(dt,.5);
      if(burst.age>=.36&&!burst.hit){burst.hit=true;this.impact(burst,game);}
    }
    this.bursts=this.bursts.filter(b=>b.age<1.7);
    for(const f of this.fragments){f.age+=dt;f.x+=f.vx*dt;f.y+=f.vy*dt;f.vy+=18*dt;}
    this.fragments=this.fragments.filter(f=>f.age<1.3);
  }

  impact(burst,game){
    const {x,y}=burst,world=game.world,radius=35,changed=[];
    const left=Math.max(0,Math.floor(x-radius)),right=Math.min(world.width-1,Math.ceil(x+radius));
    const top=Math.max(0,Math.floor(y-radius)),bottom=Math.min(world.height-1,Math.ceil(y+radius));
    // Only the center becomes open sea. The edge is ragged, retaining islands
    // and a shore from which survivors can rebuild.
    for(let py=top;py<=bottom;py++)for(let px=left;px<=right;px++){
      const distance=Math.hypot(px+.5-x,py+.5-y);
      const edge=28+world.hash(px+43,py+101)*6;
      if(distance>edge)continue;
      const cell=py*world.width+px;
      if(world.tiles[cell]===0)continue;
      world.tiles[cell]=0;world.elevation[cell]=.2;changed.push(cell);
      game.drawTerrainCell(cell);
    }
    let deaths=0;
    for(const p of game.people){
      if(!p.alive||p.shipId)continue;
      const dx=p.x-x,dy=p.y-y,d=Math.hypot(dx,dy);
      if(d>radius)continue;
      if(this.fragments.length<96){
        const speed=9+(radius-d)*.24+Math.random()*6;
        this.fragments.push({x:p.x,y:p.y,vx:dx/(d||1)*speed,vy:dy/(d||1)*speed-10,age:0,kind:'person'});
      }
      if(d<27||Math.random()<(radius-d)/radius){p.alive=false;p.deathCause='bigBang';deaths++;}
      else {p.hp=Math.max(1,p.hp-65);p.setTask(null);}
    }
    for(const h of game.buildings.items){
      const d=Math.hypot(h.x-x,h.y-y);
      if(d<radius&&this.fragments.length<128)this.fragments.push({x:h.x,y:h.y,vx:(h.x-x)/(d||1)*(8+Math.random()*12),vy:(h.y-y)/(d||1)*12-9,age:0,kind:'house'});
    }
    game.animals.items=game.animals.items.filter(a=>Math.hypot(a.x-x,a.y-y)>=radius);
    for(const v of game.society.villages)if(Math.hypot(v.x-x,v.y-y)<radius){
      v.stock.food=Math.floor(v.stock.food*.15);
      v.stock.wood=Math.floor(v.stock.wood*.15);
      v.stock.stone=Math.floor(v.stock.stone*.15);
    }
    // The same cleanup as the land eraser handles houses, capitals, swimmers,
    // navigation and resource maps in one bounded terrain refresh.
    if(changed.length)game.afterLandLost(changed);
    game.society.addNews(`ビッグバンクハツ！ ${deaths}人が巻き込まれ、海が広がりました。`);
    game.message(`ビッグバンクハツ！ ${deaths}人が亡くなりました`);
    game.audio?.playMeteor?.();
  }

  draw(ctx,game){
    const point=(x,y)=>({x:game.x+x*game.scale,y:game.y+y*game.scale});
    for(const b of this.bursts){
      const p=point(b.x,b.y),progress=Math.min(1,b.age/.95);
      const radius=(3+35*progress)*game.scale;
      if(p.x+radius<0||p.y+radius<0||p.x-radius>game.w||p.y-radius>game.h)continue;
      ctx.save();
      ctx.globalAlpha=Math.max(0,1-b.age/1.7);
      ctx.fillStyle=b.age<.36?'#ffefb1':'#e58245';
      ctx.beginPath();ctx.arc(p.x,p.y,Math.max(3,radius*.53),0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=b.age<.36?'#fff9db':'#87d6ed';
      ctx.lineWidth=Math.max(2,Math.min(9,game.scale*2));
      ctx.beginPath();ctx.arc(p.x,p.y,radius,0,Math.PI*2);ctx.stroke();
      if(b.age>.36){
        // Lightweight sea spray: fixed count, no per-frame allocation per tile.
        ctx.fillStyle='#9edce9';
        for(let i=0;i<20;i++){
          const theta=i*2.39996,rr=radius*(.55+(i%5)*.09);
          ctx.fillRect(p.x+Math.cos(theta)*rr,p.y+Math.sin(theta)*rr,3,3);
        }
      }
      ctx.restore();
    }
    for(const f of this.fragments){
      const p=point(f.x,f.y);
      ctx.save();ctx.globalAlpha=Math.max(0,1-f.age/1.3);
      ctx.fillStyle=f.kind==='person'?'#f4bd85':'#967b5a';
      ctx.fillRect(p.x-2,p.y-2,f.kind==='person'?4:7,f.kind==='person'?4:5);
      ctx.restore();
    }
  }
}
