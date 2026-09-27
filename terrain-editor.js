/** Add land with a continuous brush; cancel rolls back the entire current stroke. */
export class TerrainEditor {
  constructor(world){this.world=world;this.original=new Map();this.last=null;this.active=false;}
  begin(x,y,radius){this.original.clear();this.last={x,y};this.radius=radius;this.active=true;}
  stamp(x,y){
    const w=this.world,changed=[];
    for(let py=Math.max(0,Math.floor(y-this.radius));py<=Math.min(w.height-1,Math.ceil(y+this.radius));py++)for(let px=Math.max(0,Math.floor(x-this.radius));px<=Math.min(w.width-1,Math.ceil(x+this.radius));px++){
      if(Math.hypot(px+.5-x,py+.5-y)>this.radius)continue;
      const i=py*w.width+px;if(w.tiles[i]!==0&&w.tiles[i]!==1)continue;
      if(!this.original.has(i))this.original.set(i,{tile:w.tiles[i],height:w.elevation[i]});
      w.tiles[i]=2;w.elevation[i]=.56;changed.push(i);
    }
    return changed;
  }
  extend(x,y){
    if(!this.active)return [];
    const {x:ox,y:oy}=this.last,d=Math.hypot(x-ox,y-oy),steps=Math.max(1,Math.ceil(d/Math.max(.5,this.radius/2))),changed=new Set();
    for(let n=0;n<=steps;n++)for(const i of this.stamp(ox+(x-ox)*n/steps,oy+(y-oy)*n/steps))changed.add(i);
    this.last={x,y};return [...changed];
  }
  commit(){
    if(!this.active)return [];
    const changed=[...this.original.keys()],w=this.world;
    // The outside edge of the painted land becomes a beach.
    const coasts=changed.filter(i=>{const x=i%w.width,y=Math.floor(i/w.width);return [[x-1,y],[x+1,y],[x,y-1],[x,y+1]].some(([a,b])=>w.tile(a,b)===0);});
    for(const i of coasts){w.tiles[i]=1;w.elevation[i]=.48;}
    this.active=false;this.original.clear();this.last=null;return changed;
  }
  cancel(){const changed=[...this.original.keys()];for(const [i,value] of this.original){this.world.tiles[i]=value.tile;this.world.elevation[i]=value.height;}this.active=false;this.original.clear();this.last=null;return changed;}
}
