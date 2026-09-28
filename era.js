import {BALANCE} from './settings.js';

/** Milestones are derived from elapsed world time, so old saves need no migration. */
export const ERA_MILESTONES=Object.freeze([
  {year:0,label:'投石の時代'},
  {year:15,label:'石槍と庭の時代'},
  {year:45,label:'公園と商店の時代'},
  {year:50,label:'道路と車の時代'},
  {year:70,label:'浮遊都市の時代'}
]);

export function currentEra(seconds){
  const years=seconds/BALANCE.secondsPerYear;
  return years>=70?ERA_MILESTONES[4]:years>=50?ERA_MILESTONES[3]:years>=45?ERA_MILESTONES[2]:
    years>=15?ERA_MILESTONES[1]:ERA_MILESTONES[0];
}

/** Small yards are decoration: no extra world entities or update loops. */
export function drawYard(ctx,game,house){
  if(currentEra(game.elapsedSeconds).year<15||game.scale<game.minScale*3)return;
  const x=game.x+house.x*game.scale,y=game.y+house.y*game.scale;
  if(x<-20||y<-20||x>game.w+20||y>game.h+20)return;
  const r=Math.max(4,game.scale*1.2);
  ctx.strokeStyle='#dbce9b';ctx.lineWidth=Math.max(1,game.scale*.08);
  ctx.strokeRect(x-r*1.8,y-r*1.4,r*3.6,r*2.8);
  ctx.fillStyle='#4f824a';
  ctx.fillRect(x+r*1.25,y-r*.8,Math.max(2,r*.4),Math.max(2,r*.4));
}

/** A tiny blue lift orb carries a cyan and black home after year 70. */
export function drawFloatingHouse(ctx,game,house,x,y,r,roofColor){
  const bob=Math.sin(game.elapsedSeconds*1.5+house.id)*r*.28;
  const top=y-bob-r*.8;
  ctx.fillStyle='#7ee5f4';ctx.beginPath();
  ctx.arc(x,y+r*1.1,Math.max(3,r*.72),0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#1b2e38';ctx.fillRect(x-r*1.1,top-r*.75,r*2.2,r*1.65);
  ctx.fillStyle='#87dcf3';ctx.fillRect(x-r*.8,top-r*.48,r*1.6,r*1.13);
  ctx.fillStyle='#102a36';ctx.fillRect(x-r*.28,top+r*.05,r*.56,r*.6);
  ctx.fillStyle=roofColor;ctx.fillRect(x-r*1.05,top-r*.84,r*2.1,r*.25);
  ctx.fillStyle='#cef6fa';ctx.fillRect(x+r*.32,top-r*.2,r*.22,r*.22);
}
