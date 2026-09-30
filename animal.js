import {findPath} from './navigation.js';

/** Small, manually placed animals. All species share one bounded update loop. */
export const ANIMAL_TYPES=Object.freeze({
  cow:{name:'牛',habitat:'land',role:'food',color:'#f3f1e8',size:1.4,yield:8},
  sheep:{name:'羊',habitat:'land',role:'food',color:'#eee9d5',size:1.1,yield:4},
  pig:{name:'豚',habitat:'land',role:'food',color:'#e99b9a',size:1.1,yield:5},
  chicken:{name:'鶏',habitat:'land',role:'food',color:'#f2d7a4',size:.7,yield:2},
  turtle:{name:'亀',habitat:'both',role:'wild',color:'#527f62',size:.9},
  fish:{name:'魚',habitat:'sea',role:'wild',color:'#d9b668',size:.6},
  piranha:{name:'ピラニア',habitat:'sea',role:'predator',color:'#da6b60',size:.7},
  shark:{name:'サメ',habitat:'sea',role:'predator',color:'#9eacb6',size:1.5},
  orca:{name:'シャチ',habitat:'sea',role:'predator',color:'#27384a',size:1.8},
  giantPiranha:{name:'ビッグピラニア',habitat:'sea',role:'predator',color:'#a94856',size:1.5},
  monkey:{name:'猿',habitat:'land',role:'wild',color:'#bf9365',size:.8},
  gorilla:{name:'ゴリラ',habitat:'land',role:'wild',color:'#563a2d',size:1.5},
  dog:{name:'犬',habitat:'land',role:'pet',color:'#c18d57',size:.9},
  cat:{name:'猫',habitat:'land',role:'pet',color:'#d38a42',size:.7},
  hamster:{name:'ハムスター',habitat:'land',role:'pet',color:'#e5bd83',size:.5},
  mammoth:{name:'ビッグマンモス',habitat:'land',role:'monster',color:'#754732',size:2.5},
  shadowBeast:{name:'ドジラ',habitat:'land',role:'monster',color:'#262934',size:2.8}
});

export class AnimalSystem {
  constructor(){this.items=[];this.nextId=1;}

  place(kind,x,y,game){
    const species=ANIMAL_TYPES[kind],world=game.world;
    if(!species||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=world.width||y>=world.height)return '地図の中をタップしてください';
    if(this.items.length>=200)return '動物は200匹まで置けます';
    if(species.role==='monster'&&this.items.filter(a=>ANIMAL_TYPES[a.kind]?.role==='monster').length>=12)return '怪獣は12体まで置けます';
    if(species.habitat==='land'&&!world.walkable(x,y))return 'この動物は陸地に置いてください';
    // Marine species placed ashore flop briefly before dying.
    const animal={id:this.nextId++,kind,x:Math.floor(x)+.5,y:Math.floor(y)+.5,angle:Math.random()*Math.PI*2,
      turn:0,landTime:0,attack:0,ownerId:null};
    this.items.push(animal);
    return `${species.name}を置きました${species.habitat==='sea'&&world.walkable(x,y)?'（陸では長く生きられません）':''}`;
  }

  /** A tap order is kept on the animal; the update loop approaches its target. */
  command(id,x,y,game){
    const animal=this.items.find(a=>a.id===id),species=ANIMAL_TYPES[animal?.kind],world=game.world;
    if(!species||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>=world.width||y>=world.height)return '地図の中をタップしてください';
    const land=world.walkable(x,y);
    if(species.habitat==='land'&&!land)return 'この生き物は陸地を移動します';
    if(species.habitat==='sea'&&land)return 'この生き物は海を移動します';
    const cell=Math.floor(y)*world.width+Math.floor(x);
    const house=game.buildings.items.find(h=>Math.hypot(h.x-x,h.y-y)<1.5);
    const person=game.people.find(p=>p.alive&&!p.shipId&&Math.hypot(p.x-x,p.y-y)<1.3);
    const resource=game.food.byCell.get(cell)||game.materials.byCell.get(cell);
    const action=house||person?'attack':resource?'gather':'move';
    const target=house??person??resource;
    const destination={x:target?.x??x,y:target?.y??y};
    const routeWorld=species.habitat==='sea'?{
      width:world.width,height:world.height,tiles:world.tiles,
      walkable:(px,py)=>!world.walkable(px,py)
    }:world;
    const route=species.habitat!=='both'?findPath(routeWorld,
      Math.floor(animal.y)*world.width+Math.floor(animal.x),
      Math.floor(destination.y)*world.width+Math.floor(destination.x)):null;
    if(species.habitat!=='both'&&route===null)return '通れる場所でつながっていないため、そこへは行けません';
    animal.manualTarget={...destination,action,path:route,
      targetType:house?'house':person?'person':resource?'resource':null,
      targetId:target?.id??null};
    animal.turn=0;
    return `${species.name}に${action==='attack'?'攻撃':action==='gather'?'資源を壊す':'移動'}を指示しました`;
  }

