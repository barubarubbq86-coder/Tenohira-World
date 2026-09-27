import {World} from './world.js';
import {Human} from './human.js';
import {FoodSystem,MaterialSystem} from './resource.js';
import {BuildingSystem} from './building.js';
import {FamilySystem} from './family.js';
import {BALANCE} from './settings.js';
import {SocietySystem} from './society.js';
import {MeteorSystem} from './meteor.js';

export const MAX_SAVE_BYTES=8*1024*1024;
const MAGIC='tenohira-world';
const fail=()=>{throw new Error('このファイルは読み込めません。対応する保存データを選んでください。');};
const number=(v,min,max,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))fail();return v;};
const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail();return v;};
const boolean=v=>{if(typeof v!=='boolean')fail();return v;};
const text=(v,max)=>{if(typeof v!=='string'||v.length>max)fail();return v;};

/** A versioned world snapshot; runtime routes are reconstructed after validation. */
export function serializeGame(g){
  return JSON.stringify({format:MAGIC,version:6,seed:g.world.seed,width:g.world.width,height:g.world.height,terrain:Array.from(g.world.tiles),elevation:Array.from(g.world.elevation),elapsedSeconds:g.elapsedSeconds,
    nextId:g.nextId,deaths:g.deaths,oldAgeDeaths:g.oldAgeDeaths,
    food:g.food.items.map(f=>({cell:f.cell,amount:f.amount,timer:f.timer})),
    materials:g.materials.items.map(f=>({cell:f.cell,kind:f.kind,amount:f.amount,timer:f.timer})),
    buildings:{nextId:g.buildings.nextId,items:g.buildings.items.map(h=>({id:h.id,cell:h.cell,ownerId:h.ownerId,progress:h.progress,complete:h.complete}))},
    family:{time:g.family.time,tick:g.family.tick,births:g.family.births,news:g.family.news},
    society:{nextVillageId:g.society.nextVillageId,nextKingdomId:g.society.nextKingdomId,nextShipId:g.society.nextShipId,ageSeconds:g.society.ageSeconds,villages:g.society.villages,kingdoms:g.society.kingdoms,invasions:g.society.invasions,ships:g.society.ships,news:g.society.news},
    craters:g.meteor?.craters??[],
    people:g.people.map(p=>({id:p.id,name:p.name,x:p.x,y:p.y,sex:p.sex,age:p.age,hp:p.hp,hunger:p.hunger,
      cargo:p.cargo,deathAge:p.deathAge,mealTimer:p.mealTimer,meals:p.meals,wood:p.wood,stone:p.stone,
      homeId:p.home?.id??null,siteId:p.site?.id??null,spouseId:p.spouseId,societyLock:p.societyLock===true,
      parentIds:p.parentIds,children:p.children,ancestors:[...p.ancestors],nextBirthAt:p.nextBirthAt,dependent:p.dependent})),
  });
}

