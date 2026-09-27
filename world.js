/** Seeded value noise and domain-warped island terrain. No network assets. */
export class World {
  constructor(seed, width=240, height=160) {
    this.seed=seed; this.width=width; this.height=height;
    this.tiles=new Uint8Array(width*height); this.elevation=new Float32Array(width*height);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const nx=x/width,ny=y/height;
      const warp=this.noise(nx*5+32,ny*5+51)-.5;
      const broad=this.noise(nx*4.4+warp*.9,ny*4.4+warp*.9);
      const detail=this.noise(nx*13+74,ny*13+21);
      const edge=Math.pow(Math.max(Math.abs(nx*2-1),Math.abs(ny*2-1)),5);
      const h=broad*.78+detail*.17+this.noise(nx*36,ny*36)*.05-edge*.48;
      const i=y*width+x; this.elevation[i]=h;
      this.tiles[i]=h<.46?0:h<.50?1:h<.70?2:3;
    }
  }
  hash(x,y){let n=Math.imul(x,374761393)+Math.imul(y,668265263)+this.seed;n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
  noise(x,y){const a=Math.floor(x),b=Math.floor(y);let u=x-a,v=y-b;u=u*u*(3-2*u);v=v*v*(3-2*v);return (this.hash(a,b)*(1-u)+this.hash(a+1,b)*u)*(1-v)+(this.hash(a,b+1)*(1-u)+this.hash(a+1,b+1)*u)*v;}
  tile(x,y){if(x<0||y<0||x>=this.width||y>=this.height)return 0;return this.tiles[Math.floor(y)*this.width+Math.floor(x)];}
  walkable(x,y){const t=this.tile(x,y);return t===1||t===2;}
}
