import {BALANCE} from './settings.js';

/** A short impact animation and craters that recover after one world year. */
export class MeteorSystem {
  constructor(){
    this.craters=[];
    this.meteors=[];
    this.flights=[];
    this.sound=typeof Audio==='undefined'?null:new Audio('./assets/meteor-explosion.mp3');
    if(this.sound)this.sound.volume=.8;
  }

  launch(x,y,world){
    if(x<0||y<0||x>=world.width||y>=world.height||this.craters.length+this.meteors.length>=1000)return false;
    this.meteors.push({x,y,age:0});
    return true;
  }

  forgetCells(changed){
    const edited=new Set(changed);
    for(const crater of this.craters)crater.cells=crater.cells.filter(cell=>!edited.has(cell));
    this.craters=this.craters.filter(crater=>crater.cells.length);
  }

  update(realDt,game){
    for(const meteor of this.meteors){
      meteor.age+=realDt;
      if(meteor.age>=.8&&!meteor.hit){meteor.hit=true;this.impact(meteor,game);}
    }
    this.meteors=this.meteors.filter(m=>m.age<1.3);
    for(const flight of this.flights){flight.age+=realDt;flight.x+=flight.vx*realDt;flight.y+=flight.vy*realDt;flight.vy+=30*realDt;flight.rotation+=realDt*8;}
    this.flights=this.flights.filter(f=>f.age<1.15);
    const due=this.craters.filter(c=>game.elapsedSeconds>=c.expiresAt);
    if(due.length){
      const cells=new Set();
      for(const crater of due)for(const cell of crater.cells){
        game.world.tiles[cell]=2;game.world.elevation[cell]=.56;cells.add(cell);
      }
      this.craters=this.craters.filter(c=>!due.includes(c));
      for(const cell of cells)game.drawTerrainCell(cell);
      game.refreshLand([...cells]);
      game.message('クレーターが草原に戻りました');
    }
  }

  impact(meteor,game){
    const {x,y}=meteor,world=game.world,cells=[];
    for(let py=Math.max(0,Math.floor(y-4));py<=Math.min(world.height-1,Math.ceil(y+4));py++){
      for(let px=Math.max(0,Math.floor(x-4));px<=Math.min(world.width-1,Math.ceil(x+4));px++){
        const distance=Math.hypot(px+.5-x,py+.5-y);
        if(distance>4)continue;
        const cell=py*world.width+px;
        // A strike in the sea creates an island; its crater later becomes grassland.
        world.tiles[cell]=4;world.elevation[cell]=.57;
        cells.push(cell);game.drawTerrainCell(cell);
      }
    }
    for(const previous of this.craters)previous.cells=previous.cells.filter(cell=>!cells.includes(cell));
    this.craters=this.craters.filter(c=>c.cells.length);
    this.craters.push({x,y,cells,expiresAt:game.elapsedSeconds+BALANCE.secondsPerYear});
    let deaths=0;
    for(const p of game.people){
      const dx=p.x-x,dy=p.y-y,distance=Math.hypot(dx,dy);
      if(p.shipId||distance>10)continue;
      const velocity=8+Math.random()*7;
      this.flights.push({x:p.x,y:p.y,vx:(dx/(distance||1))*velocity,vy:(dy/(distance||1))*velocity-12,age:0,rotation:0});
      if(distance<4||Math.random()<(10-distance)/12){p.alive=false;p.deathCause='meteor';deaths++;}
      else{p.hp=Math.max(1,p.hp-40);p.setTask(null);}
    }
    const damaged=node=>Math.hypot(node.x-x,node.y-y)<=10;
    for(const node of [...game.food.items,...game.materials.items])if(damaged(node)){node.amount=0;node.timer=0;}
    for(const village of game.society.villages)if(damaged(village))for(const kind of ['food','wood','stone'])village.stock[kind]=Math.floor(village.stock[kind]*.5);
    game.refreshLand(cells);
    game.society.addNews(`隕石が落下。${deaths}人が亡くなり、周囲の資源が減りました。`);
    game.message(`隕石が落下！ ${deaths}人が死亡。クレーターは1年で草原になります`);
    if(this.sound){this.sound.currentTime=0;this.sound.play().catch(()=>{});}
  }

  draw(ctx,game){
    const point=(x,y)=>({x:game.x+x*game.scale,y:game.y+y*game.scale});
    for(const crater of this.craters){
      const p=point(crater.x,crater.y),r=5*game.scale;
      if(p.x+r<0||p.y+r<0||p.x-r>game.w||p.y-r>game.h)continue;
      const gradient=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,r);
      gradient.addColorStop(0,'#183942bb');gradient.addColorStop(.6,'#6b5446aa');gradient.addColorStop(1,'#eb7c43aa');
      ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();
    }
    for(const meteor of this.meteors){
      const p=point(meteor.x,meteor.y),size=Math.max(8,game.scale*3);
      if(meteor.age<.8){
        const progress=meteor.age/.8;
        ctx.strokeStyle='#ff874d';ctx.lineWidth=Math.max(3,size*.5);
        ctx.beginPath();ctx.moveTo(p.x-75*(1-progress),p.y-110*(1-progress));ctx.lineTo(p.x,p.y);ctx.stroke();
        ctx.fillStyle='#e8ded0';ctx.beginPath();ctx.arc(p.x-75*(1-progress),p.y-110*(1-progress),size,0,Math.PI*2);ctx.fill();
      }else{
        ctx.strokeStyle=`rgba(255,200,104,${Math.max(0,(1.3-meteor.age)*2)})`;
        ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,(meteor.age-.8)*65+size,0,Math.PI*2);ctx.stroke();
      }
    }
    for(const flight of this.flights){
      const p=point(flight.x,flight.y);ctx.save();ctx.translate(p.x,p.y);ctx.rotate(flight.rotation);
      ctx.fillStyle='#ffe4b4';ctx.fillRect(-3,-5,6,5);ctx.fillStyle='#e56e53';ctx.fillRect(-3,0,6,8);ctx.restore();
    }
  }
}
