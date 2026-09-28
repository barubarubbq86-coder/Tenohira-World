import {BALANCE} from './settings.js';

/** Derive small public places from each settlement; no extra saved entities. */
export class TownSystem {
  constructor(){this.cache=new Map();this.roads=new Map();}

  clear(){this.cache.clear();this.roads.clear();}

  places(village,world,buildings){
    const cached=this.cache.get(village.id);
    if(cached&&cached.x===village.x&&cached.y===village.y&&
      cached.buildingCount===buildings.items.length&&cached.farmCell===village.farmCell&&
      cached.places.every(p=>world.walkable(p.x,p.y)))return cached.places;
    const occupied=new Set(buildings.items.map(h=>h.cell));
    if(village.farmCell!==null)occupied.add(village.farmCell);
    const places=[];
    for(const [kind,dx,dy] of [['park',4,1],['restaurant',-4,1],['shop',0,-4]]){
      let place=null;
      for(let radius=0;radius<=4&&!place;radius++){
        for(let y=-radius;y<=radius&&!place;y++)for(let x=-radius;x<=radius;x++){
          if(Math.max(Math.abs(x),Math.abs(y))!==radius)continue;
          const px=Math.floor(village.x+dx+x),py=Math.floor(village.y+dy+y);
          if(px<0||py<0||px>=world.width||py>=world.height||
            !world.walkable(px+.5,py+.5))continue;
          const cell=py*world.width+px;
          if(occupied.has(cell)||buildings.items.some(h=>
            Math.hypot(h.x-(px+.5),h.y-(py+.5))<2.5))continue;
          occupied.add(cell);place={kind,cell,x:px+.5,y:py+.5};break;
        }
      }
      if(place)places.push(place);
    }
    this.cache.set(village.id,{x:village.x,y:village.y,
      buildingCount:buildings.items.length,farmCell:village.farmCell,places});
    this.roads.delete(village.id);
    return places;
  }

  roadRoutes(village,world,buildings){
    const places=this.places(village,world,buildings);
    const key=`${village.cell}:${places.map(p=>p.cell).join(',')}`;
    if(this.roads.get(village.id)?.key===key)return this.roads.get(village.id).routes;
    const routes=[];
    const sx=village.cell%world.width,sy=Math.floor(village.cell/world.width);
    for(const p of places){
      const tx=Math.floor(p.x),ty=Math.floor(p.y);
      const route=(horizontalFirst)=>{
        const cells=[[sx,sy]];let x=sx,y=sy;
        for(let step=0;step<20&&(x!==tx||y!==ty);step++){
          if(horizontalFirst){if(x!==tx)x+=Math.sign(tx-x);else y+=Math.sign(ty-y);}
          else {if(y!==ty)y+=Math.sign(ty-y);else x+=Math.sign(tx-x);}
          if(!world.walkable(x+.5,y+.5))return null;
          cells.push({x:x+.5,y:y+.5});
        }
        return x===tx&&y===ty?cells.map(c=>Array.isArray(c)?{x:c[0]+.5,y:c[1]+.5}:c):null;
      };
      const cells=route(true)??route(false);
      if(cells?.length>1)routes.push(cells);
    }
    this.roads.set(village.id,{key,routes});return routes;
  }

