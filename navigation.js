/** Walkable grid routes shared by resource seekers. */
export function neighbors(cell, world) {
  const x=cell%world.width,y=Math.floor(cell/world.width),w=world.width;
  return [x>0?cell-1:-1,x<w-1?cell+1:-1,y>0?cell-w:-1,y<world.height-1?cell+w:-1]
    .filter(n=>n>=0&&(world.tiles[n]===1||world.tiles[n]===2||world.tiles[n]===4));
}
export function routeField(world, sources) {
  const routes=new Int32Array(world.tiles.length);routes.fill(-1);
  const queue=new Int32Array(routes.length);let head=0,tail=0;
  for(const i of sources){routes[i]=i;queue[tail++]=i;}
  while(head<tail){const i=queue[head++];for(const n of neighbors(i,world))if(routes[n]===-1){routes[n]=i;queue[tail++]=n;}}
  return routes;
}
/** One return journey needs only a short path, not a full field per person. */
export function findPath(world, start, goal) {
  if(start===goal)return [];
  const parent=new Int32Array(world.tiles.length);parent.fill(-1);parent[start]=start;
  const queue=[start];
  for(let head=0;head<queue.length;head++)for(const n of neighbors(queue[head],world)){
    if(parent[n]!==-1)continue;parent[n]=queue[head];
    if(n===goal){const path=[];for(let c=goal;c!==start;c=parent[c])path.push(c);return path.reverse();}
    queue.push(n);
  }
  return null;
}
