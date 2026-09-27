import {World} from './world.js';
import {Human} from './human.js';
import {FoodSystem,MaterialSystem} from './resource.js';
import {BuildingSystem} from './building.js';
import {FamilySystem} from './family.js';
import {BALANCE} from './settings.js';

export const MAX_SAVE_BYTES=8*1024*1024;
const MAGIC='tenohira-world';
const fail=()=>{throw new Error('このファイルは読み込めません。対応する保存データを選んでください。');};
const number=(v,min,max,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max||(integer&&!Number.isInteger(v)))fail();return v;};
const list=(v,max)=>{if(!Array.isArray(v)||v.length>max)fail();return v;};
const boolean=v=>{if(typeof v!=='boolean')fail();return v;};
const text=(v,max)=>{if(typeof v!=='string'||v.length>max)fail();return v;};

/** A versioned world snapshot; runtime routes are reconstructed after validation. */
export function serializeGame(g){
  return JSON.stringify({format:MAGIC,version:2,seed:g.world.seed,terrain:Array.from(g.world.tiles),elevation:Array.from(g.world.elevation),elapsedSeconds:g.elapsedSeconds,
    nextId:g.nextId,deaths:g.deaths,oldAgeDeaths:g.oldAgeDeaths,
    food:g.food.items.map(f=>({cell:f.cell,amount:f.amount,timer:f.timer})),
    materials:g.materials.items.map(f=>({cell:f.cell,kind:f.kind,amount:f.amount,timer:f.timer})),
    buildings:{nextId:g.buildings.nextId,items:g.buildings.items.map(h=>({id:h.id,cell:h.cell,ownerId:h.ownerId,progress:h.progress,complete:h.complete}))},
    family:{time:g.family.time,tick:g.family.tick,births:g.family.births,news:g.family.news},
    people:g.people.map(p=>({id:p.id,x:p.x,y:p.y,sex:p.sex,age:p.age,hp:p.hp,hunger:p.hunger,
      deathAge:p.deathAge,mealTimer:p.mealTimer,meals:p.meals,wood:p.wood,stone:p.stone,
      homeId:p.home?.id??null,siteId:p.site?.id??null,spouseId:p.spouseId,
      parentIds:p.parentIds,children:p.children,ancestors:[...p.ancestors],nextBirthAt:p.nextBirthAt,dependent:p.dependent})),
  });
}