  drawRoads(ctx,game){
    if(game.elapsedSeconds<50*BALANCE.secondsPerYear||game.scale<game.minScale*1.8)return;
    ctx.save();ctx.strokeStyle='#737b72';ctx.lineWidth=Math.max(2,game.scale*.55);
    for(const v of game.society.villages)for(const route of this.roadRoutes(v,game.world,game.buildings)){
      if(!route.some(p=>game.x+p.x*game.scale>=-10&&game.x+p.x*game.scale<=game.w+10&&
        game.y+p.y*game.scale>=-10&&game.y+p.y*game.scale<=game.h+10))continue;
      ctx.beginPath();route.forEach((p,i)=>{
        const x=game.x+p.x*game.scale,y=game.y+p.y*game.scale;
        if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);
      });ctx.stroke();
    }
    ctx.restore();
  }

  drawCars(ctx,game){
    if(game.elapsedSeconds<50*BALANCE.secondsPerYear||game.scale<game.minScale*2.5)return;
    for(const v of game.society.villages){
      const route=this.roadRoutes(v,game.world,game.buildings)[0];
      if(!route||route.length<2)continue;
      const trip=2*(route.length-1);
      const position=(game.elapsedSeconds*.7+v.id*2)%trip;
      const progress=position<=route.length-1?position:trip-position;
      const index=Math.min(route.length-2,Math.floor(progress)),t=progress-index;
      const a=route[index],b=route[index+1];
      const x=game.x+(a.x+(b.x-a.x)*t)*game.scale;
      const y=game.y+(a.y+(b.y-a.y)*t)*game.scale;
      if(x<0||y<0||x>game.w||y>game.h)continue;
      const r=Math.max(3,Math.min(7,game.scale*.7));
      ctx.fillStyle='#f0c94d';ctx.fillRect(x-r,y-r*.65,r*2,r*1.1);
      ctx.fillStyle='#355060';ctx.fillRect(x-r*.3,y-r*.55,r*.8,r*.45);
      ctx.fillStyle='#253239';ctx.fillRect(x-r*.7,y+r*.45,r*.35,r*.3);
      ctx.fillRect(x+r*.4,y+r*.45,r*.35,r*.3);
    }
  }

  visit(person,dt,game){
    if(game.elapsedSeconds<45*BALANCE.secondsPerYear||person.shipId||person.swimming)return false;
    const village=game.society.villageFor(person);
    if(!village)return false;
    const now=game.elapsedSeconds;
    if(person.nextLeisureAt===undefined)person.nextLeisureAt=now+10+person.id%70;
    if(!person.leisureKind&&now<person.nextLeisureAt)return false;
    const places=this.places(village,game.world,game.buildings);
    const desired=person.age<18?'park':person.id%2?'restaurant':'shop';
    const place=places.find(p=>p.kind===(person.leisureKind??desired));
    if(!place){person.leisureKind=null;person.nextLeisureAt=now+80;return false;}
    if(!person.leisureKind){person.leisureKind=place.kind;person.leisureUntil=null;}
    person.setTask(`leisure-${village.id}-${place.kind}`);
    const labels={park:'公園で遊ぶ',restaurant:'食堂で食事',shop:'店で買い物'};
    if(person.travelTo(place.cell,dt,game.world)){
      if(person.leisureUntil===null){person.leisureUntil=now+3;
        if(place.kind==='restaurant'&&village.stock.food>0){village.stock.food--;person.hunger=Math.max(0,person.hunger-15);}
      }
      person.action=labels[place.kind];
      if(now>=person.leisureUntil){person.leisureKind=null;person.nextLeisureAt=now+90+person.id%50;}
    }else person.action=`${labels[place.kind]}ために移動中`;
    return true;
  }

  draw(ctx,game){
    if(game.elapsedSeconds<45*BALANCE.secondsPerYear||game.scale<game.minScale*2.5)return;
    for(const village of game.society.villages){
      for(const p of this.places(village,game.world,game.buildings)){
        const x=game.x+p.x*game.scale,y=game.y+p.y*game.scale;
        const r=Math.max(4,game.scale*1.15);
        if(x+r<0||y+r<0||x-r>game.w||y-r>game.h)continue;
        if(p.kind==='park'){
          ctx.fillStyle='#4d884d';ctx.fillRect(x-r,y-r,r*2,r*2);
          ctx.fillStyle='#b8d869';ctx.fillRect(x-r*.65,y-r*.75,r*.5,r*.5);
          ctx.fillRect(x+r*.35,y-r*.55,r*.4,r*.4);
          ctx.fillStyle='#9a704a';ctx.fillRect(x-r*.45,y+r*.4,r*.9,r*.25);
        }else{
          ctx.fillStyle='#dfc9a1';ctx.fillRect(x-r,y-r*.5,r*2,r*1.5);
          ctx.fillStyle=p.kind==='restaurant'?'#b85246':'#447eb1';
          ctx.fillRect(x-r*1.15,y-r,r*2.3,r*.6);
          ctx.fillStyle='#233b42';ctx.fillRect(x-r*.25,y+r*.2,r*.5,r*.8);
          ctx.fillStyle='#f6e6b7';ctx.fillRect(x+r*.4,y-r*.25,r*.4,r*.45);
        }
        if(game.scale>game.minScale*5){
          ctx.textAlign='center';ctx.font='bold 11px system-ui';ctx.lineWidth=3;
          ctx.strokeStyle='#17343b';ctx.strokeText(({park:'公園',restaurant:'食堂',shop:'店'})[p.kind],x,y-r*1.4);
          ctx.fillStyle='#fff';ctx.fillText(({park:'公園',restaurant:'食堂',shop:'店'})[p.kind],x,y-r*1.4);
        }
      }
    }
  }
}