  /** Monsters may destroy nearby houses and stores; ordinary animals only obey taps. */
  interact(a,game,automatic=false){
    const species=ANIMAL_TYPES[a.kind],monster=species.role==='monster';
    const order=a.manualTarget;
    const range=monster?2.1:1.1;
    if(a.attack>0)return false;
    const people=game.people;
    let person=null,house=null,resource=null;
    if(order?.action==='attack'){
      if(order.targetType==='person')person=people.find(p=>p.id===order.targetId&&p.alive&&!p.shipId&&Math.hypot(p.x-a.x,p.y-a.y)<range);
      if(order.targetType==='house')house=game.buildings.items.find(h=>h.id===order.targetId&&Math.hypot(h.x-a.x,h.y-a.y)<range);
    }
    if(monster&&automatic&&!order){
      person=people.find(p=>p.alive&&!p.shipId&&!p.swimming&&Math.hypot(p.x-a.x,p.y-a.y)<range);
      if(!person)house=game.buildings.items.find(h=>Math.hypot(h.x-a.x,h.y-a.y)<range);
    }
    if(order?.action==='gather'){
      const cell=Math.floor(order.y)*game.world.width+Math.floor(order.x);
      resource=game.food.byCell.get(cell)||game.materials.byCell.get(cell);
      if(resource&&Math.hypot(resource.x-a.x,resource.y-a.y)>=range)resource=null;
    }
    if(person){
      person.hp=Math.max(0,person.hp-(monster?100:18));
      person.action=`${species.name}に襲われた`;
      if(person.hp===0){person.alive=false;person.deathCause='animal';}
      a.attack=monster?2.5:5;
      if(order&&person.hp===0)a.manualTarget=null;
      return true;
    }
    if(house){
      house.beastDamage=(house.beastDamage??0)+(monster?3:1);
      a.attack=monster?3.5:6;
      if(house.beastDamage<3)return true;
      // Remove all references before the next society update.
      game.buildings.items.splice(game.buildings.items.indexOf(house),1);
      for(const p of people){if(p.home===house)p.home=null;if(p.site===house){p.site=null;p.setTask(null);}}
      for(const v of game.society.villages)v.houseIds=v.houseIds.filter(id=>id!==house.id);
      if(order)a.manualTarget=null;
      return true;
    }
    if(resource){
      resource.amount=Math.max(0,resource.amount-(monster?Math.max(1,resource.amount):2));resource.timer=0;
      a.attack=monster?2:4;
      if(resource.amount===0)a.manualTarget=null;
      return true;
    }
    return false;
  }

