import {BALANCE} from './settings.js';
/** Stable settlements and kingdoms; shared stores belong to settlements. */
export class SocietySystem {
  constructor(world,buildings,food,materials,family){Object.assign(this,{world,buildings,food,materials,family,villages:[],kingdoms:[],invasions:[],ships:[],news:[],nextVillageId:1,nextKingdomId:1,nextShipId:1,clock:0,ageSeconds:0});}
  addNews(text){this.news.push({time:this.ageSeconds,text});if(this.news.length>200)this.news.splice(0,this.news.length-200);}
  region(cell){return this.family.regions[cell];}
  villageFor(p){return this.villages.find(v=>v.id===p.villageId);}
  members(v,people){return people.filter(p=>p.alive&&p.villageId===v.id);}
  leader(people,current){const adults=people.filter(p=>p.alive&&p.age>=BALANCE.adultAge);return adults.find(p=>p.id===current)?.id??adults.sort((a,b)=>b.age-a.age||a.id-b.id)[0]?.id??null;}
  kingdomRadius(){return this.ageSeconds<BALANCE.secondsPerYear*BALANCE.kingdomExpansionYears?BALANCE.kingdomInitialRadius:BALANCE.kingdomRadius;}
  walkableNear(cell){if(cell!==null&&cell!==undefined){const cx=cell%this.world.width,cy=Math.floor(cell/this.world.width);for(let radius=0;radius<=12;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=this.world.width||y>=this.world.height)continue;const next=y*this.world.width+x;if(this.world.walkable(x+.5,y+.5))return next;}}return null;}
  syncMilitary(people){
    for(const k of this.kingdoms){const stock=this.kingdomStock(k.id),population=people.filter(p=>p.alive&&p.kingdomId===k.id).length,soldiers=Math.min(population,Math.floor(stock.food/10+stock.wood/5+stock.stone/5));const stoneSpear=this.ageSeconds>=15*BALANCE.secondsPerYear;k.military={soldiers,attack:soldiers*(stoneSpear?3:2)+Math.floor(stock.stone/4),defense:soldiers+Math.floor(stock.wood/4),food:stock.food,wood:stock.wood,stone:stock.stone};const maxHp=100+population*5+Math.floor(stock.stone/2);if(!k.castle)k.castle={hp:maxHp,maxHp};else{k.castle.hp=Math.min(maxHp,k.castle.hp+(maxHp-k.castle.maxHp));k.castle.maxHp=maxHp;}}
  }
  takeKingdomStock(k,need){const villages=this.villages.filter(v=>v.kingdomId===k.id);for(const key of Object.keys(need))if(this.kingdomStock(k.id)[key]<need[key])return false;for(const key of Object.keys(need)){let left=need[key];for(const v of villages){const used=Math.min(left,v.stock[key]);v.stock[key]-=used;left-=used;if(!left)break;}}return true;}
  findUnclaimedLand(origin,overseas=false){const originRegion=origin?this.region(Math.floor(origin.y)*this.world.width+Math.floor(origin.x)):null;for(let distance=30;distance<=this.world.width;distance+=10)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4){const x=origin.x+Math.cos(angle)*distance,y=origin.y+Math.sin(angle)*distance;if(x<2||y<2||x>=this.world.width-2||y>=this.world.height-2||!this.world.walkable(x,y))continue;const cell=Math.floor(y)*this.world.width+Math.floor(x);if(overseas&&this.region(cell)===originRegion)continue;if(this.villages.some(v=>Math.hypot(v.x-x,v.y-y)<BALANCE.villageRadius*2)||this.buildings.items.some(h=>Math.hypot(h.x-x,h.y-y)<BALANCE.villageRadius))continue;return {x,y};}return null;}
  updateAutomaticActions(people){
    for(const k of this.kingdoms){
      const now=this.ageSeconds,checkedAt=k.autoActionCheckedAt??now;
      k.autoActionCooldown=Math.max(0,(k.autoActionCooldown??0)-(now-checkedAt));
      k.autoActionCheckedAt=now;
      const m=k.military??{soldiers:0};
      if(k.autoActionCooldown>0||m.soldiers<8)continue;
      const enemies=this.kingdoms.filter(other=>other.id!==k.id&&other.castle&&(other.peaceUntil??0)<=now)
        .sort((a,b)=>Math.hypot((a.capitalX??0)-(k.capitalX??0),(a.capitalY??0)-(k.capitalY??0))-
                     Math.hypot((b.capitalX??0)-(k.capitalX??0),(b.capitalY??0)-(k.capitalY??0)));
      if((k.peaceUntil??0)<=now&&enemies.length&&this.startInvasion(k.id,'kingdom',enemies[0].id,people)){k.autoActionCooldown=180;continue;}
      if(m.soldiers>=12&&this.kingdomStock(k.id).food>=80){
        const origin=this.kingdomCapitalPoint(k),spot=origin&&this.findUnclaimedLand(origin,true);
        if(spot&&this.createShip(k.id,spot.x,spot.y,people)){k.autoActionCooldown=240;continue;}
        const newSpot=origin&&this.findUnclaimedLand(origin,false);
        if(newSpot&&this.foundLandColony(k,newSpot,people)){k.autoActionCooldown=300;}
      }
    }
  }
  foundLandColony(kingdom,site,people){
    const population=people.filter(p=>p.alive&&p.kingdomId===kingdom.id&&!p.shipId&&!p.invasionId).length;
    if(population<30)return false;
    const count=Math.min(20,Math.max(10,Math.floor(population*.2)));
    const group=people.filter(p=>p.alive&&p.kingdomId===kingdom.id&&!p.shipId&&!p.invasionId)
      .sort((a,b)=>Number(!!a.spouseId)-Number(!!b.spouseId)).slice(0,count);
    if(group.length<10)return false;
    const village=this.createManual('village',site.x,site.y,people,false,false);
    this.relocate(people,village,group);
    if(population>=45)this.foundKingdom(village,'開拓者によって建国されました');
    else village.kingdomId=kingdom.id;
    this.addNews(`${kingdom.name}から${group.length}人が陸路で移住し、${village.name}を開拓しました。`);
    return true;
  }
  kingdomCapitalPoint(k){if(Number.isFinite(k.capitalX)&&Number.isFinite(k.capitalY))return {x:k.capitalX,y:k.capitalY};if(Number.isFinite(k.x)&&Number.isFinite(k.y))return {x:k.x,y:k.y};const v=this.villages.find(v=>v.kingdomId===k.id);return v?{x:v.x,y:v.y}:null;}
  coastDistance(x,y){
    for(let radius=1;radius<=12;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
      if(this.world.tile(x+dx,y+dy)===0)return radius;
    }
    return 13;
  }
  foundKingdom(v,reason){
    const id=this.nextKingdomId++;
    const base=['アソス','ベルナ','セリオ','ルミナ','ノルド','ミラ'][(id-1)%6];
    const k={id,name:`${base}${id>6?id:''}国`,cell:v.cell,x:v.x,y:v.y,leaderId:null,nextSecessionAt:this.ageSeconds+180,peaceUntil:this.ageSeconds+720};
    this.kingdoms.push(k);v.kingdomId=id;v.kingdomLocked=true;
    this.addNews(`${v.name}を中心に${k.name}が${reason}。`);
    return k;
  }
  foundEnclaves(people){
    for(const v of this.villages){
      if(v.kingdomId!==null||v.houseIds.length<5||this.members(v,people).length<12
        ||this.invasions.some(i=>i.targetType==='village'&&i.targetId===v.id))continue;
      const surrounded=this.villages.some(other=>other.kingdomId!==null
        &&Math.hypot(v.x-other.x,v.y-other.y)<BALANCE.villageRadius*2);
      if(surrounded)this.foundKingdom(v,'建国されました');
    }
  }
  secessionSite(origin){
    const region=this.region(Math.floor(origin.y)*this.world.width+Math.floor(origin.x));
    let best=null,score=-Infinity;
    for(let y=8;y<this.world.height-8;y+=8)for(let x=8;x<this.world.width-8;x+=8){
      if(!this.world.walkable(x+.5,y+.5)||this.region(y*this.world.width+x)!==region)continue;
      const distance=Math.hypot(x-origin.x,y-origin.y);
      if(distance<30||this.villages.some(v=>Math.hypot(v.x-x,v.y-y)<BALANCE.villageRadius*2)
        ||this.buildings.items.some(h=>Math.hypot(h.x-x,h.y-y)<BALANCE.villageRadius))continue;
      const value=distance+this.coastDistance(x,y)*3;
      if(value>score){score=value;best={x:x+.5,y:y+.5};}
    }
    return best;
  }
  relocate(people,village,group){
    const ids=new Set(group.map(p=>p.id));
    for(const p of group){
      if(p.spouseId&&!ids.has(p.spouseId)){
        const partner=people.find(other=>other.id===p.spouseId);
        if(partner)partner.spouseId=null;
        p.spouseId=null;
      }
      this.buildings.release(p);p.home=null;p.site=null;p.x=village.x;p.y=village.y;
      p.setTask(null);p.societyLock=true;p.villageId=village.id;
    }
    this.family.syncOwners(people);
  }
  updateSecession(people){
    for(const k of [...this.kingdoms]){
      if(k.god)continue;
      const owned=this.villages.filter(v=>v.kingdomId===k.id);
      const population=owned.reduce((total,v)=>total+this.members(v,people).length,0);
      if(population<45||this.invasions.some(i=>i.targetType==='kingdom'&&i.targetId===k.id))continue;
      k.nextSecessionAt??=this.ageSeconds+180;
      if(this.ageSeconds<k.nextSecessionAt)continue;
      const origin=this.kingdomCapitalPoint(k)??{x:owned[0].x,y:owned[0].y};
      const candidates=owned.map(v=>({
        village:v,pop:this.members(v,people).length,
        distance:Math.hypot(v.x-origin.x,v.y-origin.y),
        inland:this.coastDistance(Math.floor(v.x),Math.floor(v.y))
      })).filter(c=>c.pop>=15&&population-c.pop>=20&&!c.village.kingdomLocked&&c.village.cell!==k.castleCell
        &&!this.invasions.some(i=>i.targetType==='village'&&i.targetId===c.village.id));
      candidates.sort((a,b)=>(b.distance+b.inland*3)-(a.distance+a.inland*3));
      const candidate=candidates.find(c=>c.distance>=22||c.inland>=6||population>=65);
      if(candidate){
        this.foundKingdom(candidate.village,'分離独立しました');
        this.addNews(`${candidate.pop}人が${k.name}から独立しました。`);
        k.nextSecessionAt=this.ageSeconds+300;
        continue;
      }
      if(population>=55){
        const site=this.secessionSite(origin);
        if(site){
          const village=this.createManual('village',site.x,site.y,people,false,false);
          const count=Math.min(20,Math.max(10,Math.floor(population*.25)));
          const group=people.filter(p=>p.alive&&p.kingdomId===k.id&&!p.shipId)
            .sort((a,b)=>Number(!!a.spouseId)-Number(!!b.spouseId)).slice(0,count);
          this.relocate(people,village,group);
          this.foundKingdom(village,'分離独立しました');
          this.addNews(`${group.length}人が新天地へ移住しました。`);
          k.nextSecessionAt=this.ageSeconds+300;
          continue;
        }
      }
      k.nextSecessionAt=this.ageSeconds+45;
    }
  }
  spendSupplies(stores,amount){
    let food=amount;
    for(const store of stores){const used=Math.min(food,store.food);store.food-=used;food-=used;if(!food)break;}
  }
  startInvasion(attackerId,targetType,targetId,people=[]){if(attackerId===targetId&&targetType==='kingdom')return false;const attacker=this.kingdoms.find(k=>k.id===attackerId);if(!attacker?.military?.soldiers)return false;if(this.invasions.some(i=>i.attackerId===attackerId))return false;const target=targetType==='kingdom'?this.kingdoms.find(k=>k.id===targetId):this.villages.find(v=>v.id===targetId);if(!target||targetType==='village'&&target.kingdomId===attackerId)return false;const from=this.kingdomCapitalPoint(attacker)??{x:attacker.x??0,y:attacker.y??0},to=targetType==='kingdom'?(this.kingdomCapitalPoint(target)??{x:target.x??0,y:target.y??0}):{x:target.x,y:target.y};const troops=people.filter(p=>p.alive&&p.kingdomId===attackerId&&!p.shipId&&!p.invasionId).slice(0,5);if(troops.length<5)return false;const inv={attackerId,targetType,targetId,progress:0,phase:'march',marchProgress:0,fromX:from.x,fromY:from.y,toX:to.x,toY:to.y,troopIds:troops.map(p=>p.id),startedAt:this.ageSeconds};for(const p of troops)p.invasionId=this.invasions.length+1;this.invasions.push(inv);this.addNews(`${attacker.name}が${target.name}へ槍兵5人を率いて侵攻を開始しました。`);return true;}
  passengerGroup(kingdomId,people){const eligible=people.filter(p=>p.alive&&p.kingdomId===kingdomId&&!p.shipId),preferSingle=(a,b)=>Number(!!a.spouseId)-Number(!!b.spouseId),male=eligible.filter(p=>p.sex==='male').sort(preferSingle),female=eligible.filter(p=>p.sex==='female').sort(preferSingle),chosen=[...male.slice(0,5),...female.slice(0,5)];for(const p of eligible)if(chosen.length<10&&!chosen.includes(p))chosen.push(p);return chosen.slice(0,10);}
  createShip(kingdomId,targetX,targetY,people=[]){
    const kingdom=this.kingdoms.find(k=>k.id===kingdomId);
    const capital=kingdom&&this.walkableNear(kingdom.castleCell??kingdom.capitalCell??null);
    const targetCell=Math.floor(targetY)*this.world.width+Math.floor(targetX);
    if(!kingdom||capital===null||!this.world.walkable(targetX,targetY)
      ||this.region(capital)===this.region(targetCell)
      ||this.villages.some(v=>Math.hypot(v.x-targetX,v.y-targetY)<BALANCE.villageRadius*2)
      ||this.ships.some(s=>s.kingdomId===kingdomId))return false;
    const passengers=this.passengerGroup(kingdomId,people);
    if(passengers.length<10||!passengers.some(p=>p.sex==='male')||!passengers.some(p=>p.sex==='female'))return false;
    const need={wood:20,stone:10,food:30};
    if(!this.takeKingdomStock(kingdom,need))return false;
    const id=this.nextShipId++,startX=capital%this.world.width+.5,startY=Math.floor(capital/this.world.width)+.5;
    for(const p of passengers){p.shipId=id;p.villageId=null;p.kingdomId=null;p.setTask(`ship-${id}`);p.action='船で新天地へ移動中';}
    this.ships.push({id,kingdomId,x:startX,y:startY,startX,startY,targetX,targetY,progress:0,duration:18,passengerIds:passengers.map(p=>p.id)});
    this.addNews(`${kingdom.name}から10人を乗せた船が出航しました。`);
    return true;
  }
  landShip(ship,people){
    const village=this.createManual('village',ship.targetX,ship.targetY,people,false,false);
    if(!village)return;
    const passengerIds=new Set(ship.passengerIds??[]);
    const passengers=people.filter(p=>passengerIds.has(p.id));
    for(const p of passengers){
      if(p.spouseId&&!passengerIds.has(p.spouseId)){
        const spouse=people.find(other=>other.id===p.spouseId);
        if(spouse)spouse.spouseId=null;
        p.spouseId=null;
      }
      this.buildings.release(p);p.home=null;p.site=null;p.shipId=null;
      p.x=village.x;p.y=village.y;p.setTask(null);
      p.societyLock=true;p.villageId=village.id;p.kingdomId=null;p.country='アソス';
    }
    this.family.syncOwners(people);
    this.addNews(`${village.name}が新天地に誕生し、${passengers.length}人が移住しました。`);
  }
  resolveInvasion(inv){const attacker=this.kingdoms.find(k=>k.id===inv.attackerId),target=inv.targetType==='kingdom'?this.kingdoms.find(k=>k.id===inv.targetId):this.villages.find(v=>v.id===inv.targetId);if(!attacker||!target)return true;if(inv.targetType==='kingdom'){for(const v of this.villages)if(v.kingdomId===target.id){v.kingdomId=attacker.id;v.kingdomLocked=true;}this.kingdoms=this.kingdoms.filter(k=>k.id!==target.id);this.addNews(`${attacker.name}が${target.name}を併合しました。`);return true;}target.kingdomId=attacker.id;target.kingdomLocked=true;target.fortification=null;this.addNews(`${attacker.name}が${target.name}を併合しました。`);return true;}
  updateConflict(dt,people){
    this.syncMilitary(people);
    for(const inv of this.invasions){const attacker=this.kingdoms.find(k=>k.id===inv.attackerId),target=inv.targetType==='kingdom'?this.kingdoms.find(k=>k.id===inv.targetId):this.villages.find(v=>v.id===inv.targetId);if(!attacker||!target||!attacker.military?.soldiers){inv.done=true;continue;}if(inv.phase==='march'){inv.marchProgress=Math.min(1,(inv.marchProgress??0)+dt/Math.max(5,Math.min(18,Math.hypot(inv.toX-inv.fromX,inv.toY-inv.fromY)*.12)));if(inv.marchProgress>=1)inv.phase='battle';continue;}const stock=inv.targetType==='kingdom'?this.kingdomStock(target.id):target.stock,defense=inv.targetType==='kingdom'?(target.military?.defense??0):Math.floor((target.fortification??(50+target.houseIds.length*5))/4),supply=Math.floor((stock.food??0)/20+(stock.wood??0)/10+(stock.stone??0)/10),attack=attacker.military.attack+Math.floor((this.kingdomStock(attacker.id).food??0)/30),edge=attack-defense-supply*.35;inv.battleTime=(inv.battleTime??0)+dt;if(edge<=0){const counter=Math.max(.3,-edge*.04)*dt;attacker.castle&&(attacker.castle.hp=Math.max(0,attacker.castle.hp-counter));inv.progress=Math.min(.95,inv.progress+counter/Math.max(1,attacker.castle?.maxHp??100));if(inv.battleTime>=90||attacker.castle?.hp<=0){inv.done=true;this.addNews(`${attacker.name}の侵攻軍が撃退されました。`);}continue;}const damage=Math.max(.5,edge*.12)*dt;inv.supplySpent=(inv.supplySpent??0)+damage*.12;const supplies=Math.floor(inv.supplySpent);inv.supplySpent-=supplies;this.spendSupplies(this.villages.filter(v=>v.kingdomId===attacker.id).map(v=>v.stock),supplies);if(inv.targetType==='kingdom')this.spendSupplies(this.villages.filter(v=>v.kingdomId===target.id).map(v=>v.stock),Math.floor(supplies/2));else this.spendSupplies([target.stock],Math.floor(supplies/2));if(inv.targetType==='kingdom'){target.castle??={hp:100,maxHp:100};target.castle.hp-=damage;inv.progress=1-target.castle.hp/target.castle.maxHp;if(target.castle.hp<=0){this.resolveInvasion(inv);inv.done=true;}}else{target.fortification??=50+target.houseIds.length*5;target.fortification-=damage;inv.progress=1-target.fortification/(50+target.houseIds.length*5);if(target.fortification<=0){this.resolveInvasion(inv);inv.done=true;}}}
    for(const inv of this.invasions){for(const id of inv.troopIds??[]){const p=people.find(person=>person.id===id);if(!p)continue;if(inv.done){p.invasionId=null;continue;}const t=inv.phase==='march'?(inv.marchProgress??0):1;p.x=inv.fromX+(inv.toX-inv.fromX)*t;p.y=inv.fromY+(inv.toY-inv.fromY)*t;}}
    this.invasions=this.invasions.filter(i=>!i.done);
    for(const ship of this.ships){
      ship.progress=Math.min(1,ship.progress+dt/ship.duration);
      ship.x=ship.startX+(ship.targetX-ship.startX)*ship.progress;
      ship.y=ship.startY+(ship.targetY-ship.startY)*ship.progress;
      if(ship.progress>=1){this.landShip(ship,people);ship.done=true;}
    }
    this.ships=this.ships.filter(s=>!s.done);
  }
  update(dt,people,force=false){
    this.ageSeconds+=dt;if(dt>0)this.updateConflict(dt,people);this.clock+=dt;if(!force&&this.clock<2)return;this.clock=0;
    const homes=this.buildings.items.filter(h=>h.complete),assigned=new Set();
    for(const v of this.villages){const candidates=homes.filter(h=>this.region(h.cell)===this.region(v.cell)&&Math.hypot(h.x-v.x,h.y-v.y)<=BALANCE.villageRadius&&!assigned.has(h.id)).slice(0,BALANCE.villageHouseLimit);v.houseIds=candidates.map(h=>{assigned.add(h.id);return h.id;});}
    for(const seed of homes){
      if(assigned.has(seed.id))continue;
      const group=homes.filter(h=>!assigned.has(h.id)&&this.region(h.cell)===this.region(seed.cell)&&Math.hypot(h.x-seed.x,h.y-seed.y)<=BALANCE.villageRadius);
      if(group.length<BALANCE.villageHouses)continue;
      const id=this.nextVillageId++;const v={id,name:`集落${id}`,cell:seed.cell,x:seed.x,y:seed.y,houseIds:group.slice(0,BALANCE.villageHouseLimit).map(h=>h.id),leaderId:null,kingdomId:null,kingdomLocked:false,stock:{food:0,wood:0,stone:0},farmCell:null};
      this.villages.push(v);this.addNews(`${v.name}が誕生しました。`);for(const h of group.slice(0,BALANCE.villageHouseLimit))assigned.add(h.id);
    }
    const houseVillage=new Map();for(const v of this.villages)for(const id of v.houseIds)houseVillage.set(id,v);
    for(const p of people){if(p.shipId)continue;const locked=p.societyLock&&this.villages.find(v=>v.id===p.villageId),v=locked||(p.home&&houseVillage.get(p.home.id))||this.villages.find(v=>this.region(p.cell(this.world))===this.region(v.cell)&&Math.hypot(p.x-v.x,p.y-v.y)<=BALANCE.villageRadius);p.villageId=v?.id??null;}
    for(const v of this.villages){v.leaderId=this.leader(this.members(v,people),v.leaderId);if(v.farmCell===null&&this.members(v,people).some(p=>p.age>=18))this.createFarm(v);}
    // A populated enclave gets a chance to form its own state before neighbors absorb it.
    if(dt>0)this.foundEnclaves(people);
    // Nearby settlements unite once their combined population is large enough.
    const radius=this.kingdomRadius();
    for(const v of this.villages)if(!v.kingdomId&&!v.kingdomLocked){const nearby=this.villages.filter(other=>other.kingdomId!==null&&this.region(other.cell)===this.region(v.cell)&&Math.hypot(v.x-other.x,v.y-other.y)<=radius).sort((a,b)=>Math.hypot(v.x-a.x,v.y-a.y)-Math.hypot(v.x-b.x,v.y-b.y));const owner=nearby.find(other=>this.villages.filter(item=>item.kingdomId===other.kingdomId).length<BALANCE.kingdomVillageLimit);if(owner)v.kingdomId=owner.kingdomId;}
    for(const seed of this.villages){if(seed.kingdomId)continue;
      if(seed.kingdomLocked)continue;
      if(seed.houseIds.length>=BALANCE.kingdomSingleVillageHouses){const id=this.nextKingdomId++,base=['アソス','ベルナ','セリオ','ルミナ','ノルド','ミラ'][((id-1)%6)],kingdom={id,name:`${base}${id>6?id:''}国`,leaderId:null};this.kingdoms.push(kingdom);this.addNews(`${kingdom.name}が建国されました。`);seed.kingdomId=id;continue;}
      const group=[seed],seen=new Set([seed.id]);for(let i=0;i<group.length&&group.length<BALANCE.kingdomVillageLimit;i++)for(const v of this.villages)if(group.length<BALANCE.kingdomVillageLimit&&!v.kingdomId&&!v.kingdomLocked&&!seen.has(v.id)&&this.region(v.cell)===this.region(group[i].cell)&&Math.hypot(v.x-group[i].x,v.y-group[i].y)<=radius){seen.add(v.id);group.push(v);}
      const pop=people.filter(p=>seen.has(p.villageId)).length;
      const houses=group.reduce((total,v)=>total+v.houseIds.length,0),singleVillage=group.length===1;
      if((singleVillage&&houses>=BALANCE.kingdomSingleVillageHouses)||(group.length>=BALANCE.kingdomVillages&&pop>=BALANCE.kingdomPopulation)){const id=this.nextKingdomId++,base=['アソス','ベルナ','セリオ','ルミナ','ノルド','ミラ'][((id-1)%6)],kingdom={id,name:`${base}${id>6?id:''}国`,leaderId:null};this.kingdoms.push(kingdom);this.addNews(`${kingdom.name}が建国されました。`);for(const v of group)v.kingdomId=id;}
    }
    if(dt>0)this.updateSecession(people);
    for(const p of people){const v=this.villageFor(p),k=this.kingdoms.find(k=>k.id===v?.kingdomId);p.kingdomId=k?.id??null;p.country=k?.name??'アソス';}
    this.buildings.extraOccupied=new Set(this.villages.map(v=>v.farmCell).filter(c=>c!==null));
    for(const k of this.kingdoms){k.leaderId=this.leader(people.filter(p=>p.kingdomId===k.id),k.leaderId);const ruler=people.find(p=>p.id===k.leaderId),v=ruler&&this.villageFor(ruler);if(ruler){const base=ruler.home?.cell??ruler.cell?.(this.world)??v?.cell??k.cell??null,cell=this.walkableNear(base);if(cell!==null){k.capitalCell=cell;k.castleCell=cell;k.capitalX=cell%this.world.width+.5;k.capitalY=Math.floor(cell/this.world.width)+.5;}}}
    this.syncMilitary(people);if(dt>0)this.updateAutomaticActions(people);
  }
  createFarm(v){
    const occupied=new Set([...this.buildings.items.map(h=>h.cell),...this.food.byCell.keys(),...this.materials.byCell.keys(),...this.villages.map(v=>v.farmCell)]);
    const cx=Math.floor(v.x),cy=Math.floor(v.y);
    for(let r=2;r<=10;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const x=cx+dx,y=cy+dy;if(x<0||y<0||x>=this.world.width||y>=this.world.height)continue;const cell=y*this.world.width+x;
      if(this.world.tiles[cell]===2&&!occupied.has(cell)&&this.region(cell)===this.region(v.cell)){v.farmCell=cell;return;}
    }
  }
  eatFromStore(p,dt){
    const v=this.villageFor(p);if(!v||v.stock.food<1||this.region(p.cell(this.world))!==this.region(v.cell))return false;
    p.setTask(`store-food-${v.id}`);p.action='集落の食料を取りに行く';
    if(p.travelTo(v.cell,dt,this.world)&&v.stock.food>0){v.stock.food--;p.mealTimer=BALANCE.mealSeconds;p.action='備蓄の食料で食事中';}return true;
  }
  work(p,dt,people){
    const v=this.villageFor(p);if(!v||p.age<BALANCE.adultAge||!p.home||this.region(p.cell(this.world))!==this.region(v.cell))return false;
    if(p.cargo){p.setTask(`deliver-${v.id}`);p.action='集落の倉庫へ運ぶ';if(p.travelTo(v.cell,dt,this.world)){v.stock[p.cargo]=Math.min(9999,v.stock[p.cargo]+1);p.cargo=null;}return true;}
    const population=this.members(v,people).length,cell=p.cell(this.world);
    const jobs=[['food',Math.max(6,population*3)],['wood',Math.max(6,population*2)],['stone',Math.max(4,population)]];
    const available=jobs.filter(([kind,target])=>v.stock[kind]<target&&(kind==='food'?v.farmCell!==null:this.materials.routes[kind][cell]>=0));
    if(!available.length)return false;
    const kind=available.sort((a,b)=>v.stock[a[0]]/a[1]-v.stock[b[0]]/b[1])[0][0];
    p.setTask(`work-${v.id}-${kind}`);
    if(kind==='food'){
      p.action='畑へ向かう';if(p.travelTo(v.farmCell,dt,this.world)){p.action='畑を耕して収穫';p.gatherTimer+=dt;if(p.gatherTimer>=BALANCE.farmWorkSeconds){p.cargo='food';p.gatherTimer=0;}}return true;
    }
    p.action=kind==='wood'?'集落の木材を集める':'集落の石材を集める';
    if(p.travelField(this.materials.routes[kind],dt,this.world)==='arrived'){p.gatherTimer+=dt;if(p.gatherTimer>=BALANCE.gatherSeconds){if(this.materials.take(p.cell(this.world),kind))p.cargo=kind;p.gatherTimer=0;}}return true;
  }
  supplyHouse(p,dt){
    const v=this.villageFor(p);if(!v||p.home||p.age<18)return false;
    const wood=Math.max(0,BALANCE.houseWood-p.wood),stone=Math.max(0,BALANCE.houseStone-p.stone);
    if((!wood||!v.stock.wood)&&(!stone||!v.stock.stone))return false;
    p.setTask(`building-stock-${v.id}`);p.action='備蓄から家の材料を受け取る';
    if(p.travelTo(v.cell,dt,this.world)){const a=Math.min(wood,v.stock.wood),b=Math.min(stone,v.stock.stone);p.wood+=a;p.stone+=b;v.stock.wood-=a;v.stock.stone-=b;}return true;
  }

  createManual(type,x,y,people=[],refresh=true,announce=true){
    if(!this.world.walkable(x,y))return null;
    const cell=Math.floor(y)*this.world.width+Math.floor(x);
    if(type==='village'){const v={id:this.nextVillageId++,name:`集落${this.nextVillageId-1}`,cell,x:Math.floor(x)+.5,y:Math.floor(y)+.5,houseIds:[],leaderId:null,kingdomId:null,kingdomLocked:false,stock:{food:0,wood:0,stone:0},farmCell:null,manual:true};this.villages.push(v);if(announce)this.addNews(`${v.name}が誕生しました。`);if(refresh)this.update(0,people,true);return v;}
    const id=this.nextKingdomId++,base=['アソス','ベルナ','セリオ','ルミナ','ノルド','ミラ'][(id-1)%6];const k={id,name:`${base}${id>6?id:''}国`,cell,x:Math.floor(x)+.5,y:Math.floor(y)+.5,leaderId:null,manual:true};this.kingdoms.push(k);if(announce)this.addNews(`${k.name}が建国されました。`);if(refresh)this.update(0,people,true);return k;
  }
  createIndependent(x,y,people=[],refresh=true){if(!this.world.walkable(x,y)||this.villages.some(v=>Math.hypot(v.x-x,v.y-y)<BALANCE.villageRadius*2)||this.buildings.items.some(h=>Math.hypot(h.x-x,h.y-y)<BALANCE.villageRadius))return null;return this.createManual('village',x,y,people,refresh);}
  renameVillage(id,name){const v=this.villages.find(v=>v.id===id);if(v&&name?.trim()){v.name=name.trim().slice(0,40);return true;}return false;}
  renameKingdom(id,name){const k=this.kingdoms.find(k=>k.id===id);if(k&&name?.trim()){k.name=name.trim().slice(0,40);return true;}return false;}
  assignVillage(villageId,kingdomId){const v=this.villages.find(v=>v.id===villageId);if(!v)return false;if(kingdomId!==null&&!this.kingdoms.some(k=>k.id===kingdomId))return false;v.kingdomId=kingdomId;v.kingdomLocked=true;return true;}
  kingdomStock(id){return this.villages.filter(v=>v.kingdomId===id).reduce((total,v)=>{for(const key of ['food','wood','stone'])total[key]+=v.stock[key];return total;},{food:0,wood:0,stone:0});}
}
