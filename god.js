import {Human} from './human.js';

/** Manually founded divine kingdoms, with bounded, occasional world actions. */
export class GodSystem {
  constructor(){this.effects=[];}

  place(x,y,game){
    const society=game.society,world=game.world;
    if(!world.walkable(x,y))return '神の国は歩ける陸地に置いてください';
    if(society.kingdoms.filter(k=>k.god).length>=3)return '神の国は3つまで作れます';
    if(society.villages.some(v=>Math.hypot(v.x-x,v.y-y)<14))return '既存の集落から少し離れた場所を選んでください';
    if(game.people.length+6>500)return '人口が上限に達しています';
    const village=society.createManual('village',x,y,game.people,false,false);
    const kingdom=society.createManual('kingdom',x,y,game.people,false,false);
    village.name=`神殿の集落${kingdom.id}`;
    village.kingdomId=kingdom.id;village.kingdomLocked=true;
    village.stock={food:45,wood:25,stone:15};
    kingdom.name=`神の国${kingdom.id}`;
    kingdom.god=true;kingdom.godActive=true;
    kingdom.godNextAt=game.elapsedSeconds+40;
    for(let i=0;i<6;i++){
      const px=Math.floor(x)+(i%3)-1+.5,py=Math.floor(y)+Math.floor(i/3)-1+.5;
      const cx=world.walkable(px,py)?px:village.x;
      const cy=world.walkable(px,py)?py:village.y;
      const person=new Human(game.nextId++,cx,cy,i%2?'female':'male',20+i*2);
      person.villageId=village.id;person.kingdomId=kingdom.id;
      person.societyLock=true;person.country=kingdom.name;
      game.people.push(person);
    }
    society.update(0,game.people,true);game.updateCount();
    society.addNews(`${kingdom.name}が${village.name}を中心に誕生しました。`);
    return `${kingdom.name}が誕生しました。神は時々、杖を振って世界に働きかけます`;
  }

  update(game){
    const society=game.society,now=game.elapsedSeconds;
    for(const god of society.kingdoms){
      if(!god.god||!god.godActive||now<(god.godNextAt??Infinity))continue;
      god.godNextAt=now+90+Math.random()*90;
      const home=society.kingdomCapitalPoint(god);
      if(!home)continue;
      const foreigners=society.villages.filter(v=>v.kingdomId!==god.id);
      const citizens=game.people.filter(p=>p.alive&&!p.shipId);
      const kind=Math.floor(Math.random()*4);
      let target=home,announcement='';
      if(kind===0&&citizens.length){
        const person=citizens[Math.floor(Math.random()*citizens.length)];
        person.hp=Math.min(100,person.hp+30);
        person.hunger=Math.max(0,person.hunger-30);
        person.action='神の加護を受けた';target=person;
        announcement=`${god.name}の神が杖を振り、${person.name}に加護を与えました。`;
      }else if(kind===1||!foreigners.length){
        const villages=society.villages;
        const village=villages[Math.floor(Math.random()*villages.length)];
        if(!village)continue;
        village.stock.food=Math.min(9999,village.stock.food+10);
        village.stock.wood=Math.min(9999,village.stock.wood+3);
        target=village;
        announcement=`${god.name}の神が${village.name}に食料と木を贈りました。`;
      }else if(kind===2){
        const village=foreigners[Math.floor(Math.random()*foreigners.length)];
        target=village;game.weather.strike(village.x,village.y,game);
        announcement=`${god.name}の神が杖を振り、${village.name}へ雷を落としました。`;
      }else{
        const candidates=foreigners.filter(v=>v.kingdomId!==null&&
          society.members(v,game.people).length>=5);
        if(!candidates.length)continue;
        const village=candidates[Math.floor(Math.random()*candidates.length)];
        society.assignVillage(village.id,null);
        society.update(0,game.people,true);target=village;
        announcement=`${god.name}の神が${village.name}を独立させました。`;
      }
      society.addNews(announcement);
      this.effects.push({fromX:home.x,fromY:home.y,toX:target.x,toY:target.y,left:1.5});
      if(this.effects.length>3)this.effects.shift();
    }
  }

  animate(realDt){
    for(const effect of this.effects)effect.left-=realDt;
    this.effects=this.effects.filter(effect=>effect.left>0);
  }

  draw(ctx,game){
    for(const god of game.society.kingdoms){
      if(!god.god)continue;
      const place=game.kingdomCapital(god);
      if(!place)continue;
      const x=game.x+place.x*game.scale,y=game.y+place.y*game.scale;
      if(x<0||y<0||x>game.w||y>game.h)continue;
      const size=Math.max(5,Math.min(12,game.scale*1.5));
      const waving=this.effects.some(e=>Math.hypot(e.fromX-place.x,e.fromY-place.y)<2);
      ctx.save();
      ctx.fillStyle='#ffe5a5';ctx.fillRect(x-size*.35,y-size*2,size*.7,size*.7);
      ctx.fillStyle='#f9f5df';ctx.fillRect(x-size*.5,y-size*1.3,size,size*1.2);
      ctx.strokeStyle='#dfbb70';ctx.lineWidth=Math.max(2,size*.18);
      ctx.beginPath();ctx.moveTo(x+size*.5,y-size*.2);
      ctx.lineTo(x+size*(waving?1.2:.9),y-size*(waving?2.8:2.1));ctx.stroke();
      ctx.fillStyle=god.godActive?'#ffeb89':'#7a8c9a';
      ctx.beginPath();ctx.arc(x+size*(waving?1.2:.9),y-size*(waving?2.8:2.1),size*.3,0,Math.PI*2);ctx.fill();
      ctx.restore();
    }
    for(const e of this.effects){
      const fromX=game.x+e.fromX*game.scale,fromY=game.y+e.fromY*game.scale;
      const toX=game.x+e.toX*game.scale,toY=game.y+e.toY*game.scale;
      ctx.save();ctx.globalAlpha=Math.min(1,e.left);ctx.strokeStyle='#ffe9a4';
      ctx.lineWidth=2;ctx.setLineDash([5,7]);ctx.beginPath();
      ctx.moveTo(fromX,fromY-12);ctx.lineTo(toX,toY);ctx.stroke();
      ctx.setLineDash([]);ctx.fillStyle='#fff6b8';ctx.beginPath();
      ctx.arc(toX,toY,Math.max(4,game.scale),0,Math.PI*2);ctx.fill();ctx.restore();
    }
  }
}