  update(dt,game){
    const world=game.world,people=game.people;
    for(const a of this.items){
      const species=ANIMAL_TYPES[a.kind],land=world.walkable(a.x,a.y);
      if(species.habitat==='sea'&&land){a.landTime+=dt;if(a.landTime>4){a.dead=true;continue;}}
      else a.landTime=0;
      if(species.habitat==='land'&&!land){a.dead=true;continue;}
      a.turn-=dt;a.attack-=dt;
      if(a.manualTarget){
        const target=a.manualTarget,distance=Math.hypot(target.x-a.x,target.y-a.y);
        if(distance<.8&&!target.path?.length&&target.action==='move')a.manualTarget=null;
        else if(distance<1.8&&!target.path?.length&&target.action!=='move'&&a.attack<=0){
          if(!this.interact(a,game))a.manualTarget=null;
        }
        if(a.manualTarget){
          let waypoint=target;
          if(target.path?.length){
            const next=target.path[0],wx=next%world.width+.5,wy=Math.floor(next/world.width)+.5;
            if(Math.hypot(wx-a.x,wy-a.y)<.65)target.path.shift();
            if(target.path.length){const cell=target.path[0];waypoint={x:cell%world.width+.5,y:Math.floor(cell/world.width)+.5};}
          }
          a.angle=Math.atan2(waypoint.y-a.y,waypoint.x-a.x);
        }
      }
      // Pets find an owner once, then follow at a short distance.
      if(species.role==='pet'){
        let owner=people.find(p=>p.alive&&p.id===a.ownerId);
        if(!owner){a.ownerId=null;owner=people.find(p=>p.alive&&!p.shipId&&!p.swimming&&Math.hypot(p.x-a.x,p.y-a.y)<5);if(owner)a.ownerId=owner.id;}
        if(!a.manualTarget&&owner&&Math.hypot(owner.x-a.x,owner.y-a.y)>1.5)a.angle=Math.atan2(owner.y-a.y,owner.x-a.x);
      }
      if(a.kind==='turtle'&&land&&a.turn<=0&&!a.manualTarget){
        // Local coast search; stop at the first ring to keep the work small.
        outer:for(let radius=1;radius<=8;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
          if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
          const tx=a.x+dx,ty=a.y+dy;
          if(tx>=0&&ty>=0&&tx<world.width&&ty<world.height&&!world.walkable(tx,ty)){a.angle=Math.atan2(dy,dx);a.turn=2;break outer;}
        }
      }
      if(a.turn<=0&&!a.manualTarget){a.angle+=(Math.random()-.5)*2.7;a.turn=1+Math.random()*3;}
      const speed=(species.habitat==='sea'&&land)?0.18:(species.role==='pet'?1.1:species.role==='monster'?.75:0.6);
      const nx=a.x+Math.cos(a.angle)*speed*dt,ny=a.y+Math.sin(a.angle)*speed*dt;
      if(nx>=0&&ny>=0&&nx<world.width&&ny<world.height&&
        (species.habitat==='both'||(species.habitat==='land'?world.walkable(nx,ny):land||!world.walkable(nx,ny)))){a.x=nx;a.y=ny;}
      else {a.angle+=Math.PI*(.6+Math.random()*.7);a.turn=.5;}
      if(species.role==='predator'&&a.attack<=0){
        const victim=people.find(p=>p.alive&&!p.shipId&&(p.swimming||land)&&Math.hypot(p.x-a.x,p.y-a.y)<(land?1.2:1.6));
        if(victim){victim.alive=false;victim.deathCause='animal';victim.action=`${species.name}に襲われた`;a.attack=4;}
      }
      if(species.role==='monster'&&!a.manualTarget)this.interact(a,game,true);
    }
    this.items=this.items.filter(a=>!a.dead);
  }

  tryHunt(person,dt,world,society=null){
    if(person.age<16||person.shipId||person.swimming)return false;
    let target=null,best=5;
    for(const a of this.items){if(ANIMAL_TYPES[a.kind].role!=='food')continue;
      const distance=Math.hypot(a.x-person.x,a.y-person.y);
      if(distance<best){best=distance;target=a;}
    }
    if(!target)return false;
    person.setTask('hunt');person.action=`${ANIMAL_TYPES[target.kind].name}を狩る`;
    if(best<1.3){
      this.items.splice(this.items.indexOf(target),1);
      const species=ANIMAL_TYPES[target.kind],village=society?.villageFor(person);
      // One portion feeds the hunter; the rest goes into the settlement store.
      if(village)village.stock.food=Math.min(9999,village.stock.food+species.yield-1);
      person.hunger=Math.max(0,person.hunger-45);person.meals++;
      person.action=village?`${species.name}を狩り、食料${species.yield-1}を備蓄した`:`${species.name}を食べた`;
    }
    else person.travelTo(Math.floor(target.y)*world.width+Math.floor(target.x),dt,world);
    return true;
  }

  stockVillage(person,dt,world,society){
    const village=society?.villageFor(person);
    if(!village||person.age<18||!person.home||village.stock.food>=
      Math.max(6,(village.houseIds?.length??0)*3))return false;
    let target=null,best=6;
    for(const animal of this.items){
      if(ANIMAL_TYPES[animal.kind].role!=='food'||
        Math.hypot(animal.x-village.x,animal.y-village.y)>14)continue;
      const distance=Math.hypot(animal.x-person.x,animal.y-person.y);
      if(distance<best){best=distance;target=animal;}
    }
    if(!target)return false;
    person.setTask(`livestock-${village.id}`);
    person.action=`${ANIMAL_TYPES[target.kind].name}を集落の食料にする`;
    if(best<1.3){
      this.items.splice(this.items.indexOf(target),1);
      village.stock.food=Math.min(9999,village.stock.food+ANIMAL_TYPES[target.kind].yield);
      person.action=`${ANIMAL_TYPES[target.kind].name}を備蓄に運んだ`;
    }else person.travelTo(Math.floor(target.y)*world.width+Math.floor(target.x),dt,world);
    return true;
  }