/** Build a separate, validated state. The caller commits only after user confirmation. */
export function restoreGame(json){
  if(typeof json!=='string'||new TextEncoder().encode(json).length>MAX_SAVE_BYTES)fail();
  let data;try{data=JSON.parse(json);}catch{fail();}
  if(!data||data.format!==MAGIC||![1,2,3,4,5,6].includes(data.version))fail();
  const width=data.version>=5?number(data.width,240,480,true):240;
  const height=data.version>=5?number(data.height,160,320,true):160;
  if(![[240,160],[480,320]].some(([w,h])=>w===width&&h===height))fail();
  const world=new World(number(data.seed,0,4294967295,true),width,height);
  if(data.version>=2){
    if(list(data.terrain,world.tiles.length).length!==world.tiles.length||list(data.elevation,world.tiles.length).length!==world.tiles.length)fail();
    for(let i=0;i<world.tiles.length;i++){world.tiles[i]=number(data.terrain[i],0,4,true);world.elevation[i]=number(data.elevation[i],-2,2);}
  }
  const food=new FoodSystem(world),materials=new MaterialSystem(world,food),buildings=new BuildingSystem(world,food,materials);
  const nextId=number(data.nextId,1,1e9,true),deaths=number(data.deaths,0,nextId,true),oldAgeDeaths=number(data.oldAgeDeaths,0,deaths,true);
  // Old saves used one minute per year; retain their calendar date after migration.
  const timeScale=data.version<5?12:1;
  const elapsedSeconds=number(data.elapsedSeconds,0,1e10)*timeScale;
  const personId=v=>number(v,1,nextId-1,true);
  const nullableId=v=>v===null?null:personId(v);
  function restoreResources(saved,system,isMaterial){
    if(data.version<3&&list(saved,world.tiles.length).length!==system.items.length)fail();
    if(data.version>=3){list(saved,3000);system.items=[];system.byCell=new Map();}
    const seen=new Set();
    for(const item of saved){
      if(!item)fail();const cell=number(item.cell,0,world.tiles.length-1,true);
      let node=system.byCell.get(cell);
      if(data.version>=3){
        const x=cell%world.width+.5,y=Math.floor(cell/world.width)+.5;
        if(!world.walkable(x,y)||seen.has(cell)||(isMaterial&&(!['wood','stone'].includes(item.kind)||food.byCell.has(cell))))fail();
        node={cell,x,y,amount:0,timer:0};if(isMaterial)node.kind=item.kind;
        system.items.push(node);system.byCell.set(cell,node);
      }
      if(!node||seen.has(cell)||(isMaterial&&item.kind!==node.kind))fail();seen.add(cell);
      node.amount=number(item.amount,0,isMaterial?(node.kind==='wood'?8:12):BALANCE.foodCapacity,true);
      node.timer=number(item.timer,0,isMaterial?BALANCE.woodRegrowSeconds:BALANCE.foodRegrowSeconds);
    }
    system.rebuild();
  }
  restoreResources(data.food,food,false);restoreResources(data.materials,materials,true);if(data.version>=3&&food.items.length+materials.items.length>3000)fail();
  if(!data.buildings||!data.family)fail();
  buildings.nextId=number(data.buildings.nextId,1,1e9,true);
  const houses=new Map(),cells=new Set();
  for(const raw of list(data.buildings.items,5000)){
    if(!raw)fail();const id=number(raw.id,1,buildings.nextId-1,true),cell=number(raw.cell,0,world.tiles.length-1,true);
    if(houses.has(id)||cells.has(cell)||(world.tiles[cell]!==2&&world.tiles[cell]!==4)||food.byCell.has(cell)||materials.byCell.has(cell))fail();
    const cx=cell%world.width,cy=Math.floor(cell/world.width);
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
      const x=cx+dx,y=cy+dy;
      if(x>=0&&x<world.width&&y>=0&&y<world.height&&dx*dx+dy*dy<9&&cells.has(y*world.width+x))fail();
    }
    const h={id,cell,x:cell%world.width+.5,y:Math.floor(cell/world.width)+.5,ownerId:nullableId(raw.ownerId),progress:number(raw.progress,0,BALANCE.buildSeconds),complete:boolean(raw.complete)};
    if(h.complete&&h.progress!==BALANCE.buildSeconds)fail();
    houses.set(id,h);cells.add(cell);buildings.items.push(h);
  }
  const people=[],byId=new Map(),rawPeople=list(data.people,BALANCE.populationLimit);
  const ids=(values,max)=>{const out=list(values,max).map(personId);if(new Set(out).size!==out.length)fail();return out;};
  for(const raw of rawPeople){
    if(!raw)fail();const id=personId(raw.id),x=number(raw.x,0,world.width),y=number(raw.y,0,world.height);
    if(byId.has(id)||!world.walkable(x,y)||!['male','female'].includes(raw.sex))fail();
    const p=new Human(id,x,y,raw.sex,0);p.name=text(raw.name,40);
    p.age=number(raw.age,0,121);p.hp=number(raw.hp,0.000001,100);p.hunger=number(raw.hunger,0,100);
    p.deathAge=number(raw.deathAge,BALANCE.lifespanMin,BALANCE.lifespanMax);
    p.mealTimer=number(raw.mealTimer,0,BALANCE.mealSeconds);p.meals=number(raw.meals,0,1e9,true);
    p.wood=number(raw.wood,0,BALANCE.houseWood,true);p.stone=number(raw.stone,0,BALANCE.houseStone,true);
    p.parentIds=ids(raw.parentIds,2);p.children=ids(raw.children,10000);p.ancestors=new Set(ids(raw.ancestors,10000));
    if(p.parentIds.includes(id)||p.children.includes(id)||p.ancestors.has(id)||p.parentIds.some(a=>!p.ancestors.has(a)))fail();
    p.spouseId=nullableId(raw.spouseId);if(p.spouseId===id)fail();p.societyLock=raw.societyLock===undefined?false:boolean(raw.societyLock);
    p.nextBirthAt=number(raw.nextBirthAt,0,1e10)*timeScale;p.dependent=boolean(raw.dependent);
    for(const [key,value] of [['home',raw.homeId],['site',raw.siteId]]){if(value===null)p[key]=null;else {number(value,1,buildings.nextId-1,true);p[key]=houses.get(value);if(!p[key])fail();}}
    if(p.home&&!p.home.complete)fail();
    if(p.site&&!p.site.complete&&p.site.ownerId!==id)fail();
    if(data.version>=4){if(raw.cargo!==null&&!['food','wood','stone'].includes(raw.cargo))fail();p.cargo=raw.cargo;}
    p.action='再開待ち';people.push(p);byId.set(id,p);
  }
  for(const p of people){
    if(p.spouseId){const spouse=byId.get(p.spouseId);if(!spouse||spouse.spouseId!==p.id||spouse.sex===p.sex||p.age<BALANCE.adultAge||spouse.age<BALANCE.adultAge||p.home!==spouse.home)fail();}
    for(const id of p.parentIds){const parent=byId.get(id);if(parent&&!parent.children.includes(p.id))fail();}
    for(const id of p.children){const child=byId.get(id);if(child&&!child.parentIds.includes(p.id))fail();}
  }
  for(const h of buildings.items){if(h.ownerId!==null&&!byId.has(h.ownerId))fail();if(!h.complete&&byId.get(h.ownerId)?.site!==h)fail();}
  const family=new FamilySystem(world,buildings);family.time=number(data.family.time,0,1e10)*timeScale;family.tick=number(data.family.tick,0,1);family.births=number(data.family.births,0,nextId,true);family.news=text(data.family.news,500);
  if(Math.abs(family.time-elapsedSeconds)>.01)fail();
  for(const p of people)if(p.spouseId&&family.related(p,byId.get(p.spouseId)))fail();
  family.syncOwners(people);
  const society=new SocietySystem(world,buildings,food,materials,family);
  if(data.version>=4){
    const raw=data.society;if(!raw)fail();society.nextVillageId=number(raw.nextVillageId,1,1e9,true);society.nextKingdomId=number(raw.nextKingdomId,1,1e9,true);society.nextShipId=raw.nextShipId===undefined?1:number(raw.nextShipId,1,1e9,true);society.ageSeconds=raw.ageSeconds===undefined?elapsedSeconds:number(raw.ageSeconds,0,1e10)*timeScale;
    const kingdomIds=new Set(),villageIds=new Set(),farmCells=new Set(),villageHouses=new Set();
    for(const k of list(raw.kingdoms,2000)){const id=number(k.id,1,society.nextKingdomId-1,true);if(kingdomIds.has(id))fail();kingdomIds.add(id);const restored={id,name:text(k.name,40),leaderId:nullableId(k.leaderId)};if(k.nextSecessionAt!==undefined)restored.nextSecessionAt=number(k.nextSecessionAt,0,1e10)*timeScale;if(k.peaceUntil!==undefined)restored.peaceUntil=number(k.peaceUntil,0,1e10)*timeScale;if(k.cell!==undefined){const cell=number(k.cell,0,world.tiles.length-1,true);restored.cell=cell;restored.x=cell%world.width+.5;restored.y=Math.floor(cell/world.width)+.5;}if(k.capitalCell!==undefined){const cell=number(k.capitalCell,0,world.tiles.length-1,true);restored.capitalCell=cell;restored.castleCell=cell;restored.capitalX=cell%world.width+.5;restored.capitalY=Math.floor(cell/world.width)+.5;}if(k.castle){restored.castle={hp:number(k.castle.hp,0,1e9),maxHp:number(k.castle.maxHp,1,1e9)};}if(k.military){restored.military={soldiers:number(k.military.soldiers,0,1e9,true),attack:number(k.military.attack,0,1e9,true),defense:number(k.military.defense,0,1e9,true),food:number(k.military.food,0,9999,true),wood:number(k.military.wood,0,9999,true),stone:number(k.military.stone,0,9999,true)};}society.kingdoms.push(restored);}
    for(const v of list(raw.villages,2000)){
      const id=number(v.id,1,society.nextVillageId-1,true),cell=number(v.cell,0,world.tiles.length-1,true);
      if(villageIds.has(id)||!world.walkable(cell%world.width+.5,Math.floor(cell/world.width)+.5))fail();villageIds.add(id);
      const kingdomId=v.kingdomId===null?null:number(v.kingdomId,1,society.nextKingdomId-1,true);if(kingdomId!==null&&!kingdomIds.has(kingdomId))fail();
      const houseIds=list(v.houseIds,5000).map(h=>{number(h,1,buildings.nextId-1,true);if(!houses.get(h)?.complete||villageHouses.has(h))fail();villageHouses.add(h);return h;});
      const farmCell=v.farmCell===null?null:number(v.farmCell,0,world.tiles.length-1,true);
      if(farmCell!==null&&(farmCells.has(farmCell)||world.tiles[farmCell]!==2||cells.has(farmCell)||food.byCell.has(farmCell)||materials.byCell.has(farmCell)))fail();farmCells.add(farmCell);
      if(!v.stock)fail();const stock={};for(const key of ['food','wood','stone'])stock[key]=number(v.stock[key],0,9999,true);
      const restoredVillage={id,name:text(v.name,40),cell,x:cell%world.width+.5,y:Math.floor(cell/world.width)+.5,houseIds,kingdomId,kingdomLocked:v.kingdomLocked===undefined?false:boolean(v.kingdomLocked),leaderId:nullableId(v.leaderId),stock,farmCell};if(v.fortification!==undefined)restoredVillage.fortification=number(v.fortification,0,1e9);society.villages.push(restoredVillage);
    }
    if(raw.invasions!==undefined){
      society.invasions=list(raw.invasions,2000).filter(i=>i&&['kingdom','village'].includes(i.targetType)).map(i=>{
        const invasion={attackerId:number(i.attackerId,1,society.nextKingdomId-1,true),targetType:i.targetType,targetId:number(i.targetId,1,1e9,true),progress:number(i.progress,0,1)};
        if(data.version>=6){
          invasion.phase=['march','battle'].includes(i.phase)?i.phase:'battle';
          invasion.marchProgress=number(i.marchProgress,0,1);
          for(const key of ['fromX','toX'])invasion[key]=number(i[key],0,world.width);
          for(const key of ['fromY','toY'])invasion[key]=number(i[key],0,world.height);
          invasion.troopIds=list(i.troopIds,5).map(personId);
          if(new Set(invasion.troopIds).size!==invasion.troopIds.length)fail();
          invasion.startedAt=number(i.startedAt,0,society.ageSeconds);
          invasion.battleTime=i.battleTime===undefined?0:number(i.battleTime,0,1e8);
          invasion.supplySpent=i.supplySpent===undefined?0:number(i.supplySpent,0,1e8);
          for(const id of invasion.troopIds){const p=byId.get(id);if(!p)fail();p.invasionId=true;}
        }else{
          // Older wars had no marching party. Keep their battle in progress.
          const attacker=society.kingdoms.find(k=>k.id===invasion.attackerId);
          const target=invasion.targetType==='kingdom'
            ?society.kingdoms.find(k=>k.id===invasion.targetId)
            :society.villages.find(v=>v.id===invasion.targetId);
          const from=attacker&&society.kingdomCapitalPoint(attacker);
          const to=target&&(invasion.targetType==='kingdom'?society.kingdomCapitalPoint(target):target);
          invasion.phase='battle';invasion.marchProgress=1;
          invasion.fromX=from?.x??0;invasion.fromY=from?.y??0;
          invasion.toX=to?.x??0;invasion.toY=to?.y??0;
          invasion.troopIds=[];invasion.startedAt=society.ageSeconds;
          invasion.battleTime=0;invasion.supplySpent=0;
        }
        return invasion;
      });
    }
    if(raw.ships!==undefined){const aboard=new Set();society.ships=list(raw.ships,500).map(s=>{const passengerIds=s.passengerIds===undefined?[]:list(s.passengerIds,10).map(personId);for(const id of passengerIds){if(aboard.has(id)||!byId.has(id))fail();aboard.add(id);}return {id:number(s.id,1,society.nextShipId-1,true),kingdomId:number(s.kingdomId,1,society.nextKingdomId-1,true),x:number(s.x,0,world.width),y:number(s.y,0,world.height),startX:number(s.startX,0,world.width),startY:number(s.startY,0,world.height),targetX:number(s.targetX,0,world.width),targetY:number(s.targetY,0,world.height),progress:number(s.progress,0,1),duration:number(s.duration,1,1e5),passengerIds};});for(const ship of society.ships)for(const id of ship.passengerIds)byId.get(id).shipId=ship.id;}
    if(raw.news!==undefined)society.news=list(raw.news,200).map(item=>({time:number(item.time,0,1e10)*timeScale,text:text(item.text,200)}));
  }
  society.update(0,people,true);
  const meteor=new MeteorSystem();
  if(data.version>=6){
    meteor.craters=list(data.craters,1000).map(c=>{
      const x=number(c.x,0,world.width),y=number(c.y,0,world.height);
      const cells=list(c.cells,100).map(cell=>number(cell,0,world.tiles.length-1,true));
      if(new Set(cells).size!==cells.length)fail();
      return {x,y,cells,expiresAt:number(c.expiresAt,elapsedSeconds,elapsedSeconds+BALANCE.secondsPerYear)};
    });
  }
  return {world,food,materials,buildings,family,society,meteor,people,nextId,deaths,oldAgeDeaths,elapsedSeconds};
}

