import {BALANCE} from './settings.js';
import {routeField} from './navigation.js';
/** Food and a shared breadth-first route map. Routes never cross water or mountains. */
export class FoodSystem {
  constructor(world,density=BALANCE.foodDensity) {
    this.world=world; this.items=[]; this.byCell=new Map();this.clock=0;this.dirty=true;
    for(let i=0;i<world.tiles.length;i++) {
      const x=i%world.width,y=Math.floor(i/world.width);
      if(world.tiles[i]===2&&world.hash(x+917,y+581)<density){
        const food={cell:i,x:x+.5,y:y+.5,amount:BALANCE.foodCapacity,timer:0};
        this.items.push(food);this.byCell.set(i,food);
      }
    }
    this.routes=new Int32Array(world.tiles.length);this.rebuild();
  }
  rebuild(){
    const w=this.world.width,h=this.world.height;
    this.routes.fill(-1);const queue=new Int32Array(w*h);let head=0,tail=0;
    for(const f of this.items)if(f.amount>0){this.routes[f.cell]=f.cell;queue[tail++]=f.cell;}
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);
      for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1]){
        if(n<0||this.routes[n]!==-1)continue;
        const t=this.world.tiles[n];if(t!==1&&t!==2&&t!==4)continue;
        this.routes[n]=i;queue[tail++]=n;
      }
    }
    this.dirty=false;
  }
  update(dt){
    for(const f of this.items)if(f.amount<BALANCE.foodCapacity){f.timer+=dt;if(f.timer>=BALANCE.foodRegrowSeconds){f.timer-=BALANCE.foodRegrowSeconds;f.amount++;this.dirty=true;}}
    this.clock+=dt;if(this.dirty&&this.clock>=1){this.rebuild();this.clock=0;}
  }
  take(cell){const f=this.byCell.get(cell);if(!f||f.amount<=0)return false;f.amount--;this.dirty=true;return true;}
  get total(){return this.items.reduce((n,f)=>n+f.amount,0);}
}

/** Finite deposits. Timber regrows; stone stays depleted in this prototype. */
export class MaterialSystem {
  constructor(world,food,woodThreshold=.03,stoneThreshold=.05){
    this.world=world;this.items=[];this.byCell=new Map();this.clock=0;this.dirty=true;this.routes={};
    const candidates=[];
    for(let i=0;i<world.tiles.length;i++){
      if(world.tiles[i]!==2||food.byCell.has(i))continue;
      const x=i%world.width,y=Math.floor(i/world.width),r=world.hash(x+1973,y+3181);
      const kind=r<woodThreshold?'wood':r<stoneThreshold?'stone':null;
      if(kind)candidates.push({cell:i,x:x+.5,y:y+.5,kind,amount:kind==='wood'?8:12,timer:0});
    }
    // Sample the whole map evenly if deposits exceed the shared resource cap.
    const capacity=Math.max(0,3000-food.items.length);
    for(let i=0;i<Math.min(capacity,candidates.length);i++){
      const node=candidates.length<=capacity?candidates[i]:candidates[Math.floor((i+.5)*candidates.length/capacity)];
      this.items.push(node);this.byCell.set(node.cell,node);
    }
    this.rebuild();
  }
  rebuild(){for(const kind of ['wood','stone'])this.routes[kind]=routeField(this.world,this.items.filter(n=>n.kind===kind&&n.amount>0).map(n=>n.cell));this.dirty=false;}
  update(dt){for(const node of this.items)if(node.kind==='wood'&&node.amount<8){node.timer+=dt;if(node.timer>=BALANCE.woodRegrowSeconds){node.timer-=BALANCE.woodRegrowSeconds;node.amount++;this.dirty=true;}}
    this.clock+=dt;if(this.dirty&&this.clock>=1){this.rebuild();this.clock=0;}
  }
  take(cell,kind){const node=this.byCell.get(cell);if(!node||node.kind!==kind||node.amount<=0)return false;node.amount--;this.dirty=true;return true;}
}
