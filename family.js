import {BALANCE} from './settings.js';
import {neighbors} from './navigation.js';
/** Kinship uses IDs so deceased people are not retained in the live population. */
export class FamilySystem {
  constructor(world,buildings,random=Math.random){
    this.world=world;this.buildings=buildings;this.random=random;this.time=0;this.tick=0;this.births=0;
    this.news='18歳以上の男女と家がそろうと、結婚できます。';
    this.regions=new Int32Array(world.tiles.length);this.regions.fill(-1);let region=0;
    for(let i=0;i<world.tiles.length;i++)if(this.regions[i]===-1&&world.walkable(i%world.width+.5,Math.floor(i/world.width)+.5)){
      const queue=[i];this.regions[i]=region;
      for(let j=0;j<queue.length;j++)for(const n of neighbors(queue[j],world))if(this.regions[n]===-1){this.regions[n]=region;queue.push(n);}
      region++;
    }
  }
  related(a,b){return a.ancestors.has(b.id)||b.ancestors.has(a.id)||[...a.ancestors].some(id=>b.ancestors.has(id));}
  eligible(a,b){return a!==b&&a.alive&&b.alive&&!a.shipId&&!b.shipId&&!a.spouseId&&!b.spouseId&&a.age>=BALANCE.adultAge&&b.age>=BALANCE.adultAge&&a.sex!==b.sex&&a.country===b.country&&!this.related(a,b)&&this.regions[a.cell(this.world)]===this.regions[b.cell(this.world)]&&Math.hypot(a.x-b.x,a.y-b.y)<=BALANCE.marriageRadius&&!!(a.home||b.home);}
  marry(a,b,people){
    if(!this.eligible(a,b))return false;
    const home=a.home||b.home;
    for(const p of [a,b]){p.spouseId=p===a?b.id:a.id;p.home=home;p.dependent=false;p.site=null;p.setTask(null);p.nextBirthAt=this.time+BALANCE.birthInterval;
      this.buildings.items=this.buildings.items.filter(h=>h.complete||h.ownerId!==p.id);
      for(const child of people)if(child.alive&&child.age<BALANCE.adultAge&&child.parentIds.includes(p.id)){child.home=home;child.setTask(null);}
    }
    this.syncOwners(people);this.news=`${a.name}と${b.name}が結婚。家${home.id}で暮らします。`;return true;
  }
  syncOwners(people){for(const h of this.buildings.items)if(h.complete){const residents=people.filter(p=>p.alive&&p.home===h);if(!residents.some(p=>p.id===h.ownerId))h.ownerId=residents[0]?.id??null;}}
  onDeath(person,people){
    const partner=people.find(p=>p.id===person.spouseId);
    if(partner){partner.spouseId=null;partner.nextBirthAt=this.time+BALANCE.birthInterval;}
    person.spouseId=null;this.syncOwners(people);
  }
  litterSize(){const r=this.random();return r<.85?1:r<.98?2:3;}
  update(dt,people,createChild){
    this.time+=dt;this.tick+=dt;if(this.tick<1)return;this.tick=0;
    const byId=new Map(people.map(p=>[p.id,p]));
    for(const p of people){
      if(p.dependent&&p.age>=BALANCE.adultAge){p.dependent=false;p.home=null;p.setTask(null);}
      // Nearby parents share food with young children, at a cost to their own fullness.
      if(p.age<6&&p.fullness<45){const parent=p.parentIds.map(id=>byId.get(id)).find(a=>a?.alive&&a.fullness>65&&Math.hypot(a.x-p.x,a.y-p.y)<4);if(parent){parent.hunger=Math.min(100,parent.hunger+15);p.hunger=Math.max(0,p.hunger-30);}}
    }
    for(const a of people){if(a.spouseId||a.age<BALANCE.adultAge)continue;const b=people.find(b=>this.eligible(a,b));if(b)this.marry(a,b,people);}
    // Each couple is processed once, using the mother's record.
    for(const mother of [...people]){
      if(mother.shipId||mother.sex!=='female'||mother.age<BALANCE.adultAge||mother.age>=BALANCE.birthMaxAge||!mother.spouseId||this.time<mother.nextBirthAt)continue;
      const father=byId.get(mother.spouseId),home=mother.home;
      if(!father?.alive||father.shipId||father.spouseId!==mother.id||!home?.complete||father.home!==home||mother.fullness<55||father.fullness<55||mother.hp<50||father.hp<50)continue;
      if(Math.hypot(mother.x-home.x,mother.y-home.y)>3||Math.hypot(father.x-home.x,father.y-home.y)>3)continue;
      // Postpone the complete litter near the performance cap, preserving the odds.
      if(people.length>BALANCE.populationLimit-3)continue;
      const count=this.litterSize();
      for(let i=0;i<count;i++){
        const child=createChild(home.x,home.y,this.random()<.5?'male':'female');
        child.country=mother.country;child.parentIds=[mother.id,father.id];child.ancestors=new Set([...mother.ancestors,...father.ancestors,mother.id,father.id]);child.home=home;child.dependent=true;
        mother.children.push(child.id);father.children.push(child.id);this.births++;
      }
      mother.nextBirthAt=father.nextBirthAt=this.time+BALANCE.birthInterval;
      this.news=`${mother.name}と${father.name}の家族に${count===1?'子ども':count===2?'双子':'三つ子'}が生まれました！`;
    }
    this.syncOwners(people);
  }
}
