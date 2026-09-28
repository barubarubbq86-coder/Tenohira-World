import {World} from './world.js';
import {Human} from './human.js';
import {FoodSystem,MaterialSystem} from './resource.js';
import {BuildingSystem} from './building.js';
import {FamilySystem} from './family.js';
import {BALANCE} from './settings.js';
import {SocietySystem} from './society.js';
import {TerrainEditor} from './terrain-editor.js';
import {GameAudio} from './audio.js';
import {MeteorSystem} from './meteor.js';
import {BlackHoleSystem} from './black-hole.js';
import {WeatherSystem} from './weather.js';
import {TornadoSystem} from './tornado.js';
import {AnimalSystem,ANIMAL_TYPES} from './animal.js';
import {currentEra,drawYard,drawFloatingHouse} from './era.js';
import {TownSystem} from './town.js';
import {GodSystem} from './god.js';
import {serializeGame,restoreGame,MAX_SAVE_BYTES} from './save.js';
const $=id=>document.getElementById(id);
class Game {
  constructor(){
    this.canvas=$('world');this.ctx=this.canvas.getContext('2d');this.people=[];this.nextId=1;this.mode='move';this.paused=false;this.speed=1;this.simBacklog=0;this.actualSpeed=null;this.speedMeasureAt=0;this.pointers=new Map();this.scale=1;this.x=0;this.y=0;this.last=0;this.followId=null;this.detailSociety=null;this.audio=new GameAudio();this.audio.onStatus=()=>this.updateAudioStatus();this.lastNews=null;
    this.regenerate();this.bind();new ResizeObserver(()=>this.resize()).observe(this.canvas);requestAnimationFrame(t=>this.frame(t));
  }
  regenerate(empty=false){
    if($('society-detail')?.open)$('society-detail').close();
    this.world=new World(crypto.getRandomValues(new Uint32Array(1))[0]);if(empty){this.world.tiles.fill(0);this.world.elevation.fill(.2);}this.people=[];this.nextId=1;this.selected=null;this.deaths=0;this.oldAgeDeaths=0;this.elapsedSeconds=0;this.simBacklog=0;this.actualSpeed=null;this.speedMeasureAt=0;this.speedMeasureSeconds=0;this.food=new FoodSystem(this.world);this.materials=new MaterialSystem(this.world,this.food);this.buildings=new BuildingSystem(this.world,this.food,this.materials);this.family=new FamilySystem(this.world,this.buildings);this.society=new SocietySystem(this.world,this.buildings,this.food,this.materials,this.family);this.meteor=new MeteorSystem();
    this.blackHoles=new BlackHoleSystem();this.weather=new WeatherSystem();this.tornado=new TornadoSystem();this.animals=new AnimalSystem();this.town=new TownSystem();this.gods=new GodSystem();this.lastNews=null;this.rebuildTerrain();
  }
  rebuildTerrain(){
    this.town?.clear();
    if(this.gods)this.gods.effects=[];
    this.societyRenderAt=0;
    this.editor=new TerrainEditor(this.world);
    this.terrain=document.createElement('canvas');this.terrain.width=this.world.width*4;this.terrain.height=this.world.height*4;this.terrainCtx=this.terrain.getContext('2d');
    // Build one bitmap instead of issuing tens of thousands of canvas calls.
    const image=this.terrainCtx.createImageData(this.terrain.width,this.terrain.height);
    const pixels=image.data,colors={
      '#348799':[52,135,153],'#256d82':[37,109,130],'#205b74':[32,91,116],
      '#d9cf9c':[217,207,156],'#c8c08e':[200,192,142],
      '#62935d':[98,147,93],'#85af6b':[133,175,107],'#7da567':[125,165,103],
      '#d6ad62':[214,173,98],'#c99d55':[201,157,85],
      '#d2d4bf':[210,212,191],'#a7b1a1':[167,177,161],'#8d9d8a':[141,157,138],
      '#34393d':[52,57,61],'#454b4d':[69,75,77],'#564b40':[86,75,64],'#645247':[100,82,71]
    };
    for(let i=0;i<this.world.tiles.length;i++){
      const x=i%this.world.width,y=Math.floor(i/this.world.width),t=this.world.tiles[i],h=this.world.elevation[i],n=this.world.hash(x,y);
      const color=colors[this.terrainColor(t,h,n)];
      for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){
        const p=((y*4+dy)*this.terrain.width+x*4+dx)*4;
        const dot=t===2&&n>.86&&dx===1&&dy<2;
        pixels[p]=dot?80:color[0];pixels[p+1]=dot?126:color[1];pixels[p+2]=dot?81:color[2];pixels[p+3]=255;
      }
    }
    this.terrainCtx.putImageData(image,0,0);
    $('seed').textContent=`#${String(this.world.seed).slice(-6)}`;this.updateCount();this.updateInfo();this.renderNews(false);this.fit();this.updateWeatherButtons();this.message('「人を置く」を選んで、陸地をタップ');
  }
  drawTerrainCell(i){
    const x=i%this.world.width,y=Math.floor(i/this.world.width),c=this.terrainCtx,t=this.world.tiles[i],h=this.world.elevation[i],n=this.world.hash(x,y);
    c.fillStyle=this.terrainColor(t,h,n);
    c.fillRect(x*4,y*4,4,4);
    if(t===2&&n>.86){c.fillStyle='#507e51';c.fillRect(x*4+1,y*4,1,2);}
  }
  terrainColor(t,h,n){
    if(t===0)return h>.41?'#348799':h>.33?'#256d82':'#205b74';
    if(t===1)return n>.5?'#d9cf9c':'#c8c08e';
    if(t===2)return h>.61?'#62935d':n>.5?'#85af6b':'#7da567';
    if(t===4)return n>.5?'#d6ad62':'#c99d55';
    if(t===5)return n>.5?'#454b4d':'#34393d';
    if(t===6)return n>.5?'#645247':'#564b40';
    return h>.79?'#d2d4bf':n>.5?'#a7b1a1':'#8d9d8a';
  }
  refreshLand(changed=[]){
    this.town.clear();
    const oldFood=this.food,oldMaterials=this.materials,changedSet=new Set(changed);
    this.food=new FoodSystem(this.world);this.materials=new MaterialSystem(this.world,this.food);
    const generatedFood=this.food.items,generatedMaterials=this.materials.items;
    this.food.items=[];this.food.byCell=new Map();this.materials.items=[];this.materials.byCell=new Map();
    const occupied=new Set([...this.buildings.items.map(h=>h.cell),...this.society.villages.map(v=>v.farmCell)]);let count=0;
    const add=(system,node)=>{if(count>=3000||occupied.has(node.cell)||!this.world.walkable(node.x,node.y))return;system.items.push(node);system.byCell.set(node.cell,node);occupied.add(node.cell);count++;};
    for(const n of oldFood.items)add(this.food,n);for(const n of oldMaterials.items)add(this.materials,n);
    for(const n of generatedFood)if(changedSet.has(n.cell))add(this.food,n);
    for(const n of generatedMaterials)if(changedSet.has(n.cell))add(this.materials,n);
    this.food.rebuild();this.materials.rebuild();
    this.buildings.food=this.food;this.buildings.materials=this.materials;
    const prior=this.family;this.family=new FamilySystem(this.world,this.buildings);
    for(const key of ['time','tick','births','news'])this.family[key]=prior[key];
    Object.assign(this.society,{food:this.food,materials:this.materials,family:this.family});this.society.update(0,this.people,true);
    for(const p of this.people)p.setTask(null);
    this.updateInfo();
  }
  nearestShore(x,y,limit=18){
    const w=this.world,bx=Math.floor(x),by=Math.floor(y);
    for(let radius=1;radius<=limit;radius++){
      let best=null,shortest=Infinity;
      for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
        if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
        const px=bx+dx,py=by+dy;
        if(px<0||py<0||px>=w.width||py>=w.height||!w.walkable(px+.5,py+.5))continue;
        const distance=Math.hypot(px+.5-x,py+.5-y);
        if(distance<shortest){shortest=distance;best={x:px+.5,y:py+.5};}
      }
      if(best)return best;
    }
    return null;
  }
  beginSwim(person){
    if(person.shipId||person.swimming)return;
    person.swimming=true;person.swimLeft=16;person.swimShore=this.nearestShore(person.x,person.y);
    person.home=null;person.site=null;person.societyLock=false;person.setTask(null);
  }
  afterLandLost(changed){
    const lost=new Set(changed),w=this.world;
    this.tornado.moss=this.tornado.moss.filter(m=>w.walkable(m.x,m.y));
    this.meteor.forgetCells(changed);
    const destroyed=this.buildings.items.filter(h=>lost.has(h.cell));
    if(destroyed.length){
      const removed=new Set(destroyed.map(h=>h.id));
      this.buildings.items=this.buildings.items.filter(h=>!removed.has(h.id));
      for(const p of this.people){if(p.home&&removed.has(p.home.id))p.home=null;if(p.site&&removed.has(p.site.id)){p.site=null;p.setTask(null);}}
    }
    const retained=[];
    for(const v of this.society.villages){
      v.houseIds=v.houseIds.filter(id=>this.buildings.items.some(h=>h.id===id));
      if(v.farmCell!==null&&lost.has(v.farmCell))v.farmCell=null;
      if(!w.walkable(v.x,v.y)){
        const shore=this.nearestShore(v.x,v.y);
        if(!shore)continue;
        v.x=shore.x;v.y=shore.y;v.cell=Math.floor(shore.y)*w.width+Math.floor(shore.x);
      }
      retained.push(v);
    }
    this.society.villages=retained;
    for(const k of this.society.kingdoms){
      if(k.capitalCell!==undefined&&lost.has(k.capitalCell))delete k.capitalCell;
      if(k.castleCell!==undefined&&lost.has(k.castleCell))delete k.castleCell;
      if(!w.walkable(k.x??-1,k.y??-1)){
        const village=retained.find(v=>v.kingdomId===k.id);
        if(village){k.x=village.x;k.y=village.y;k.cell=village.cell;}
      }
    }
    this.society.kingdoms=this.society.kingdoms.filter(k=>retained.some(v=>v.kingdomId===k.id)||k.manual&&w.walkable(k.x,k.y));
    const kingdoms=new Set(this.society.kingdoms.map(k=>k.id)),villages=new Set(retained.map(v=>v.id));
    this.society.invasions=this.society.invasions.filter(inv=>kingdoms.has(inv.attackerId)&&(inv.targetType==='kingdom'?kingdoms: villages).has(inv.targetId));
    for(const ship of this.society.ships)if(!kingdoms.has(ship.kingdomId)){
      for(const id of ship.passengerIds??[]){const p=this.people.find(person=>person.id===id);if(p){p.shipId=null;p.x=ship.x;p.y=ship.y;}}
      ship.done=true;
    }
    this.society.ships=this.society.ships.filter(ship=>!ship.done);
    for(const p of this.people)if(p.alive&&!p.shipId){
      if(!w.walkable(p.x,p.y))this.beginSwim(p);
      if(p.swimming&&p.swimShore&&!w.walkable(p.swimShore.x,p.swimShore.y))p.swimShore=this.nearestShore(p.x,p.y);
    }
    this.refreshLand(changed);
  }
  placeResource(x,y,kind){
    if(!this.world.walkable(x,y)){this.message('食料・木・石は砂浜・草原・砂漠に置けます');return false;}
    const cell=Math.floor(y)*this.world.width+Math.floor(x);
    if(this.buildings.items.some(h=>h.cell===cell)||this.society.villages.some(v=>v.farmCell===cell)){this.message('家・畑・建築予定地には置けません');return false;}
    const target=kind==='food'?this.food:this.materials,other=kind==='food'?this.materials:this.food;
    if(other.byCell.has(cell)||(target.byCell.has(cell)&&kind!=='food'&&target.byCell.get(cell).kind!==kind)){this.message('別の資源がある場所には置けません');return false;}
    const amount=kind==='food'?BALANCE.foodCapacity:kind==='wood'?8:12;
    let node=target.byCell.get(cell);
    if(!node){if(this.food.items.length+this.materials.items.length>=3000){this.message('資源は3000か所まで置けます');return false;}node={cell,x:Math.floor(x)+.5,y:Math.floor(y)+.5,amount,timer:0};if(kind!=='food')node.kind=kind;target.items.push(node);target.byCell.set(cell,node);}
    else{node.amount=amount;node.timer=0;}
    target.rebuild();this.updateInfo();this.message(`${{food:'食料',wood:'木',stone:'石'}[kind]}を置きました`);return true;
  }
  finishPaint(cancel=false){
    if(!this.editor.active)return;
    const cells=cancel?this.editor.cancel():this.editor.commit();for(const i of cells)this.drawTerrainCell(i);
    if(!cancel&&cells.length){this.meteor.forgetCells(cells);this.tornado.moss=this.tornado.moss.filter(m=>this.world.walkable(m.x,m.y));this.refreshLand(cells);this.message('地形を変更しました。資源や人を置いてみよう');}
  }
  resize(){
    const r=this.canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
    const nextW=Math.round(r.width*d),nextH=Math.round(r.height*d);
    if(this.canvas.width===nextW&&this.canvas.height===nextH&&this.dpr===d)return;
    const hadSize=this.w>0&&this.h>0&&this.minScale>0;
    const centerX=hadSize?(this.w/2-this.x)/this.scale:0;
    const centerY=hadSize?(this.h/2-this.y)/this.scale:0;
    const zoomLevel=hadSize?this.scale/this.minScale:1;
    this.w=r.width;this.h=r.height;this.dpr=d;
    if(this.canvas.width!==nextW)this.canvas.width=nextW;
    if(this.canvas.height!==nextH)this.canvas.height=nextH;
    this.minScale=Math.max(this.w/this.world.width,this.h/this.world.height);
    this.scale=this.minScale*Math.min(12,Math.max(1,zoomLevel));
    this.x=this.w/2-centerX*this.scale;this.y=this.h/2-centerY*this.scale;
    this.clamp();this.lastDraw=0;
  }
  fit(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;this.minScale=Math.max(this.w/this.world.width,this.h/this.world.height);this.scale=this.minScale;this.x=(this.w-this.world.width*this.scale)/2;this.y=(this.h-this.world.height*this.scale)/2;}
  zoom(f,px=this.w/2,py=this.h/2){const old=this.scale;this.scale=Math.max(this.minScale,Math.min(this.minScale*12,old*f));this.x=px-(px-this.x)*this.scale/old;this.y=py-(py-this.y)*this.scale/old;this.clamp();}
  // Keep the whole viewport inside the world, including after pinch and resize.
  clamp(){
    const minX=Math.min(0,this.w-this.world.width*this.scale);
    const minY=Math.min(0,this.h-this.world.height*this.scale);
    this.x=Math.max(minX,Math.min(0,this.x));
    this.y=Math.max(minY,Math.min(0,this.y));
  }
  message(text){$('message').textContent=text;}
  updateWeatherButtons(){
    for(const [id,on] of [['rain',this.weather.rain],['lava',this.weather.lava]]){
      $(id).classList.toggle('weather-on',on);$(id).setAttribute('aria-pressed',String(on));
    }
    $('rain').textContent=this.weather.rain?'☂ 雨を止める':'☂ 雨';
    $('lava').textContent=this.weather.lava?'♨ 溶岩雨を止める':'♨ 溶岩雨';
  }
  villageColor(v){const palette=['#ff4d6d','#00c2ff','#ffd166','#9b5de5','#06d6a0','#f15bb5','#ff7f11','#4d7cff'];return palette[(v.id-1)%palette.length];}
  kingdomColor(k){if(k.god)return '#f8e580';const palette=['#ff0054','#00b4d8','#fca311','#8338ec','#00b894','#e01e37','#3a86ff','#c9184a'];return palette[(k.id-1)%palette.length];}
  kingdomBounds(k){const villages=this.society.villages.filter(v=>v.kingdomId===k.id);const points=[];for(const v of villages){points.push({x:v.x,y:v.y});for(const id of v.houseIds){const h=this.buildings.items.find(item=>item.id===id);if(h)points.push({x:h.x,y:h.y});}}if(!points.length&&Number.isFinite(k.x)&&Number.isFinite(k.y))points.push({x:k.x,y:k.y});if(!points.length)return null;const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return {minX:Math.min(...xs)-3,maxX:Math.max(...xs)+3,minY:Math.min(...ys)-3,maxY:Math.max(...ys)+3};}
  kingdomCapital(k){if(Number.isFinite(k.capitalX)&&Number.isFinite(k.capitalY)&&this.world.walkable(k.capitalX,k.capitalY))return {x:k.capitalX,y:k.capitalY};if(Number.isFinite(k.x)&&Number.isFinite(k.y)&&this.world.walkable(k.x,k.y))return {x:k.x,y:k.y};const b=this.kingdomBounds(k);if(!b)return null;for(let radius=0;radius<=12;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const x=(b.minX+b.maxX)/2+dx,y=(b.minY+b.maxY)/2+dy;if(this.world.walkable(x,y))return {x,y};}return null;}
  kingdomPopulation(k){return this.people.filter(p=>p.kingdomId===k.id).length;}
  kingdomCastleTier(k){const pop=this.kingdomPopulation(k);return pop>=40?3:pop>=16?2:1;}
  focusPerson(person){if(!person||!person.alive)return false;this.selected=person;this.followId=person.id;this.centerOn(person);this.updateInfo();this.message(`${person.name}を追跡中。「追跡を解除」で止められます`);return true;}
  centerOn(person){if(!this.w)return;const ship=this.society.ships.find(s=>s.id===person.shipId);this.x=this.w/2-(ship?.x??person.x)*this.scale;this.y=this.h/2-(ship?.y??person.y)*this.scale;this.clamp();}
  stopFollow(){this.followId=null;this.message('追跡を解除しました');}
  updateFollow(){if(this.followId===null)return;const person=this.people.find(p=>p.id===this.followId);if(!person||!person.alive){this.followId=null;return;}this.centerOn(person);}
  societyAt(x,y){
    const overview=this.scale<=this.minScale*2.5;
    if(overview){
      for(const k of this.society.kingdoms){const b=this.kingdomBounds(k);if(!b)continue;const cx=(b.minX+b.maxX)/2,cy=b.minY-2;if(Math.hypot(x-cx,y-cy)<Math.max(5,10/this.scale))return {type:'kingdom',id:k.id};}
      for(const v of this.society.villages.filter(v=>v.kingdomId===null))if(Math.hypot(x-v.x,y-(v.y-1.5))<Math.max(5,10/this.scale))return {type:'village',id:v.id};
    }else{
      for(const v of this.society.villages)if(Math.hypot(x-v.x,y-(v.y-2.25))<Math.max(5,12/this.scale))return {type:'village',id:v.id};
    }
    return null;
  }
  dropSocietyAt(person,x,y){
    const village=this.society.villages.slice().sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)).find(v=>Math.hypot(v.x-x,v.y-y)<=BALANCE.villageRadius);
    if(village){if(person.home){person.home.ownerId=null;person.home=null;}person.societyLock=true;person.villageId=village.id;person.kingdomId=village.kingdomId;person.country=this.society.kingdoms.find(k=>k.id===village.kingdomId)?.name??'アソス';return village;}
    for(const kingdom of this.society.kingdoms){const b=this.kingdomBounds(kingdom);if(!b||x<b.minX||x>b.maxX||y<b.minY||y>b.maxY)continue;const nearest=this.society.villages.filter(v=>v.kingdomId===kingdom.id).sort((a,c)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(c.x-x,c.y-y))[0];if(nearest){if(person.home){person.home.ownerId=null;person.home=null;}person.societyLock=true;person.villageId=nearest.id;person.kingdomId=kingdom.id;person.country=kingdom.name;return nearest;}}
    return null;
  }
  openSocietyDetails(type,id){const society=this.society[type==='kingdom'?'kingdoms':'villages'].find(item=>item.id===id);if(!society)return;this.detailSociety={type,id};this.renderSocietyDetails();const panel=$('society-detail');if(!panel.open)panel.show();}
  renderSocietyDetails(){
    const state=this.detailSociety;
    if(!state)return;
    const society=this.society[state.type==='kingdom'?'kingdoms':'villages'].find(item=>item.id===state.id);
    if(!society)return;
    const isKingdom=state.type==='kingdom';
    const leader=this.people.find(p=>p.id===society.leaderId);
    const population=isKingdom?this.kingdomPopulation(society):this.society.members(society,this.people).length;
    const owner=isKingdom?society:this.society.kingdoms.find(k=>k.id===society.kingdomId);
    $('society-detail-title').textContent=`${society.god?'✨ 神の国':isKingdom?'♛ 国':'⌂ 集落'}：${society.name}`;
    $('society-name').value=society.name;
    $('society-detail-kind').textContent=isKingdom?`人口 ${population}人 ／ 城レベル ${this.kingdomCastleTier(society)}`:`人口 ${population}人 ／ 家 ${society.houseIds.length}軒`;
    const stock=isKingdom?this.society.kingdomStock(society.id):society.stock;
    $('society-detail-stock').textContent=`備蓄　食料${stock.food}・木${stock.wood}・石${stock.stone}`;
    $('society-detail-military').textContent=isKingdom?(()=>{const m=society.military??{soldiers:0,attack:0,defense:0},castle=society.castle??{hp:0,maxHp:0};return `兵力 ${m.soldiers}人 ／ 攻撃 ${m.attack} ／ 防御 ${m.defense} ／ 城の耐久値 ${Math.ceil(castle.hp)}/${castle.maxHp}`;})():`集落の守備耐久値 ${Math.ceil(society.fortification??(50+society.houseIds.length*5))}`;
    $('god-detail').hidden=!society.god;
    if(society.god)$('god-toggle').textContent=society.godActive?'神の行動を止める':'神の行動を再開';
    const targetSelect=$('invasion-target');targetSelect.replaceChildren();
    if(owner){
      for(const k of this.society.kingdoms){if(k.id===owner.id)continue;const option=document.createElement('option');option.value=`kingdom:${k.id}`;option.textContent=`国：${k.name}`;targetSelect.append(option);}
      for(const v of this.society.villages){if(v.kingdomId===owner.id)continue;const option=document.createElement('option');option.value=`village:${v.id}`;option.textContent=`集落：${v.name}`;targetSelect.append(option);}
    }
    $('society-invasion-source').textContent=!owner?'この集落には所属国がありません。所属国を決めると侵攻できます。':targetSelect.options.length?`${owner.name}から、選んだ相手に侵攻します。`:'侵攻できる相手はまだいません。';
    targetSelect.disabled=!owner||!targetSelect.options.length;
    $('society-start-invasion').disabled=targetSelect.disabled;
    $('society-kingdom-section').hidden=isKingdom;
    if(!isKingdom){
      $('society-current-kingdom').textContent=`現在：${owner?.name??'独立集落'}`;
      const select=$('society-kingdom-select');select.replaceChildren();
      const independent=document.createElement('option');independent.value='';independent.textContent='独立集落';select.append(independent);
      for(const k of this.society.kingdoms){const option=document.createElement('option');option.value=String(k.id);option.textContent=k.name;select.append(option);}
      select.value=society.kingdomId===null?'':String(society.kingdomId);
    }
    $('society-leader-current').textContent=leader?`現在の長：${leader.name}`:'長はまだ決まっていません。';
    $('society-leader-name').value=leader?.name??'';
    $('society-leader-name').disabled=!leader;
    $('society-save-leader').disabled=!leader;
    $('society-focus-leader').disabled=!leader;
  }
  updateCount(){$('population').replaceChildren(document.createTextNode(`${this.people.length} `));const s=document.createElement('small');s.textContent='人';$('population').append(s);}
  spawn(x,y,sex,age=20){if(!Number.isInteger(age)||age<0||age>120){this.message('年齢は0〜120歳の整数で入力してね');return {ok:false,reason:'年齢が範囲外'};}if(!this.world.walkable(x,y)){this.message('砂浜・草原・砂漠に置いてね');return {ok:false,reason:'陸地を選んでください'};}if(this.people.length>=BALANCE.populationLimit){this.message('この試作では500人まで置けます');return {ok:false,reason:'上限500人'};}
    const selected=sex==='random'?(Math.random()<.5?'male':'female'):sex;const p=new Human(this.nextId++,x,y,selected,age);this.people.push(p);this.society.update(0,this.people,true);this.updateCount();this.message(`${p.name}（${p.sex==='male'?'男':'女'}）が生まれました`);return {ok:true,name:p.name};}
  addChild(x,y,sex){const p=new Human(this.nextId++,x,y,sex,0);this.people.push(p);return p;}
  inspect(x,y){
    const radius=22/this.scale;
    const nearby=this.people.filter(p=>!p.shipId&&Math.hypot(p.x-x,p.y-y)<radius)
      .sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)||a.id-b.id);
    const current=nearby.indexOf(this.selected);
    this.selected=nearby.length?nearby[(current+1)%nearby.length]:null;this.updateInfo();
    if(!nearby.length){const animal=this.animals.items.find(a=>Math.hypot(a.x-x,a.y-y)<radius);this.message(animal?`${ANIMAL_TYPES[animal.kind].name}${animal.ownerId?' · 飼い主 '+(this.people.find(p=>p.id===animal.ownerId)?.name??'なし'):''}`:'人や動物をタップすると、状態を見られます');}
    else if(nearby.length>1)this.message('同じ場所をもう一度タップすると、別の人を選べます');
  }
  updateInfo(){
    const p=this.selected,panel=$('person');panel.hidden=!p;
    if(p){$('person-name').textContent=p.name+'（'+(p.sex==='male'?'男':'女')+'）';$('person-action').textContent=p.action;
      $('health').value=p.hp;$('fullness').value=p.fullness;$('person-age').textContent=Math.floor(p.age);
      $('health-value').textContent=Math.ceil(p.hp);$('fullness-value').textContent=Math.ceil(p.fullness);
      const village=this.society.villageFor(p),kingdom=this.society.kingdoms.find(k=>k.id===village?.kingdomId);$('affiliation').textContent=`${village?.name??'集落なし'} ／ ${kingdom?.name??'国なし'}${village?.leaderId===p.id?' ／ 集落の長':''}${kingdom?.leaderId===p.id?' ／ 国王':''}`;
      $('meals').textContent=p.meals;$('wood').textContent=p.wood;$('stone').textContent=p.stone;$('home').textContent=p.home?`家${p.home.id}`:p.site?'建築中':'なし';
      $('spouse').textContent=p.spouseId?`アソス${p.spouseId}`:'なし';$('parents').textContent=p.parentIds.length?p.parentIds.map(id=>`アソス${id}`).join('・'):'なし';$('children').textContent=p.children.length?`${p.children.length}人（${p.children.slice(-6).map(id=>`アソス${id}`).join('・')}${p.children.length>6?' ほか':''}）`:'なし';
    }
    const months=Math.floor(this.elapsedSeconds/BALANCE.secondsPerYear*12);
    const day=Math.floor(this.elapsedSeconds%60/2);
    $('world-time').textContent=`${Math.floor(months/12)}年 ${months%12}か月 ${day}日`;
    $('era-label').textContent=currentEra(this.elapsedSeconds).label;
    $('food-count').textContent=this.food.total;$('speed-label').textContent=`${this.speed}倍速`;
    $('speed-actual').textContent=this.paused?'一時停止中':this.actualSpeed===null?'実効速度を計測中':`実際 ${this.actualSpeed.toFixed(1)}倍`;
    $('deaths').textContent=this.deaths;$('old-age-deaths').textContent=this.oldAgeDeaths;$('houses').textContent=this.buildings.total;$('births').textContent=this.family.births;$('couples').textContent=this.people.filter(p=>p.spouseId).length/2;$('family-news').textContent=this.family.news;
    const now=performance.now();
    if(!this.societyRenderAt||now-this.societyRenderAt>=1000){this.societyRenderAt=now;this.renderSocieties();}
  }
  updateAudioStatus(){
    const button=$('music');
    if(!button)return;
    const labels={waiting:'♫ 音楽を再生',loading:'♫ 読み込み中',playing:'♫ 音楽 ON',paused:'♫ 一時停止中',off:'♫ 音楽 OFF',error:'♫ 再生できません · タップで再試行'};
    button.textContent=labels[this.audio.status]??labels.waiting;
    button.setAttribute('aria-pressed',String(this.audio.enabled));
  }
  renamePerson(){if(!this.selected)return;const next=prompt('人の名前',this.selected.name);if(next?.trim()){this.selected.name=next.trim().slice(0,40);this.updateInfo();this.renderSocieties();}}
  renderSocieties(){
    const root=$('society-list');root.replaceChildren();
    const name=id=>this.people.find(p=>p.id===id)?.name??'成人不在';
    const row=(title,detail,edit,color)=>{const box=document.createElement('div');box.className='society-row';if(color)box.style.borderLeft=`4px solid ${color}`;const strong=document.createElement('button');strong.type='button';strong.className='society-link';strong.textContent=title;strong.onclick=edit;const p=document.createElement('p');p.textContent=detail;box.append(strong,p);if(edit){const button=document.createElement('button');button.type='button';button.textContent='詳細・編集';button.onclick=edit;box.append(button);}root.append(box);};
    const kingdoms=()=>{for(const k of [...this.society.kingdoms].sort((a,b)=>a.name.localeCompare(b.name,'ja'))){const stock=this.society.kingdomStock(k.id),pop=this.kingdomPopulation(k),m=k.military??{soldiers:0,attack:0,defense:0},castle=k.castle??{hp:0,maxHp:0};row(`${k.god?'✨':'♛'} ${k.name} · ${pop}人`,`国王：${name(k.leaderId)} ／ 兵力${m.soldiers}人・攻撃${m.attack}・防御${m.defense} ／ 城耐久${Math.ceil(castle.hp)}/${castle.maxHp} ／ 備蓄：食料${stock.food}・木${stock.wood}・石${stock.stone}${k.god?` ／ 神の行動${k.godActive?'中':'停止中'}`:''}`,()=>this.openSocietyDetails('kingdom',k.id),this.kingdomColor(k));}};
    const villages=()=>{for(const v of [...this.society.villages].sort((a,b)=>a.name.localeCompare(b.name,'ja'))){const pop=this.society.members(v,this.people).length,k=this.society.kingdoms.find(k=>k.id===v.kingdomId);row(`${v.name} · ${pop}人 · ${v.houseIds.length}軒`,`${k?.name??'独立集落'} ／ 長：${name(v.leaderId)} ／ 食料${v.stock.food}・木${v.stock.wood}・石${v.stock.stone}${v.farmCell===null?' ／ 畑を作れる草原が必要':' ／ 畑あり'}`,()=>this.openSocietyDetails('village',v.id),this.villageColor(v));}};
    const order=$('society-sort').value;
    if(order==='village-first'||order==='village-only')villages();
    if(order==='kingdom-first'||order==='village-first'||order==='kingdom-only')kingdoms();
    if(order==='kingdom-first')villages();
    if(!root.childElementCount)row('表示する集落・国はまだありません','家が増えると集落や国ができます。');
  }
  renderNews(playSound=true){
    const events=this.society.news;
    const latest=events.at(-1)??null;
    if(latest===this.lastNews)return;
    const previous=events.indexOf(this.lastNews);
    if(playSound&&latest&&previous<events.length-1&&!latest.text.startsWith('隕石'))this.audio.playEvent();
    this.lastNews=latest;
    const root=$('society-news');root.replaceChildren();
    if(!events.length){const item=document.createElement('li');item.textContent='ニュースはまだありません。';root.append(item);return;}
    for(const event of [...events].reverse()){
      const item=document.createElement('li'),time=document.createElement('time');
      const months=Math.floor(event.time/BALANCE.secondsPerYear*12);
      time.textContent=`${Math.floor(months/12)}年${months%12}か月`;
      item.append(time,document.createTextNode(event.text));root.append(item);
    }
  }
  cancelHold(){if(this.holdTimer){clearTimeout(this.holdTimer);this.holdTimer=null;}}
  setPaused(paused){this.paused=paused;this.simBacklog=0;this.actualSpeed=null;this.speedMeasureAt=0;this.audio.setPaused(paused);$('pause').textContent=paused?'▷ 再開':'Ⅱ 一時停止';$('pause').setAttribute('aria-pressed',String(paused));}
  saveFile(){
    try{
      this.finishPaint(false);const content=serializeGame(this);if(new TextEncoder().encode(content).length>MAX_SAVE_BYTES)throw new Error('保存データが大きすぎます');
      const url=URL.createObjectURL(new Blob([content],{type:'application/json'})),a=document.createElement('a');
      a.href=url;a.download=`tenohira-world-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
      this.message('保存ファイルのダウンロードを開始しました');
    }catch{this.message('保存できませんでした。もう一度お試しください');}
  }
  async readSave(file){
    if(!file)return;
    $('load-file').disabled=true;
    try{
      if(file.size>MAX_SAVE_BYTES)throw new Error('ファイルは8MBまでです');
      const state=restoreGame(await file.text());
      this.pendingLoad=state;this.loadWasPaused=this.paused;this.setPaused(true);
      const years=Math.floor(state.elapsedSeconds/BALANCE.secondsPerYear);
      $('load-summary').textContent=`${years}年経過・人口${state.people.length}人の世界を読み込みます。現在の世界は置き換わります。必要なら「戻る」を押して保存してください。`;
      $('load-confirm').showModal();
    }catch{this.message('読み込めませんでした。対応する保存ファイルを選んでください');}
    finally{$('load-file').disabled=false;$('load-input').value='';}
  }
  setMode(mode){
    this.cancelHold();this.dragPerson=null;this.finishPaint(true);this.mode=mode;
    for(const m of ['move','place','land','resource','village','kingdom','god','invasion','independence','ship','meteor','hole-people','hole-land','hole-all','volcano','reverse-volcano','lightning','wind','tornado','strong-tornado','moss','animal']){$(m).classList.toggle('selected',m===mode);$(m).setAttribute('aria-pressed',String(m===mode));}
    $('brush-control').hidden=mode!=='land';$('society-control').hidden=!['village','kingdom'].includes(mode);$('clear-map').hidden=mode!=='land';$('terrain-control').hidden=mode!=='land';$('resource-control').hidden=mode!=='resource';
    this.message(mode==='tornado'||mode==='strong-tornado'?'地図をスワイプで台風を出す。台風をタップすると小さくなり、人を解放':mode==='moss'?'陸地をタップでコケを置く。再タップで取り除く':mode==='animal'?'動物の種類を選んで地図をタップ':mode==='god'?'集落から離れた陸地をタップして神の国を作る':mode==='lava'?'溶岩雨が降っています。地図をタップで降る場所を変更':mode==='volcano'?'地図をタップ。陸は焦げ、水は黒曜石の島になります':mode==='reverse-volcano'?'陸地をタップすると周囲の海へ土地が広がります':mode==='lightning'?'落雷地点をタップ':mode==='wind'?'地図をスワイプして風向きを決めます':mode.startsWith('hole-')?'地図をタップで出現。同じ穴をもう一度タップすると消えます':mode==='meteor'?'落下地点をタップ。周囲の人と資源に被害が出ます':mode==='land'?'指で地形を描く · 人や家のある場所は保護されます':mode==='village'?'タップした場所に集落を作ります':mode==='kingdom'?'タップした場所に国を作ります':mode==='invasion'?'侵攻する国か、その国の集落をタップします':mode==='independence'?'未開拓の陸地をタップして独立集落を作ります':mode==='ship'?'海を越えた陸地をタップして船を出します':mode==='resource'?'資源を選び、陸地をタップして置こう':mode==='move'?'指で移動 · 2本指で拡大縮小':'砂浜・草原・砂漠をタップして、人を置こう');
  }
  clearMap(){
    this.finishPaint(true);this.pointers.clear();this.regenerate(true);$('terrain').value='2';this.setMode('land');
    this.message('海だけの世界になりました。指で陸地を描いてみよう');
  }
  bind(){
    document.addEventListener('visibilitychange',()=>{this.last=0;this.simBacklog=0;this.speedMeasureAt=0;if(!document.hidden&&this.audio.enabled&&(this.audio.status!=='playing'||this.audio.music.paused||this.audio.context?.state==='suspended'))this.audio.resume();});
    document.addEventListener('pointerdown',e=>{if(!e.target.closest('#music'))this.audio.unlock();});
    document.addEventListener('keydown',()=>this.audio.unlock());
    $('society-sort').onchange=()=>this.renderSocieties();
    $('music').onclick=()=>{
      const stop=this.audio.enabled&&['playing','loading','paused'].includes(this.audio.status);
      this.audio.setEnabled(!stop);
    };
    for(const mode of ['move','place','land','resource','village','kingdom','god','invasion','independence','ship','meteor','hole-people','hole-land','hole-all','volcano','reverse-volcano','lightning','wind','tornado','strong-tornado','moss','animal'])$(mode).onclick=()=>this.setMode(mode);
    $('god-toggle').onclick=()=>{const state=this.detailSociety;if(state?.type!=='kingdom')return;const god=this.society.kingdoms.find(k=>k.id===state.id&&k.god);if(!god)return;god.godActive=!god.godActive;if(god.godActive)god.godNextAt=this.elapsedSeconds+40;this.renderSocietyDetails();this.renderSocieties();this.message(god.godActive?'神の行動を再開しました':'神の行動を止めました');};
    $('rain').onclick=()=>{this.message(this.weather.toggleRain());this.updateWeatherButtons();};
    $('lava').onclick=()=>{
      const cx=(this.w/2-this.x)/this.scale,cy=(this.h/2-this.y)/this.scale;
      this.message(this.weather.toggleLava(cx,cy));
      if(this.weather.lava)this.setMode('lava');else if(this.mode==='lava')this.setMode('move');
      this.updateWeatherButtons();
    };
    $('clear-map').onclick=()=>{this.finishPaint(true);this.clearWasPaused=this.paused;this.setPaused(true);$('clear-confirm').showModal();};
    const cancelClear=()=>{this.setPaused(this.clearWasPaused);$('clear-confirm').close();};
    $('clear-cancel').onclick=cancelClear;$('clear-confirm').addEventListener('cancel',e=>{e.preventDefault();cancelClear();});
    $('clear-yes').onclick=()=>{this.clearMap();this.setPaused(this.clearWasPaused);$('clear-confirm').close();};
    $('close-person').onclick=()=>{this.selected=null;this.updateInfo();};
    $('rename-person').onclick=()=>this.renamePerson();
    $('society-detail-close').onclick=()=>$('society-detail').close();
    $('society-detail').addEventListener('keydown',e=>{if(e.key==='Escape')$('society-detail').close();});
    $('society-save-name').onclick=()=>{
      const state=this.detailSociety;if(!state)return;
      const name=$('society-name').value.trim();
      const renamed=state.type==='kingdom'?this.society.renameKingdom(state.id,name):this.society.renameVillage(state.id,name);
      if(renamed){this.society.update(0,this.people,true);this.renderSocieties();this.renderSocietyDetails();this.message('名前を変更しました');}
    };
    $('society-start-invasion').onclick=()=>{
      const state=this.detailSociety;if(!state)return;
      const selected=this.society[state.type==='kingdom'?'kingdoms':'villages'].find(item=>item.id===state.id);
      const attackerId=state.type==='kingdom'?selected?.id:selected?.kingdomId;
      const [targetType,targetValue]=$('invasion-target').value.split(':');
      if(attackerId&&this.society.startInvasion(attackerId,targetType,Number(targetValue),this.people)){
        $('society-detail').close();this.message('侵攻を開始しました');
      }else this.message('兵力が不足しているか、侵攻できない相手です');
    };
    $('society-assign-kingdom').onclick=()=>{
      const state=this.detailSociety;if(!state||state.type!=='village')return;
      const value=$('society-kingdom-select').value,kingdomId=value===''?null:Number(value);
      if(this.society.assignVillage(state.id,kingdomId)){
        this.society.update(0,this.people,true);this.renderSocieties();this.renderSocietyDetails();
        this.message(kingdomId===null?'集落を独立させました':'集落の所属国を変更しました');
      }
    };
    $('society-focus-leader').onclick=()=>{
      const state=this.detailSociety;if(!state)return;
      const society=this.society[state.type==='kingdom'?'kingdoms':'villages'].find(item=>item.id===state.id);
      const leader=this.people.find(p=>p.id===society?.leaderId);
      if(leader){$('society-detail').close();this.focusPerson(leader);}
    };
    $('society-stop-follow').onclick=()=>this.stopFollow();
    $('society-save-leader').onclick=()=>{
      const state=this.detailSociety;if(!state)return;
      const society=this.society[state.type==='kingdom'?'kingdoms':'villages'].find(item=>item.id===state.id);
      const leader=this.people.find(p=>p.id===society?.leaderId),name=$('society-leader-name').value.trim();
      if(leader&&name){leader.name=name.slice(0,40);this.renderSocieties();this.renderSocietyDetails();this.message(`${leader.name}の名前を更新しました`);}
    };
    $('plus').onclick=()=>this.zoom(1.4);$('minus').onclick=()=>this.zoom(1/1.4);$('fit').onclick=()=>this.fit();
    $('pause').onclick=()=>this.setPaused(!this.paused);$('speed').onclick=()=>{this.speed=this.speed===1?2:this.speed===2?5:this.speed===5?10:1;this.actualSpeed=null;this.speedMeasureAt=0;this.audio.setSpeed(this.speed);this.updateInfo();this.message(`${this.speed}倍速を設定。実際の速度は数秒後に表示します`);};
    $('save-file').onclick=()=>this.saveFile();$('load-file').onclick=()=>$('load-input').click();$('load-input').onchange=e=>this.readSave(e.target.files[0]);
    const cancelLoad=()=>{this.pendingLoad=null;this.setPaused(this.loadWasPaused);$('load-confirm').close();};
    $('load-cancel').onclick=cancelLoad;$('load-confirm').addEventListener('cancel',e=>{e.preventDefault();cancelLoad();});
    $('load-yes').onclick=()=>{if(!this.pendingLoad)return;$('society-detail').close();Object.assign(this,this.pendingLoad);this.pendingLoad=null;this.selected=null;this.pointers.clear();this.lastNews=null;this.setPaused(true);this.rebuildTerrain();this.setMode('move');$('load-confirm').close();this.message('読み込みました。「再開」で続きを遊べます');};
    $('regenerate').onclick=()=>$('confirm').showModal();$('cancel').onclick=()=>$('confirm').close();$('yes').onclick=()=>{this.regenerate();this.setMode('move');$('confirm').close();};
    const point=e=>{const r=this.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    this.canvas.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      this.canvas.setPointerCapture(e.pointerId);const p=point(e);this.pointers.set(e.pointerId,p);
      if(this.pointers.size===1){this.gestureMulti=false;this.start=p;this.moved=false;this.cancelHold();if(this.mode==='move'||this.mode==='place'){const wx=(p.x-this.x)/this.scale,wy=(p.y-this.y)/this.scale,person=this.people.filter(h=>Math.hypot(h.x-wx,h.y-wy)<22/this.scale).sort((a,b)=>Math.hypot(a.x-wx,a.y-wy)-Math.hypot(b.x-wx,b.y-wy))[0];if(person)this.holdTimer=setTimeout(()=>{this.holdTimer=null;if(person.alive&&this.pointers.size===1&&!this.moved){this.dragPerson=person;this.dragPoint=p;this.selected=person;this.updateInfo();this.message('指を動かして、陸地で離すと人を移動できます');}},550);}if(this.mode==='land'){const terrain=Number($('terrain').value),protectedCells=new Set([...this.buildings.items.map(h=>h.cell),...this.society.villages.map(v=>v.farmCell)]);if(terrain===0||terrain===3)for(const person of this.people)protectedCells.add(person.cell(this.world));this.editor.begin((p.x-this.x)/this.scale,(p.y-this.y)/this.scale,Number($('brush').value),terrain,protectedCells);}}
      else{this.gestureMulti=true;this.cancelHold();this.dragPerson=null;this.moved=true;this.finishPaint(true);}
    });
    this.canvas.addEventListener('pointermove',e=>{
      if(!this.pointers.has(e.pointerId))return;
      if(this.dragPerson){this.dragPoint=point(e);this.pointers.set(e.pointerId,this.dragPoint);return;}
      const before=[...this.pointers.values()],old=this.pointers.get(e.pointerId),p=point(e);this.pointers.set(e.pointerId,p);
      if(this.pointers.size===2){
        const after=[...this.pointers.values()],center=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2});
        const b=center(before),a=center(after),distance=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
        this.zoom(distance(after)/Math.max(distance(before),1),b.x,b.y);this.x+=a.x-b.x;this.y+=a.y-b.y;this.clamp();
      }else if(this.pointers.size===1){
        if(Math.hypot(p.x-this.start.x,p.y-this.start.y)>8){this.moved=true;this.cancelHold();if(this.followId!==null)this.stopFollow();}
        if(this.editor.active){for(const i of this.editor.extend((p.x-this.x)/this.scale,(p.y-this.y)/this.scale))this.drawTerrainCell(i);}
        else if(this.moved&&!['wind','tornado','strong-tornado'].includes(this.mode)){this.x+=p.x-old.x;this.y+=p.y-old.y;this.clamp();}
      }
    });
    const end=(e,cancel=false)=>{
      if(!this.pointers.has(e.pointerId))return;const p=point(e);this.cancelHold();
      if(this.dragPerson){const person=this.dragPerson,x=(p.x-this.x)/this.scale,y=(p.y-this.y)/this.scale;
        if(!cancel&&person.alive&&this.world.walkable(x,y)){person.x=x;person.y=y;person.setTask(null);const joined=this.dropSocietyAt(person,x,y);this.society.update(0,this.people,true);this.message(joined?`${person.name}が${joined.name}の住人になりました`:`${person.name}を移動しました`);}else this.message('移動を取り消しました。砂浜・草原・砂漠で離してください');
        this.dragPerson=null;this.pointers.delete(e.pointerId);return;
      }
      if(this.editor.active){if(!cancel)for(const i of this.editor.extend((p.x-this.x)/this.scale,(p.y-this.y)/this.scale))this.drawTerrainCell(i);this.finishPaint(cancel);}
      else if(this.mode==='wind'&&!cancel&&!this.gestureMulti&&this.moved&&this.pointers.size===1){
        const x=(this.start.x-this.x)/this.scale,y=(this.start.y-this.y)/this.scale;
        const toX=(p.x-this.x)/this.scale,toY=(p.y-this.y)/this.scale;
        if(this.weather.startWind(x,y,toX,toY))this.message('風が吹いています。人の歩みが少し遅くなります');
      }
      else if(['tornado','strong-tornado'].includes(this.mode)&&!cancel&&!this.gestureMulti&&this.moved&&this.pointers.size===1){
        const x=(this.start.x-this.x)/this.scale,y=(this.start.y-this.y)/this.scale;
        const toX=(p.x-this.x)/this.scale,toY=(p.y-this.y)/this.scale;
        this.message(this.tornado.start(x,y,toX,toY,this.mode==='strong-tornado'?'strong':'normal',this)?'台風が発生！ タップすると小さくなります':'台風は同時に2つまで。地図の中を長めにスワイプしてください');
      }
      else if(!cancel&&!this.moved&&this.pointers.size===1){const x=(p.x-this.x)/this.scale,y=(p.y-this.y)/this.scale;if(this.mode==='tornado'||this.mode==='strong-tornado')this.message(this.tornado.tap(x,y)?'台風が小さくなり、人を解放します':'台風の中心をタップしてください');else if(this.mode==='moss')this.message(this.tornado.toggleMoss(x,y,this));else if(this.mode==='animal')this.message(this.animals.place($('animal-kind').value,x,y,this));else if(this.mode==='god'){this.message(this.gods.place(x,y,this));this.renderSocieties();}else if(this.mode==='volcano'||this.mode==='reverse-volcano')this.message(this.weather.placeVolcano(x,y,this.mode==='volcano'?'volcano':'reverse',this));else if(this.mode==='lightning')this.message(this.weather.strike(x,y,this)?'雷が落ちました':'地図の中をタップしてください');else if(this.mode==='lava')this.message(this.weather.aimLava(x,y,this.world)?'溶岩雨の降る場所を変えました':'地図の中をタップしてください');else if(this.mode.startsWith('hole-'))this.message(this.blackHoles.toggle(x,y,this.mode.slice(5),this));else if(this.mode==='place')this.spawn(x,y,$('sex').value,$('age').value.trim()===''?NaN:Number($('age').value));else if(this.mode==='resource')this.placeResource(x,y,$('resource-kind').value);else if(this.mode==='village'||this.mode==='kingdom'){const made=this.society.createManual(this.mode,x,y,this.people);if(made)this.message(`${made.name}を作りました`);this.renderSocieties();}else if(this.mode==='independence'){const made=this.society.createIndependent(x,y,this.people);this.message(made?`${made.name}を作りました`:'未開拓で歩ける陸地を選んでください');this.renderSocieties();}else if(this.mode==='ship'){const selectedVillage=this.selected&&this.society.villageFor(this.selected),kingdomId=selectedVillage?.kingdomId??this.society.kingdoms[0]?.id;if(kingdomId&&this.society.createShip(kingdomId,x,y,this.people))this.message('男女を含む10人の船団が出航しました');else this.message('別の島の空き地、男女を含む10人、木20・石10・食料30が必要です');}else if(this.mode==='meteor'){if(this.meteor.launch(x,y,this.world))this.message('隕石が接近中！');}else if(this.mode==='invasion'){const society=this.societyAt(x,y);if(society)this.openSocietyDetails(society.type,society.id);else this.message('侵攻する国名か、その国の集落名をタップしてください');}else if(this.mode==='move'){const society=this.societyAt(x,y);if(society)this.openSocietyDetails(society.type,society.id);else this.inspect(x,y);}}
      this.pointers.delete(e.pointerId);
    };
    this.canvas.addEventListener('pointerup',e=>end(e));this.canvas.addEventListener('pointercancel',e=>end(e,true));this.canvas.addEventListener('lostpointercapture',e=>{if(this.pointers.has(e.pointerId)){this.cancelHold();this.dragPerson=null;this.finishPaint(true);this.pointers.delete(e.pointerId);}});
    this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);this.zoom(Math.exp(-e.deltaY*.001),p.x,p.y);},{passive:false});
  }
  frame(t){
    const realDt=Math.max(0,(t-(this.last||t))/1000);this.last=t;
    if(!this.paused&&!document.hidden&&!this.editor.active&&!this.dragPerson){
      // Carry unfinished simulation time to the next frame. The old 50 ms
      // per-frame cap permanently lost time when the world became crowded.
      this.simBacklog+=realDt*this.speed;
      let steps=0;
      while(this.simBacklog>1e-6&&steps<20){
        const dt=Math.min(.5,this.simBacklog);
        this.stepSimulation(dt);this.simBacklog-=dt;steps++;
      }
    }
    if(!document.hidden&&!this.paused){this.meteor.update(Math.min(realDt,.5),this);this.gods.animate(Math.min(realDt,.5));this.removeDead();}
    if(!this.speedMeasureAt){this.speedMeasureAt=t;this.speedMeasureSeconds=this.elapsedSeconds;}
    if(t-this.speedMeasureAt>=3000){
      if(!this.paused&&!document.hidden)this.actualSpeed=(this.elapsedSeconds-this.speedMeasureSeconds)*1000/(t-this.speedMeasureAt);
      this.speedMeasureAt=t;this.speedMeasureSeconds=this.elapsedSeconds;
    }
    this.renderNews();
    this.updateFollow();if(!this.infoTime||t-this.infoTime>150){this.updateInfo();this.infoTime=t;}
    if(!this.lastDraw||t-this.lastDraw>=33){this.draw();this.lastDraw=t;}
    requestAnimationFrame(t=>this.frame(t));
  }
  removeDead(){
    const dead=this.people.filter(p=>!p.alive);
    if(!dead.length)return;
    for(const p of dead)this.family.onDeath(p,this.people);
    this.people=this.people.filter(p=>p.alive);
    const old=dead.filter(p=>p.deathCause==='oldAge').length;
    const meteors=dead.filter(p=>p.deathCause==='meteor').length;
    this.deaths+=dead.length;this.oldAgeDeaths+=old;this.updateCount();
    if(!meteors){const cause={oldAge:'老衰',starvation:'餓死',drowning:'溺死',blackHole:'ブラックホール',lightning:'落雷',lava:'溶岩雨',volcano:'火山',fallingHouse:'吹き飛んだ家',moss:'コケでの転倒',animal:'動物の襲撃'};this.message(dead.length===1?`${dead[0].name}が${cause[dead[0].deathCause]??'災厄'}で亡くなりました`:`${dead.length}人が亡くなりました`);}
  }
  stepSimulation(dt){
    const priorEra=currentEra(this.elapsedSeconds);
    this.elapsedSeconds+=dt;this.blackHoles.update(dt,this);this.weather.update(dt,this);this.tornado.update(dt,this);this.animals.update(dt,this);this.food.update(dt);this.materials.update(dt);
    const era=currentEra(this.elapsedSeconds);
    for(const p of this.people)p.update(dt,this.world,this.food,this.materials,this.buildings,this.society,this.people,this.animals,this.town,this);
    this.removeDead();
    const count=this.people.length;
    this.family.update(dt,this.people,(x,y,sex)=>this.addChild(x,y,sex));
    if(count!==this.people.length)this.updateCount();
    this.society.update(dt,this.people);
    this.gods.update(this);
    if(era!==priorEra)this.society.addNews(era.year===70?
      '世界が浮遊都市の時代に入りました。家が水色と黒に変わり、青い球で宙に浮きました。':era.year===50?
      '世界が道路と車の時代に入りました。集落の施設を道と車がつなぎます。':
      era.year===45?'世界が公園と商店の時代に入りました。集落に公園・食堂・店ができました。':
        `世界が${era.label}に入りました。家に庭ができ、戦いの道具と船の帆が進化しました。`);
  }
  draw(){const c=this.ctx;c.setTransform(this.dpr||1,0,0,this.dpr||1,0,0);c.fillStyle='#153e50';c.fillRect(0,0,this.w,this.h);c.imageSmoothingEnabled=false;c.drawImage(this.terrain,this.x,this.y,this.world.width*this.scale,this.world.height*this.scale);this.tornado.drawMoss(c,this);
    this.town.drawRoads(c,this);
    if(currentEra(this.elapsedSeconds).year>=15)for(const h of this.buildings.items)if(h.complete)drawYard(c,this,h);
    for(const n of this.materials.items){
      const x=this.x+n.x*this.scale,y=this.y+n.y*this.scale,r=Math.max(2,Math.min(6,this.scale*1.1));if(x<0||y<0||x>this.w||y>this.h)continue;
      if(n.kind==='wood'){c.fillStyle='#8e6541';c.fillRect(x-r*.25,y-r*.3,r*.5,r*1.1);if(n.amount){c.fillStyle='#284f39';c.fillRect(x-r,y-r*1.4,r*2,r*1.5);c.fillStyle='#477b48';c.fillRect(x-r*.65,y-r*1.9,r*1.3,r);}}
      else if(n.amount){c.fillStyle='#627780';c.fillRect(x-r,y-r*.5,r*2,r);c.fillStyle='#c0c5b8';c.fillRect(x-r*.65,y-r,r*1.3,r);}
    }
    for(const v of this.society.villages)if(v.farmCell!==null){const x=this.x+(v.farmCell%this.world.width+.5)*this.scale,y=this.y+(Math.floor(v.farmCell/this.world.width)+.5)*this.scale,r=Math.max(3,this.scale);c.fillStyle='#855a36';c.fillRect(x-r,y-r,r*2,r*2);c.strokeStyle='#b5ce6a';c.lineWidth=1;for(let k=-1;k<=1;k++){c.beginPath();c.moveTo(x-r,y+k*r*.6);c.lineTo(x+r,y+k*r*.6);c.stroke();}}
    for(const k of this.society.kingdoms){const bounds=this.kingdomBounds(k);if(!bounds)continue;const left=this.x+bounds.minX*this.scale,top=this.y+bounds.minY*this.scale,width=(bounds.maxX-bounds.minX)*this.scale,height=(bounds.maxY-bounds.minY)*this.scale;c.save();c.setLineDash([7,5]);c.strokeStyle=this.kingdomColor(k);c.lineWidth=Math.max(1.5,this.scale*.12);c.strokeRect(left,top,width,height);c.restore();}
    for(const h of this.buildings.items){
      const sway=this.weather.houseOffset(this.elapsedSeconds),x=this.x+(h.x+sway.x)*this.scale,y=this.y+(h.y+sway.y)*this.scale,r=Math.max(4,this.scale*1.1);if(x+r<0||y+r<0||x-r>this.w||y-r>this.h)continue;
      if(!h.complete){c.strokeStyle='#ebd598';c.lineWidth=1;c.strokeRect(x-r,y-r,r*2,r*2);c.fillStyle='#ebd598';c.fillRect(x-r,y+r+2,r*2*h.progress/BALANCE.buildSeconds,2);continue;}
      const village=this.society.villages.find(v=>v.houseIds.includes(h.id));const kingdom=village&&this.society.kingdoms.find(k=>k.id===village.kingdomId);
      if(kingdom&&this.scale<=this.minScale*4.5){c.fillStyle=this.villageColor(village);c.beginPath();c.arc(x,y,Math.max(2,this.scale*.35),0,Math.PI*2);c.fill();continue;}
      if(currentEra(this.elapsedSeconds).year>=70){drawFloatingHouse(c,this,h,x,y,r,village?this.villageColor(village):'#e9b768');continue;}
      if(!village){
        // Before a settlement forms, use a compact pit-house silhouette.
        c.fillStyle='#6d6257';c.beginPath();c.ellipse(x,y+r*.2,r*1.05,r*.55,0,0,Math.PI*2);c.fill();c.fillStyle='#b69a6a';c.beginPath();c.moveTo(x-r*.9,y);c.lineTo(x,y-r*.75);c.lineTo(x+r*.9,y);c.closePath();c.fill();c.fillStyle='#3d3940';c.fillRect(x-r*.16,y-r*.05,r*.32,r*.5);continue;
      }
      // Settlement houses share a neutral body and a strongly contrasting roof.
      c.fillStyle='#b8a78e';c.fillRect(x-r,y-r*.25,r*2,r*1.35);c.fillStyle=this.villageColor(village);c.beginPath();c.moveTo(x-r*1.3,y);c.lineTo(x,y-r*1.45);c.lineTo(x+r*1.3,y);c.closePath();c.fill();c.strokeStyle='#172b36';c.lineWidth=Math.max(1,this.scale*.08);c.stroke();c.fillStyle='#503e35';c.fillRect(x-r*.25,y+r*.3,r*.5,r*.75);
    }
    // A kingdom is represented by one evolving central castle instead of a carpet of buildings.
    for(const k of this.society.kingdoms){
      const bounds=this.kingdomBounds(k),capital=this.kingdomCapital(k);if(!bounds||!capital)continue;const tier=this.kingdomCastleTier(k),cx=this.x+capital.x*this.scale,cy=this.y+capital.y*this.scale;
      const unit=Math.max(2,this.scale*.65),wall=this.kingdomColor(k),dark='#182b39';c.save();c.translate(cx,cy);
      if(tier===1){c.fillStyle=wall;c.fillRect(-unit*1.3,-unit*.9,unit*2.6,unit*1.8);c.fillStyle=dark;c.fillRect(-unit*.25,-unit*.25,unit*.5,unit*1.15);c.fillStyle='#e6d5a3';c.beginPath();c.moveTo(-unit*1.55,-unit*.9);c.lineTo(0,-unit*1.8);c.lineTo(unit*1.55,-unit*.9);c.closePath();c.fill();}
      else if(tier===2){c.fillStyle=wall;c.fillRect(-unit*2,-unit,unit*4,unit*2);c.fillRect(-unit*2.55,-unit*1.55,unit*.9,unit*2.6);c.fillRect(unit*1.65,-unit*1.55,unit*.9,unit*2.6);c.fillStyle='#e6d5a3';c.fillRect(-unit*.32,-unit*.25,unit*.64,unit*1.25);c.fillStyle=dark;c.fillRect(-unit*2.45,-unit*1.8,unit*.7,unit*.35);c.fillRect(unit*1.75,-unit*1.8,unit*.7,unit*.35);}
      else{c.fillStyle=wall;c.fillRect(-unit*3,-unit*1.2,unit*6,unit*2.4);for(const tx of [-unit*3,unit*2.2])c.fillRect(tx,-unit*2,unit*.8,unit*3.2);c.fillStyle='#e6d5a3';c.fillRect(-unit*.42,-unit*.25,unit*.84,unit*1.45);c.fillStyle=dark;for(const tx of [-unit*2.9,unit*2.3])c.fillRect(tx,-unit*2.3,unit*.6,unit*.35);}
      c.restore();
    }
    this.town.draw(c,this);
    this.town.drawCars(c,this);
    if(this.dragPerson){c.save();c.setLineDash([4,4]);for(const v of this.society.villages){const x=this.x+v.x*this.scale,y=this.y+v.y*this.scale;c.strokeStyle=this.villageColor(v);c.lineWidth=2;c.beginPath();c.arc(x,y,BALANCE.villageRadius*this.scale,0,Math.PI*2);c.stroke();c.setLineDash([]);c.fillStyle=this.villageColor(v);c.beginPath();c.arc(x,y,Math.max(3,this.scale*.45),0,Math.PI*2);c.fill();c.setLineDash([4,4]);}for(const k of this.society.kingdoms){const b=this.kingdomBounds(k);if(!b)continue;c.strokeStyle=this.kingdomColor(k);c.lineWidth=2;c.strokeRect(this.x+b.minX*this.scale,this.y+b.minY*this.scale,(b.maxX-b.minX)*this.scale,(b.maxY-b.minY)*this.scale);}c.restore();}
    for(const ship of this.society.ships){const x=this.x+ship.x*this.scale,y=this.y+ship.y*this.scale,r=Math.max(4,this.scale*.7);c.fillStyle='#5b3b2c';c.beginPath();c.moveTo(x-r*1.4,y);c.lineTo(x+r*1.4,y);c.lineTo(x+r*.8,y+r*.55);c.lineTo(x-r*.8,y+r*.55);c.closePath();c.fill();c.fillStyle='#f4e5b5';c.beginPath();c.moveTo(x,y-r*1.5);c.lineTo(x,y);c.lineTo(x+r*(currentEra(this.elapsedSeconds).year>=15?1.3:.9),y);c.closePath();c.fill();c.fillStyle='#fff';c.font='bold 12px system-ui';c.textAlign='center';c.fillText(String(ship.passengerIds?.length??0),x,y-r*1.6);}
    for(const f of this.food.items){const x=this.x+f.x*this.scale,y=this.y+f.y*this.scale;if(x<0||y<0||x>this.w||y>this.h)continue;const r=Math.max(2,Math.min(5,this.scale));c.fillStyle=f.amount?'#dceaa0':'#566d48';c.fillRect(x-r,y-r,r*2,r*2);if(f.amount){c.fillStyle='#c36b49';c.fillRect(x-r*.5,y-r*.5,r,r);}}
    this.animals.draw(c,this);
    for(const p of this.people){
      if(p.shipId)continue;
      const x=this.x+p.x*this.scale,y=this.y+p.y*this.scale;
      const size=Math.max(2.3,Math.min(4,this.scale*.75))*(p.age<18?.8:1);
      if(x+size<0||y+size<0||x-size>this.w||y-size>this.h)continue;
      if(p===this.selected){c.strokeStyle='#fff4b6';c.lineWidth=2;c.beginPath();c.arc(x,y,Math.max(8,size*4),0,Math.PI*2);c.stroke();}
      const village=this.society.villageFor(p);
      const kingdom=village&&this.society.kingdoms.find(k=>k.id===village.kingdomId);
      const clothing=village?this.villageColor(village):kingdom?this.kingdomColor(kingdom):'#d5d0c2';
      c.fillStyle='#173b3c88';c.fillRect(x-size*1.7,y+size*2,size*3.4,size);
      c.fillStyle='#172b36';c.fillRect(x-size-1,y-size-1,size*2+2,size*3+2);
      c.fillStyle=clothing;c.fillRect(x-size,y-size,size*2,size*3);
      c.fillStyle='#fff0d0';c.fillRect(x-size,y-size*2.5,size*2,size*1.5);
      c.fillStyle='#26353b';c.fillRect(x-size*.45,y-size*2.15,size*.25,size*.25);c.fillRect(x+size*.25,y-size*2.15,size*.25,size*.25);
      if(p.slipLeft>0){c.fillStyle='#ffdb63';c.fillRect(x-size*2,y-size*3,size*.8,size*.8);c.fillRect(x+size*1.5,y-size*3.5,size*.6,size*.6);}
      if(p.sex==='female'){c.fillStyle='#e57077';c.fillRect(x+size*.55,y-size*1.7,Math.max(1,size*.3),Math.max(1,size*.3));}
      if(village?.leaderId===p.id||kingdom?.leaderId===p.id){c.fillStyle=kingdom?.leaderId===p.id?'#f4c542':'#d8e5e8';c.font='bold 12px system-ui';c.fillText(kingdom?.leaderId===p.id?'♛':'♜',x+size*2,y-size*2);}
      if(this.scale>this.minScale*5){c.font='12px system-ui';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#17343b';c.strokeText(p.name,x,y-size*4);c.fillStyle='#fff';c.fillText(p.name,x,y-size*4);}
    }
    for(const inv of this.society.invasions){
      for(const id of inv.troopIds??[]){
        const p=this.people.find(person=>person.id===id);if(!p)continue;
        const x=this.x+p.x*this.scale,y=this.y+p.y*this.scale;
        const size=Math.max(3,Math.min(5,this.scale*.9));
        c.save();c.strokeStyle='#f1d17a';c.lineWidth=Math.max(1,this.scale*.12);
        if(currentEra(this.elapsedSeconds).year>=15){
          c.beginPath();c.moveTo(x-size*2,y-size*3);c.lineTo(x+size*2,y+size*2);c.stroke();
          c.fillStyle='#aab9b6';c.beginPath();c.moveTo(x-size*2.5,y-size*3.6);
          c.lineTo(x-size*2.2,y-size*2.4);c.lineTo(x-size*1.3,y-size*3.2);c.closePath();c.fill();
        }else{
          c.fillStyle='#b0a994';c.beginPath();
          c.arc(x+size*1.8,y-size*1.6,Math.max(2,size*.45),0,Math.PI*2);c.fill();
        }
        c.fillStyle='#b94e36';c.fillRect(x-size,y-size,size*2,size*3);
        c.fillStyle='#fff0d0';c.fillRect(x-size,y-size*2.5,size*2,size*1.5);
        c.restore();
      }
    }
    const overview=this.scale<=this.minScale*2.5;c.font=`bold ${overview?15:13}px system-ui`;c.textAlign='center';c.lineWidth=3;c.strokeStyle='#17343b';
    if(overview){for(const k of this.society.kingdoms){const bounds=this.kingdomBounds(k);if(!bounds)continue;const x=this.x+((bounds.minX+bounds.maxX)/2)*this.scale,y=this.y+bounds.minY*this.scale-8;if(x<0||y<0||x>this.w||y>this.h)continue;const label=`${k.god?'✨ ':''}${k.name}`;c.strokeText(label,x,y);c.fillStyle=this.kingdomColor(k);c.fillText(label,x,y);}for(const v of this.society.villages.filter(v=>v.kingdomId===null)){const x=this.x+v.x*this.scale,y=this.y+v.y*this.scale-12;if(x<0||y<0||x>this.w||y>this.h)continue;c.strokeText(v.name,x,y);c.fillStyle=this.villageColor(v);c.fillText(v.name,x,y);}}
    else{for(const v of this.society.villages){const x=this.x+v.x*this.scale,y=this.y+v.y*this.scale-18;if(x<0||y<0||x>this.w||y>this.h)continue;const k=this.society.kingdoms.find(k=>k.id===v.kingdomId),label=`${k?k.name+' / ':''}${v.name}`;c.strokeText(label,x,y);c.fillStyle=this.villageColor(v);c.fillText(label,x,y);}}
    this.meteor.draw(c,this);this.blackHoles.draw(c,this);this.weather.draw(c,this);this.tornado.draw(c,this);this.gods.draw(c,this);
    if(this.dragPerson){const x=this.dragPoint.x,y=this.dragPoint.y;c.strokeStyle=this.world.walkable((x-this.x)/this.scale,(y-this.y)/this.scale)?'#c7e6a1':'#ff8b7b';c.lineWidth=3;c.beginPath();c.arc(x,y,14,0,Math.PI*2);c.stroke();c.fillStyle='#fff';c.fillText(this.dragPerson.name,x,y-22);}

  }
}
const game=new Game();
if(document.modelContext?.registerTool){try{Promise.resolve(document.modelContext.registerTool({name:'read_world',description:'現在の世界の人口と地形サイズを確認する',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:()=>({population:game.people.length,houses:game.buildings.total,width:game.world.width,height:game.world.height,seed:game.world.seed})})).catch(()=>{});}catch{}}
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
let installPrompt=null;
const installButton=$('install-app'),installHint=$('install-hint');
const installed=()=>window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
if(installed())installButton.hidden=true;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;installButton.hidden=false;installHint.hidden=true;});
window.addEventListener('appinstalled',()=>{installPrompt=null;installButton.hidden=true;installHint.hidden=true;});
installButton.addEventListener('click',async()=>{
  if(installPrompt){const prompt=installPrompt;installPrompt=null;await prompt.prompt();await prompt.userChoice;return;}
  installHint.textContent='AndroidのChromeでは右上の「︙」→「アプリをインストール」または「ホーム画面に追加」を選んでください。iPhoneでは共有→「ホーム画面に追加」です。';
  installHint.hidden=false;
});