/** Build a separate, validated state. The caller commits only after user confirmation. */
export function restoreGame(json){
  if(typeof json!=='string'||new TextEncoder().encode(json).length>MAX_SAVE_BYTES)fail();
  let data;try{data=JSON.parse(json);}catch{fail();}
  if(!data||data.format!==MAGIC||![1,2].includes(data.version))fail();
  const world=new World(number(data.seed,0,4294967295,true));
  if(data.version===2){
    if(list(data.terrain,world.tiles.length).length!==world.tiles.length||list(data.elevation,world.tiles.length).length!==world.tiles.length)fail();
    for(let i=0;i<world.tiles.length;i++){world.tiles[i]=number(data.terrain[i],0,3,true);world.elevation[i]=number(data.elevation[i],-2,2);}
  }
  const food=new FoodSystem(world),materials=new MaterialSystem(world,food),buildings=new BuildingSystem(world,food,materials);
  const nextId=number(data.nextId,1,1e9,true),deaths=number(data.deaths,0,nextId,true),oldAgeDeaths=number(data.oldAgeDeaths,0,deaths,true);
  const elapsedSeconds=number(data.elapsedSeconds,0,1e10);
  const personId=v=>number(v,1,nextId-1,true);
  const nullableId=v=>v===null?null:personId(v);
  function restoreResources(saved,system,isMaterial){
    if(list(saved,world.tiles.length).length!==system.items.length)fail();
    const seen=new Set();
    for(const item of saved){
      if(!item)fail();const cell=number(item.cell,0,world.tiles.length-1,true),node=system.byCell.get(cell);
      if(!node||seen.has(cell)||(isMaterial&&item.kind!==node.kind))fail();seen.add(cell);
      node.amount=number(item.amount,0,isMaterial?(node.kind==='wood'?8:12):BALANCE.foodCapacity,true);
      node.timer=number(item.timer,0,isMaterial?BALANCE.woodRegrowSeconds:BALANCE.foodRegrowSeconds);
    }
    system.rebuild();
  }
  restoreResources(data.food,food,false);restoreResources(data.materials,materials,true);
  if(!data.buildings||!data.family)fail();
  buildings.nextId=number(data.buildings.nextId,1,1e9,true);
  const houses=new Map(),cells=new Set();
  for(const raw of list(data.buildings.items,5000)){
    if(!raw)fail();const id=number(raw.id,1,buildings.nextId-1,true),cell=number(raw.cell,0,world.tiles.length-1,true);
    if(houses.has(id)||cells.has(cell)||world.tiles[cell]!==2||food.byCell.has(cell)||materials.byCell.has(cell))fail();
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
    const p=new Human(id,x,y,raw.sex,0);
    p.age=number(raw.age,0,121);p.hp=number(raw.hp,0.000001,100);p.hunger=number(raw.hunger,0,100);
    p.deathAge=number(raw.deathAge,BALANCE.lifespanMin,BALANCE.lifespanMax);
    p.mealTimer=number(raw.mealTimer,0,BALANCE.mealSeconds);p.meals=number(raw.meals,0,1e9,true);
    p.wood=number(raw.wood,0,BALANCE.houseWood,true);p.stone=number(raw.stone,0,BALANCE.houseStone,true);
    p.parentIds=ids(raw.parentIds,2);p.children=ids(raw.children,10000);p.ancestors=new Set(ids(raw.ancestors,10000));
    if(p.parentIds.includes(id)||p.children.includes(id)||p.ancestors.has(id)||p.parentIds.some(a=>!p.ancestors.has(a)))fail();
    p.spouseId=nullableId(raw.spouseId);if(p.spouseId===id)fail();
    p.nextBirthAt=number(raw.nextBirthAt,0,1e10);p.dependent=boolean(raw.dependent);
    for(const [key,value] of [['home',raw.homeId],['site',raw.siteId]]){if(value===null)p[key]=null;else {number(value,1,buildings.nextId-1,true);p[key]=houses.get(value);if(!p[key])fail();}}
    if(p.home&&!p.home.complete)fail();
    if(p.site&&!p.site.complete&&p.site.ownerId!==id)fail();
    p.action='再開待ち';people.push(p);byId.set(id,p);
  }
  for(const p of people){
    if(p.spouseId){const spouse=byId.get(p.spouseId);if(!spouse||spouse.spouseId!==p.id||spouse.sex===p.sex||p.age<BALANCE.adultAge||spouse.age<BALANCE.adultAge||p.home!==spouse.home)fail();}
    for(const id of p.parentIds){const parent=byId.get(id);if(parent&&!parent.children.includes(p.id))fail();}
    for(const id of p.children){const child=byId.get(id);if(child&&!child.parentIds.includes(p.id))fail();}
  }
  for(const h of buildings.items){if(h.ownerId!==null&&!byId.has(h.ownerId))fail();if(!h.complete&&byId.get(h.ownerId)?.site!==h)fail();}
  const family=new FamilySystem(world,buildings);family.time=number(data.family.time,0,1e10);family.tick=number(data.family.tick,0,1);family.births=number(data.family.births,0,nextId,true);family.news=text(data.family.news,500);
  if(Math.abs(family.time-elapsedSeconds)>.01)fail();
  for(const p of people)if(p.spouseId&&family.related(p,byId.get(p.spouseId)))fail();
  family.syncOwners(people);
  return {world,food,materials,buildings,family,people,nextId,deaths,oldAgeDeaths,elapsedSeconds};
}