  draw(ctx,game){
    for(const a of this.items){
      const species=ANIMAL_TYPES[a.kind],x=game.x+a.x*game.scale,y=game.y+a.y*game.scale;
      const r=Math.max(2,Math.min(species.role==='monster'?15:8,game.scale*species.size));
      if(x+r<0||y+r<0||x-r>game.w||y-r>game.h)continue;
      ctx.fillStyle='#203846';ctx.fillRect(x-r*1.15,y-r*.55,r*2.3,r*1.2);
      ctx.fillStyle=species.color;ctx.fillRect(x-r,y-r*.7,r*2,r*1.1);
      if(a.kind==='mammoth'){
        // Rounded back, long trunk and pale tusks at pixel-art resolution.
        ctx.fillStyle='#5d3629';ctx.fillRect(x-r*.65,y-r*1.35,r*1.1,r*.8);
        ctx.fillStyle=species.color;ctx.fillRect(x+r*.75,y-r*.25,r*.5,r*1.25);
        ctx.fillStyle='#e9dcc3';ctx.fillRect(x+r*.35,y+r*.15,r*.72,r*.16);
        ctx.fillRect(x+r*.55,y+r*.15,r*.2,r*.65);
      }
      if(a.kind==='shadowBeast'){
        // An original angular silhouette: stone plates and a bright amber eye.
        ctx.fillStyle='#111b29';ctx.fillRect(x-r*.9,y-r*1.35,r*1.8,r*.8);
        ctx.fillRect(x-r*1.55,y+r*.15,r*.7,r*.3);
        ctx.fillStyle='#6c808d';
        for(const offset of [-.7,-.2,.3,.75])ctx.fillRect(x+r*offset,y-r*1.5,r*.26,r*.48);
        ctx.fillStyle='#ffc879';ctx.fillRect(x+r*.55,y-r*.96,Math.max(1,r*.16),Math.max(1,r*.17));
      }
      if(a.kind==='cow'){
        ctx.fillStyle='#242d2e';ctx.fillRect(x-r*.75,y-r*.65,r*.55,r*.5);
        ctx.fillRect(x+r*.1,y-r*.1,r*.65,r*.45);
      }
      if(a.kind==='cat'){
        ctx.fillStyle='#9c542f';
        for(const stripe of [-.65,-.05,.55])ctx.fillRect(x+r*stripe,y-r*.7,Math.max(1,r*.19),r*.6);
        ctx.fillStyle=species.color;ctx.fillRect(x-r*.85,y-r*1.13,r*.5,r*.5);
        ctx.fillRect(x+r*.35,y-r*1.13,r*.5,r*.5);
      }
      if(a.kind==='monkey'||a.kind==='gorilla'){
        // The same primate silhouette makes the light and dark coats the distinction.
        ctx.fillStyle=species.color;ctx.fillRect(x-r*1.35,y-r*.45,r*.45,r*1.3);
        ctx.fillRect(x+r*.9,y-r*.45,r*.45,r*1.3);
        ctx.fillRect(x-r*.65,y-r*1.45,r*1.3,r*.8);
        ctx.fillStyle='#d2ae85';ctx.fillRect(x-r*.38,y-r*1.12,r*.76,r*.35);
      }
      ctx.fillStyle=species.habitat==='sea'?'#dfd8c1':'#2a3940';
      ctx.fillRect(x+r*.45,y-r*.35,Math.max(1,r*.25),Math.max(1,r*.25));
      if(species.habitat==='sea'){
        ctx.fillStyle=species.color;ctx.fillRect(x-r*1.55,y-r*.9,r*.55,r*1.6);
        if(a.landTime>0){ctx.fillStyle='#fff';ctx.fillRect(x-r,y-r*1.7,r*.4,r*.4);}
      }else if(a.kind==='turtle'){
        ctx.fillStyle='#334f3c';ctx.fillRect(x-r*.7,y-r*.8,r*1.4,r*.65);
      }else{
        ctx.fillStyle='#433e39';ctx.fillRect(x-r*.7,y+r*.4,r*.3,r*.5);ctx.fillRect(x+r*.5,y+r*.4,r*.3,r*.5);
      }
      if(a.ownerId){ctx.fillStyle='#f4d477';ctx.fillRect(x-r*.2,y-r*1.3,r*.4,r*.35);}
    }
  }
}
