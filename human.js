import {BALANCE} from './settings.js';
import {findPath} from './navigation.js';
export class Human {
  constructor(id,x,y,sex,age=20){
    if(!Number.isInteger(age)||age<0||age>120)throw new RangeError('年齢は0〜120歳の整数にしてください');
    this.deathAge=BALANCE.lifespanMin+Math.random()*(BALANCE.lifespanMax-BALANCE.lifespanMin);
    this.deathCause=null;
    Object.assign(this,{id,name:`アソス${id}`,x,y,sex,age,hp:100,hunger:BALANCE.startingHunger,alive:true,
      action:'散歩中',angle:Math.random()*Math.PI*2,timer:0,mealTimer:0,waypoint:null,meals:0,
      villageId:null,kingdomId:null,societyLock:false,cargo:null,country:'アソス',spouseId:null,parentIds:[],children:[],ancestors:new Set(),nextBirthAt:0,dependent:false,
      wood:0,stone:0,home:null,site:null,task:null,gatherTimer:0,path:null,destination:null});
  }
  get fullness(){return Math.max(0,Math.min(100,100-this.hunger));}
  setTask(task){if(this.task!==task){this.task=task;this.waypoint=null;this.path=null;this.destination=null;this.gatherTimer=0;this.routeRetry=0;}}
  update(dt,world,food,materials,buildings,society=null,people=[],animals=null,town=null,game=null){
    if(!this.alive)return;
    // Passengers remain represented by their ship until they reach walkable land.
    if(this.shipId){this.age+=dt/BALANCE.secondsPerYear;this.action='船で新天地へ移動中';return;}
    if(this.tornadoId){this.age+=dt/BALANCE.secondsPerYear;this.action='台風に巻き込まれている';return;}
    if(this.tornadoFlee>0){this.tornadoFlee=Math.max(0,this.tornadoFlee-dt);this.age+=dt/BALANCE.secondsPerYear;this.action='台風から逃げる';return;}
    if(this.slipLeft>0){
      this.slipLeft=Math.max(0,this.slipLeft-dt);this.age+=dt/BALANCE.secondsPerYear;
      const step=dt*3.1,x=this.x+Math.cos(this.slipAngle)*step,y=this.y+Math.sin(this.slipAngle)*step;
      if(world.walkable(x,y)){this.x=x;this.y=y;}
      this.action='コケで滑った';return;
    }
    if(this.swimming){
      this.swimLeft-=dt;this.age+=dt/BALANCE.secondsPerYear;
      const shore=this.swimShore;
      if(shore){
        const distance=Math.hypot(shore.x-this.x,shore.y-this.y);
        const step=Math.min(distance,dt*1.45);
        if(distance>0){this.x+=(shore.x-this.x)/distance*step;this.y+=(shore.y-this.y)/distance*step;}
      }
      if(world.walkable(this.x,this.y)){
        this.swimming=false;this.swimShore=null;this.swimLeft=0;this.action='岸にたどり着いた';
        this.home=null;this.site=null;this.setTask(null);
      }else if(this.swimLeft<=0){this.alive=false;this.deathCause='drowning';this.action='溺死';}
      else this.action='岸へ泳いでいる';
      return;
    }
    this.age+=dt/BALANCE.secondsPerYear;
    if(this.age>=this.deathAge){this.alive=false;this.deathCause='oldAge';this.action='老衰';buildings?.release(this);return;}
    if(this.mealTimer>0){this.mealTimer=Math.max(0,this.mealTimer-dt);this.action='食事中';if(this.mealTimer===0){this.hunger=Math.max(0,this.hunger-BALANCE.mealRecovery);this.meals++;}return;}
    this.hunger=Math.min(100,this.hunger+BALANCE.hungerPerSecond*dt);
    if(this.hunger>=100)this.hp=Math.max(0,this.hp-BALANCE.starvationDamage*dt);
    else if(this.hunger<30)this.hp=Math.min(100,this.hp+BALANCE.healthRecovery*dt);
    if(this.hp<=0){this.alive=false;this.deathCause='starvation';this.action='餓死';buildings?.release(this);return;}
    if(this.hunger>=BALANCE.seekFoodAt&&society?.eatFromStore(this,dt))return;
    if(this.hunger>=BALANCE.seekFoodAt&&animals?.tryHunt(this,dt,world,society))return;
    if(this.hunger>=BALANCE.seekFoodAt&&food){
      this.setTask('food');this.action=this.hunger>=100?'飢餓・食料を探す':'食料を探す';
      const result=this.travelField(food.routes,dt,world);
      if(result==='arrived'&&food.take(this.cell(world))){this.mealTimer=BALANCE.mealSeconds;this.action='食事中';}
      else if(result==='unreachable'){this.action='食料を探す（近くにない）';this.wander(dt,world);}
      return;
    }
    if(materials&&buildings){
      // Couples who migrated together share the first new home they build.
      if(!this.home&&this.spouseId){
        const spouse=people.find(p=>p.id===this.spouseId&&p.alive&&p.villageId===this.villageId);
        if(spouse?.home?.complete){
          if(this.site){buildings.release(this);this.site=null;}
          this.home=spouse.home;
        }else if(spouse&&this.id>spouse.id){
          this.setTask('family-home');this.action='家族の家を待つ';this.wander(dt,world);return;
        }
      }
      if(animals?.stockVillage(this,dt,world,society))return;
      if(town?.visit(this,dt,game))return;
      if(society?.work(this,dt,people))return;
      if(this.home){
        this.setTask('home');this.action='家へ帰る';
        if(this.travelTo(this.home.cell,dt,world))this.action='家で休む';
        return;
      }
      if(this.age<BALANCE.adultAge){this.setTask('child');this.action='遊んでいる';this.wander(dt,world);return;}
      if(society?.supplyHouse(this,dt))return;
      const kind=this.wood<BALANCE.houseWood?'wood':this.stone<BALANCE.houseStone?'stone':null;
      if(kind){
        this.setTask(kind);const label=kind==='wood'?'木材':'石材';this.action=label+'を探す';
        const result=this.travelField(materials.routes[kind],dt,world);
        if(result==='arrived'){
          this.action=label+'を採集中';this.gatherTimer+=dt;
          if(this.gatherTimer>=BALANCE.gatherSeconds){if(materials.take(this.cell(world),kind))this[kind]++;this.gatherTimer=0;}
        }else if(result==='unreachable'){this.action=label+'を探す（近くにない）';this.wander(dt,world);}
        return;
      }
      this.setTask('build');
      // Retry a scarce build location at most once per second.
      if(!this.site){this.timer-=dt;if(this.timer<=0){this.site=buildings.reserve(this);this.timer=1;}if(!this.site){this.action='家を建てる場所を探す';this.wander(dt,world);return;}}
      this.action='建築場所へ向かう';
      if(this.travelTo(this.site.cell,dt,world)){
        this.site.progress=Math.min(BALANCE.buildSeconds,this.site.progress+dt);
        this.action=`家を建築中 ${Math.floor(this.site.progress/BALANCE.buildSeconds*100)}％`;
        if(this.site.progress>=BALANCE.buildSeconds&&buildings.complete(this.site,this))this.action='家が完成！';
      }
      return;
    }
    this.setTask('wander');this.action='散歩中';this.wander(dt,world);
  }
  cell(world){return Math.floor(this.y)*world.width+Math.floor(this.x);}
  center(cell,world){return {x:cell%world.width+.5,y:Math.floor(cell/world.width)+.5};}
  travelField(routes,dt,world){
    if(this.waypoint){this.follow(dt);return 'moving';}
    const cell=this.cell(world),center=this.center(cell,world),next=routes[cell];
    if(next<0)return 'unreachable';
    // Center each cell before taking a cardinal step; never cut obstacle corners.
    if(Math.hypot(center.x-this.x,center.y-this.y)>.01)this.waypoint=center;
    else if(next===cell)return 'arrived';
    else this.waypoint=this.center(next,world);
    this.follow(dt);return 'moving';
  }
  travelTo(goal,dt,world){
    if(this.routeRetry>0){this.routeRetry-=dt;this.action='目的地へ行く道がない';return false;}
    if(this.waypoint){this.follow(dt);return false;}
    const cell=this.cell(world),center=this.center(cell,world);
    if(Math.hypot(center.x-this.x,center.y-this.y)>.01){this.waypoint=center;this.follow(dt);return false;}
    if(cell===goal)return true;
    if(this.destination!==goal||!this.path){this.destination=goal;this.path=findPath(world,cell,goal);}
    if(!this.path?.length){this.routeRetry=2;this.action='目的地へ行く道がない';return false;}
    this.waypoint=this.center(this.path.shift(),world);this.follow(dt);return false;
  }
  follow(dt){const p=this.waypoint,dx=p.x-this.x,dy=p.y-this.y,d=Math.hypot(dx,dy),step=BALANCE.walkingSpeed*dt*(this.weatherSlow??1);if(d<=step){this.x=p.x;this.y=p.y;this.waypoint=null;}else{this.x+=dx/d*step;this.y+=dy/d*step;}}
  wander(dt,world){this.timer-=dt;if(this.timer<=0){this.angle+=(Math.random()-.5)*3;this.timer=.5+Math.random()*2;}const step=dt*BALANCE.walkingSpeed*(this.weatherSlow??1),x=this.x+Math.cos(this.angle)*step,y=this.y+Math.sin(this.angle)*step;if(world.walkable(x,y)){this.x=x;this.y=y;}else{this.angle+=Math.PI*.6;this.timer=.2;}}
}
