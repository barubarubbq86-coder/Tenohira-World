import {World} from './world.js';
import {Human} from './human.js';
import {FoodSystem,MaterialSystem} from './resource.js';
import {BuildingSystem} from './building.js';
import {FamilySystem} from './family.js';
import {BALANCE} from './settings.js';
import {TerrainEditor} from './terrain-editor.js';
import {serializeGame,restoreGame,MAX_SAVE_BYTES} from './save.js';
const $=id=>document.getElementById(id);
class Game {
  constructor(){
    this.canvas=$('world');this.ctx=this.canvas.getContext('2d');this.people=[];this.nextId=1;this.mode='move';this.paused=false;this.pointers=new Map();this.scale=1;this.x=0;this.y=0;this.last=0;
    this.regenerate();this.bind();new ResizeObserver(()=>this.resize()).observe(this.canvas);requestAnimationFrame(t=>this.frame(t));
  }
  regenerate(){
    this.world=new World(crypto.getRandomValues(new Uint32Array(1))[0]);this.people=[];this.nextId=1;this.selected=null;this.deaths=0;this.oldAgeDeaths=0;this.elapsedSeconds=0;this.food=new FoodSystem(this.world);this.materials=new MaterialSystem(this.world,this.food);this.buildings=new BuildingSystem(this.world,this.food,this.materials);this.family=new FamilySystem(this.world,this.buildings);
    this.rebuildTerrain();
  }
  rebuildTerrain(){
    this.editor=new TerrainEditor(this.world);
    this.terrain=document.createElement('canvas');this.terrain.width=this.world.width*4;this.terrain.height=this.world.height*4;this.terrainCtx=this.terrain.getContext('2d');
    for(let i=0;i<this.world.tiles.length;i++)this.drawTerrainCell(i);
    $('seed').textContent=`#${String(this.world.seed).slice(-6)}`;this.updateCount();this.updateInfo();this.fit();this.message('「人を置く」を選んで、陸地をタップ');
  }
  drawTerrainCell(i){
    const x=i%this.world.width,y=Math.floor(i/this.world.width),c=this.terrainCtx,t=this.world.tiles[i],h=this.world.elevation[i],n=this.world.hash(x,y);
    if(t===0)c.fillStyle=h>.41?'#348799':h>.33?'#256d82':'#205b74';
    if(t===1)c.fillStyle=n>.5?'#d9cf9c':'#c8c08e';
    if(t===2)c.fillStyle=h>.61?'#62935d':n>.5?'#85af6b':'#7da567';
    if(t===3)c.fillStyle=h>.79?'#d2d4bf':n>.5?'#a7b1a1':'#8d9d8a';
    c.fillRect(x*4,y*4,4,4);
    if(t===2&&n>.86){c.fillStyle='#507e51';c.fillRect(x*4+1,y*4,1,2);}
  }
  refreshLand(){
    // Keep existing resource stocks; generate resources only on newly available grass.
    const oldFood=this.food,oldMaterials=this.materials;
    this.food=new FoodSystem(this.world);this.materials=new MaterialSystem(this.world,this.food);
    for(const [old,system] of [[oldFood,this.food],[oldMaterials,this.materials]]){for(const node of system.items){const previous=old.byCell.get(node.cell);if(previous){node.amount=previous.amount;node.timer=previous.timer;}}system.rebuild();}
    this.buildings.food=this.food;this.buildings.materials=this.materials;
    const prior=this.family;this.family=new FamilySystem(this.world,this.buildings);
    for(const key of ['time','tick','births','news'])this.family[key]=prior[key];
    for(const p of this.people)p.setTask(null);
    this.updateInfo();
  }
  finishPaint(cancel=false){
    if(!this.editor.active)return;
    const cells=cancel?this.editor.cancel():this.editor.commit();for(const i of cells)this.drawTerrainCell(i);
    if(!cancel&&cells.length){this.refreshLand();this.message('陸地ができました。「人を置く」で暮らしを始めよう');}
  }
  resize(){const r=this.canvas.getBoundingClientRect();this.w=r.width;this.h=r.height;const d=Math.min(devicePixelRatio||1,2);this.canvas.width=Math.round(this.w*d);this.canvas.height=Math.round(this.h*d);this.dpr=d;this.fit();}
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
  updateCount(){$('population').replaceChildren(document.createTextNode(`${this.people.length} `));const s=document.createElement('small');s.textContent='人';$('population').append(s);}
  spawn(x,y,sex,age=20){if(!Number.isInteger(age)||age<0||age>120){this.message('年齢は0〜120歳の整数で入力してね');return {ok:false,reason:'年齢が範囲外'};}if(!this.world.walkable(x,y)){this.message('砂浜か草原に置いてね');return {ok:false,reason:'陸地を選んでください'};}if(this.people.length>=BALANCE.populationLimit){this.message('この試作では500人まで置けます');return {ok:false,reason:'上限500人'};}
    const selected=sex==='random'?(Math.random()<.5?'male':'female'):sex;const p=new Human(this.nextId++,x,y,selected,age);this.people.push(p);this.updateCount();this.message(`${p.name}（${p.sex==='male'?'男':'女'}）が生まれました`);return {ok:true,name:p.name};}
  addChild(x,y,sex){const p=new Human(this.nextId++,x,y,sex,0);this.people.push(p);return p;}
  inspect(x,y){
    const radius=22/this.scale;
    const nearby=this.people.filter(p=>Math.hypot(p.x-x,p.y-y)<radius)
      .sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y)||a.id-b.id);
    const current=nearby.indexOf(this.selected);
    this.selected=nearby.length?nearby[(current+1)%nearby.length]:null;this.updateInfo();
    if(!nearby.length)this.message('人をタップすると、状態を見られます');
    else if(nearby.length>1)this.message('同じ場所をもう一度タップすると、別の人を選べます');
  }
  updateInfo(){
    const p=this.selected,panel=$('person');panel.hidden=!p;
    if(p){$('person-name').textContent=p.name+'（'+(p.sex==='male'?'男':'女')+'）';$('person-action').textContent=p.action;
      $('health').value=p.hp;$('fullness').value=p.fullness;$('person-age').textContent=Math.floor(p.age);
      $('health-value').textContent=Math.ceil(p.hp);$('fullness-value').textContent=Math.ceil(p.fullness);
      $('meals').textContent=p.meals;$('wood').textContent=p.wood;$('stone').textContent=p.stone;$('home').textContent=p.home?`家${p.home.id}`:p.site?'建築中':'なし';
      $('spouse').textContent=p.spouseId?`アソス${p.spouseId}`:'なし';$('parents').textContent=p.parentIds.length?p.parentIds.map(id=>`アソス${id}`).join('・'):'なし';$('children').textContent=p.children.length?`${p.children.length}人（${p.children.slice(-6).map(id=>`アソス${id}`).join('・')}${p.children.length>6?' ほか':''}）`:'なし';
    }
    const months=Math.floor(this.elapsedSeconds/BALANCE.secondsPerYear*12);
    $('world-time').textContent=`${Math.floor(months/12)}年 ${months%12}か月`;
    $('food-count').textContent=this.food.total;$('deaths').textContent=this.deaths;$('old-age-deaths').textContent=this.oldAgeDeaths;$('houses').textContent=this.buildings.total;$('births').textContent=this.family.births;$('couples').textContent=this.people.filter(p=>p.spouseId).length/2;$('family-news').textContent=this.family.news;
  }
  setPaused(paused){this.paused=paused;$('pause').textContent=paused?'▷ 再開':'Ⅱ 一時停止';$('pause').setAttribute('aria-pressed',String(paused));}
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
  bind(){
    for(const mode of ['move','place','land'])$(mode).onclick=()=>{this.finishPaint(true);this.mode=mode;for(const m of ['move','place','land']){$(m).classList.toggle('selected',m===mode);$(m).setAttribute('aria-pressed',String(m===mode));}$('brush-control').hidden=mode!=='land';this.message(mode==='land'?'海をなぞって陸地を作ろう · 2本指で移動・拡大':mode==='move'?'指で移動 · 2本指で拡大縮小':'砂浜か草原をタップして、人を置こう');};
    $('close-person').onclick=()=>{this.selected=null;this.updateInfo();};
    $('plus').onclick=()=>this.zoom(1.4);$('minus').onclick=()=>this.zoom(1/1.4);$('fit').onclick=()=>this.fit();
    $('pause').onclick=()=>this.setPaused(!this.paused);
    $('save-file').onclick=()=>this.saveFile();$('load-file').onclick=()=>$('load-input').click();$('load-input').onchange=e=>this.readSave(e.target.files[0]);
    const cancelLoad=()=>{this.pendingLoad=null;this.setPaused(this.loadWasPaused);$('load-confirm').close();};
    $('load-cancel').onclick=cancelLoad;$('load-confirm').addEventListener('cancel',e=>{e.preventDefault();cancelLoad();});
    $('load-yes').onclick=()=>{if(!this.pendingLoad)return;Object.assign(this,this.pendingLoad);this.pendingLoad=null;this.selected=null;this.pointers.clear();this.setPaused(true);this.rebuildTerrain();$('load-confirm').close();this.message('読み込みました。「再開」で続きを遊べます');};
    $('regenerate').onclick=()=>$('confirm').showModal();$('cancel').onclick=()=>$('confirm').close();$('yes').onclick=()=>{this.regenerate();$('confirm').close();};
    const point=e=>{const r=this.canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
    this.canvas.addEventListener('pointerdown',e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      this.canvas.setPointerCapture(e.pointerId);const p=point(e);this.pointers.set(e.pointerId,p);
      if(this.pointers.size===1){this.start=p;this.moved=false;if(this.mode==='land')this.editor.begin((p.x-this.x)/this.scale,(p.y-this.y)/this.scale,Number($('brush').value));}
      else{this.moved=true;this.finishPaint(true);}
    });
    this.canvas.addEventListener('pointermove',e=>{
      if(!this.pointers.has(e.pointerId))return;
      const before=[...this.pointers.values()],old=this.pointers.get(e.pointerId),p=point(e);this.pointers.set(e.pointerId,p);
      if(this.pointers.size===2){
        const after=[...this.pointers.values()],center=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2});
        const b=center(before),a=center(after),distance=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
        this.zoom(distance(after)/Math.max(distance(before),1),b.x,b.y);this.x+=a.x-b.x;this.y+=a.y-b.y;this.clamp();
      }else if(this.pointers.size===1){
        if(Math.hypot(p.x-this.start.x,p.y-this.start.y)>8)this.moved=true;
        if(this.editor.active){for(const i of this.editor.extend((p.x-this.x)/this.scale,(p.y-this.y)/this.scale))this.drawTerrainCell(i);}
        else if(this.moved){this.x+=p.x-old.x;this.y+=p.y-old.y;this.clamp();}
      }
    });
    const end=(e,cancel=false)=>{
      if(!this.pointers.has(e.pointerId))return;const p=point(e);
      if(this.editor.active){if(!cancel)for(const i of this.editor.extend((p.x-this.x)/this.scale,(p.y-this.y)/this.scale))this.drawTerrainCell(i);this.finishPaint(cancel);}
      else if(!cancel&&!this.moved&&this.pointers.size===1){const x=(p.x-this.x)/this.scale,y=(p.y-this.y)/this.scale;if(this.mode==='place')this.spawn(x,y,$('sex').value,$('age').value.trim()===''?NaN:Number($('age').value));else if(this.mode==='move')this.inspect(x,y);}
      this.pointers.delete(e.pointerId);
    };
    this.canvas.addEventListener('pointerup',e=>end(e));this.canvas.addEventListener('pointercancel',e=>end(e,true));this.canvas.addEventListener('lostpointercapture',e=>{if(this.pointers.has(e.pointerId)){this.finishPaint(true);this.pointers.delete(e.pointerId);}});
    this.canvas.addEventListener('wheel',e=>{e.preventDefault();const p=point(e);this.zoom(Math.exp(-e.deltaY*.001),p.x,p.y);},{passive:false});
  }
  frame(t){
    const dt=Math.min((t-(this.last||t))/1000,.05);this.last=t;
    if(!this.paused&&!document.hidden&&!this.editor.active){this.elapsedSeconds+=dt;this.food.update(dt);this.materials.update(dt);for(const p of this.people)p.update(dt,this.world,this.food,this.materials,this.buildings);
      const before=this.people.length,dead=this.people.filter(p=>!p.alive);for(const p of dead)this.family.onDeath(p,this.people);this.people=this.people.filter(p=>p.alive);
      if(before!==this.people.length){this.deaths+=dead.length;const old=dead.filter(p=>p.deathCause==='oldAge').length;this.oldAgeDeaths+=old;this.updateCount();this.message(dead.length===1?`${dead[0].name}が${old?'老衰':'餓死'}で亡くなりました`:`${dead.length}人が亡くなりました（老衰${old}人・餓死${dead.length-old}人）`);}
      const count=this.people.length;this.family.update(dt,this.people,(x,y,sex)=>this.addChild(x,y,sex));if(count!==this.people.length)this.updateCount();
    }
    if(!this.infoTime||t-this.infoTime>150){this.updateInfo();this.infoTime=t;}
    this.draw();requestAnimationFrame(t=>this.frame(t));
  }
  draw(){const c=this.ctx;c.setTransform(this.dpr||1,0,0,this.dpr||1,0,0);c.fillStyle='#153e50';c.fillRect(0,0,this.w,this.h);c.imageSmoothingEnabled=false;c.drawImage(this.terrain,this.x,this.y,this.world.width*this.scale,this.world.height*this.scale);
    for(const n of this.materials.items){
      const x=this.x+n.x*this.scale,y=this.y+n.y*this.scale,r=Math.max(2,Math.min(6,this.scale*1.1));if(x<0||y<0||x>this.w||y>this.h)continue;
      if(n.kind==='wood'){c.fillStyle='#8e6541';c.fillRect(x-r*.25,y-r*.3,r*.5,r*1.1);if(n.amount){c.fillStyle='#284f39';c.fillRect(x-r,y-r*1.4,r*2,r*1.5);c.fillStyle='#477b48';c.fillRect(x-r*.65,y-r*1.9,r*1.3,r);}}
      else if(n.amount){c.fillStyle='#627780';c.fillRect(x-r,y-r*.5,r*2,r);c.fillStyle='#c0c5b8';c.fillRect(x-r*.65,y-r,r*1.3,r);}
    }
    for(const h of this.buildings.items){
      const x=this.x+h.x*this.scale,y=this.y+h.y*this.scale,r=Math.max(4,this.scale*1.1);if(x+r<0||y+r<0||x-r>this.w||y-r>this.h)continue;
      if(!h.complete){c.strokeStyle='#ebd598';c.lineWidth=1;c.strokeRect(x-r,y-r,r*2,r*2);c.fillStyle='#ebd598';c.fillRect(x-r,y+r+2,r*2*h.progress/BALANCE.buildSeconds,2);continue;}
      c.fillStyle=h.ownerId===null?'#92927e':'#e4ce94';c.fillRect(x-r,y-r*.3,r*2,r*1.4);c.fillStyle='#9a5446';c.beginPath();c.moveTo(x-r*1.3,y);c.lineTo(x,y-r*1.4);c.lineTo(x+r*1.3,y);c.fill();c.fillStyle='#503e35';c.fillRect(x-r*.25,y+r*.35,r*.5,r*.75);
    }
    for(const f of this.food.items){const x=this.x+f.x*this.scale,y=this.y+f.y*this.scale;if(x<0||y<0||x>this.w||y>this.h)continue;const r=Math.max(2,Math.min(5,this.scale));c.fillStyle=f.amount?'#dceaa0':'#566d48';c.fillRect(x-r,y-r,r*2,r*2);if(f.amount){c.fillStyle='#c36b49';c.fillRect(x-r*.5,y-r*.5,r,r);}}
    for(const p of this.people){const x=this.x+p.x*this.scale,y=this.y+p.y*this.scale,s=Math.max(1.4,Math.min(3,this.scale*.65))*(p.age<18?.7:1);if(x<0||y<0||x>this.w||y>this.h)continue;if(p===this.selected){c.strokeStyle='#fff4b6';c.lineWidth=2;c.beginPath();c.arc(x,y,Math.max(8,s*4),0,Math.PI*2);c.stroke();}c.fillStyle='#173b3c88';c.fillRect(x-s*1.7,y+s*2,s*3.4,s);c.fillStyle=p.sex==='male'?'#f2b95c':'#e99ba6';c.fillRect(x-s,y-s,s*2,s*3);c.fillStyle='#fff0d0';c.fillRect(x-s,y-s*2.5,s*2,s*1.5);if(this.scale>this.minScale*5){c.font='12px system-ui';c.textAlign='center';c.lineWidth=3;c.strokeStyle='#17343b';c.strokeText(p.name,x,y-s*4);c.fillStyle='#fff';c.fillText(p.name,x,y-s*4);}}
  }
}
const game=new Game();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