/** Surround a legacy world with editable sea while preserving its objects. */
export function expandLegacyWorld(state){
  if(state.world.width===480&&state.world.height===320)return state;
  const old=state.world,world=new World(old.seed,480,320);
  const dx=(world.width-old.width)/2,dy=(world.height-old.height)/2;
  world.tiles.fill(0);world.elevation.fill(.2);
  for(let y=0;y<old.height;y++)for(let x=0;x<old.width;x++){
    const source=y*old.width+x,target=(y+dy)*world.width+x+dx;
    world.tiles[target]=old.tiles[source];world.elevation[target]=old.elevation[source];
  }
  const moveCell=cell=>cell===null||cell===undefined?cell:(Math.floor(cell/old.width)+dy)*world.width+cell%old.width+dx;
  const movePoint=node=>{node.x+=dx;node.y+=dy;};
  const food=new FoodSystem(world);
  food.items=state.food.items.map(node=>({...node,cell:moveCell(node.cell),x:node.x+dx,y:node.y+dy}));
  food.byCell=new Map(food.items.map(node=>[node.cell,node]));food.rebuild();
  const materials=new MaterialSystem(world,food);
  materials.items=state.materials.items.map(node=>({...node,cell:moveCell(node.cell),x:node.x+dx,y:node.y+dy}));
  materials.byCell=new Map(materials.items.map(node=>[node.cell,node]));materials.rebuild();
  const buildings=state.buildings;
  buildings.world=world;buildings.food=food;buildings.materials=materials;
  for(const home of buildings.items){home.cell=moveCell(home.cell);movePoint(home);}
  const family=new FamilySystem(world,buildings);
  for(const key of ['time','tick','births','news'])family[key]=state.family[key];
  const society=state.society;
  Object.assign(society,{world,buildings,food,materials,family});
  for(const v of society.villages){v.cell=moveCell(v.cell);v.farmCell=moveCell(v.farmCell);movePoint(v);}
  for(const k of society.kingdoms){
    k.cell=moveCell(k.cell);k.capitalCell=moveCell(k.capitalCell);
    k.castleCell=moveCell(k.castleCell);
    if(Number.isFinite(k.x))movePoint(k);
    if(Number.isFinite(k.capitalX)){k.capitalX+=dx;k.capitalY+=dy;}
  }
  for(const ship of society.ships){
    movePoint(ship);ship.startX+=dx;ship.startY+=dy;
    ship.targetX+=dx;ship.targetY+=dy;
  }
  for(const p of state.people){
    movePoint(p);p.task=null;p.waypoint=null;p.path=null;p.destination=null;
  }
  society.update(0,state.people,true);
  return {...state,world,food,materials,buildings,family,society};
}
