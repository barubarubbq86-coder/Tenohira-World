import {neighbors} from './navigation.js';
import {BALANCE} from './settings.js';
/** Houses reserve distinct ground while their owner gathers or eats. */
export class BuildingSystem {
  constructor(world,food,materials){this.world=world;this.food=food;this.materials=materials;this.items=[];this.nextId=1;}
  reserve(person){
    const world=this.world,start=Math.floor(person.y)*world.width+Math.floor(person.x),seen=new Set([start]),queue=[start];
    for(let head=0;head<queue.length&&head<3000;head++){
      const cell=queue[head],x=cell%world.width+.5,y=Math.floor(cell/world.width)+.5;
      if((world.tiles[cell]===2||world.tiles[cell]===4||world.tiles[cell]===5||world.tiles[cell]===6)&&!this.extraOccupied?.has(cell)&&!this.food.byCell.has(cell)&&!this.materials.byCell.has(cell)&&this.items.every(h=>Math.hypot(h.x-x,h.y-y)>=3)){
        const house={id:this.nextId++,cell,x,y,ownerId:person.id,progress:0,complete:false};this.items.push(house);return house;
      }
      for(const n of neighbors(cell,world))if(!seen.has(n)){seen.add(n);queue.push(n);}
    }
    return null;
  }
  complete(house,person){
    if(house.complete||house.ownerId!==person.id||person.wood<BALANCE.houseWood||person.stone<BALANCE.houseStone)return false;
    person.wood-=BALANCE.houseWood;person.stone-=BALANCE.houseStone;house.complete=true;house.progress=BALANCE.buildSeconds;person.home=house;return true;
  }
  release(person){this.items=this.items.filter(h=>h.ownerId!==person.id||h.complete);if(person.home)person.home.ownerId=null;}
  get total(){return this.items.filter(h=>h.complete).length;}
}
