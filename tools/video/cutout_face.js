var LOOK = {
  albertas:{skin:'#f1c9a5', hair:{type:'curly', color:'#6b4a2e', big:true}, beard:{type:'full', color:'#7a5232'}, glasses:true, mouth:'open'},
  bjorn:   {skin:'#f3c8b0', hair:{type:'bald'}, beard:null, mouth:'flat', brow:true},
  bea:     {skin:'#f0cdb0', hair:{type:'bangs', color:'#8a6a48'}, beard:null, mouth:'smile'},
  annamia: {skin:'#f2d0b4', hair:{type:'long', color:'#c9a266'}, beard:null, mouth:'smile'},
  per:     {skin:'#efc8ac', hair:{type:'short', color:'#4a3626'}, beard:{type:'stubble', color:'#5a4433'}, mouth:'flat'},
  marco:   {skin:'#e9c0a0', hair:{type:'curly', color:'#2b2320', big:true}, beard:{type:'mustache', color:'#2b2320'}, mouth:'smile'},
  jose:    {skin:'#e8bfa0', hair:{type:'buzz', color:'#2f2620'}, beard:{type:'full', color:'#2a221e', big:true}, mouth:'smile'},
  mike:    {skin:'#f0c7a8', hair:{type:'short', color:'#8a6a48', messy:true}, beard:{type:'full', color:'#a86f45'}, mouth:'open'},
  daniel:  {skin:'#f1c9ad', hair:{type:'short', color:'#4a3a2e', receding:true}, beard:null, glasses:true, mouth:'smile', chain:true}
};
function drawCutoutFace(c, cx, cy, S, look, fac, opt){
  // S = head width. Big round head, big oval eyes, thick paper-cut outline.
  opt = opt || {};
  var INKC = '#1a141e', rx = S * .5, ry = S * .46, lw = Math.max(2, S * .045);
  var hair = look.hair || {type:'bald'}, hc = hair.color || '#333';
  c.save(); c.translate(cx, cy); if (fac < 0) c.scale(-1, 1);
  c.lineJoin = 'round'; c.lineCap = 'round';
  function outlined(fill, path){ c.beginPath(); path(); c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INKC; c.stroke(); }
  function circ(x, y, r){ c.moveTo(x + r, y); c.arc(x, y, r, 0, 6.283); }
  // hair BEHIND the head
  if (hair.type === 'curly'){
    var R = S * (hair.big ? .19 : .14), n = 11;
    for (var k = 0; k < n; k++){ var a = -Math.PI * 1.15 + k * (Math.PI * 1.3 / (n - 1)); var hx = Math.cos(a) * rx * 1.02, hy = Math.sin(a) * ry * 1.05 - S * .05; outlined(hc, function(){ circ(hx, hy, R * (0.85 + 0.3 * ((k * 7) % 3) / 2)); }); }
  } else if (hair.type === 'long' || hair.type === 'bangs'){
    outlined(hc, function(){ c.moveTo(-rx * .98, -S * .1); c.quadraticCurveTo(-rx * 1.12, S * .35, -rx * .85, S * .62); c.lineTo(-rx * .45, S * .62); c.lineTo(-rx * .5, 0); c.lineTo(rx * .5, 0); c.lineTo(rx * .45, S * .62); c.lineTo(rx * .85, S * .62); c.quadraticCurveTo(rx * 1.12, S * .35, rx * .98, -S * .1); c.lineTo(0, -ry * 1.05); });
  }
  // head
  outlined(look.skin, function(){ c.ellipse(0, 0, rx, ry, 0, 0, 6.283); });
  // hair ON the head
  if (hair.type === 'short' || hair.type === 'buzz'){
    var top = hair.receding ? -ry * .55 : -ry * .35;
    outlined(hc, function(){
      c.moveTo(-rx * .98, -ry * .1); c.quadraticCurveTo(-rx * 1.0, -ry * 1.0, 0, -ry * 1.02); c.quadraticCurveTo(rx * 1.0, -ry * 1.0, rx * .98, -ry * .1);
      c.quadraticCurveTo(rx * .8, -ry * .35, rx * .55, top);
      if (hair.messy){ c.lineTo(rx * .35, top - S * .1); c.lineTo(rx * .2, top); c.lineTo(0, top - S * .08); c.lineTo(-rx * .2, top); c.lineTo(-rx * .35, top - S * .1); }
      else if (hair.receding){ c.quadraticCurveTo(rx * .3, -ry * .2, 0, -ry * .3); c.quadraticCurveTo(-rx * .3, -ry * .2, -rx * .55, top); }
      else { c.quadraticCurveTo(0, top - S * .04, -rx * .55, top); }
      c.quadraticCurveTo(-rx * .8, -ry * .35, -rx * .98, -ry * .1);
    });
  } else if (hair.type === 'bangs'){
    outlined(hc, function(){ c.moveTo(-rx * .98, -ry * .05); c.quadraticCurveTo(-rx * 1.0, -ry * 1.02, 0, -ry * 1.04); c.quadraticCurveTo(rx * 1.0, -ry * 1.02, rx * .98, -ry * .05); c.lineTo(rx * .7, -ry * .3); c.lineTo(rx * .3, -ry * .2); c.lineTo(-rx * .1, -ry * .32); c.lineTo(-rx * .5, -ry * .2); c.lineTo(-rx * .75, -ry * .35); });
  } else if (hair.type === 'long'){
    outlined(hc, function(){ c.moveTo(-rx * .98, -ry * .05); c.quadraticCurveTo(-rx * 1.0, -ry * 1.02, 0, -ry * 1.04); c.quadraticCurveTo(rx * 1.0, -ry * 1.02, rx * .98, -ry * .05); c.quadraticCurveTo(rx * .6, -ry * .55, rx * .1, -ry * .55); c.quadraticCurveTo(-rx * .6, -ry * .55, -rx * .98, -ry * .05); });
  } else if (hair.type === 'curly'){
    var R2 = S * .12;
    for (var k2 = 0; k2 < 6; k2++){ var a2 = -Math.PI * .88 + k2 * (Math.PI * .76 / 5); outlined(hc, function(){ circ(Math.cos(a2) * rx * .88, Math.sin(a2) * ry * 1.04, R2 * (0.8 + 0.4 * (k2 % 2))); }); }
  } else if (hair.type === 'bald'){
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.ellipse(-rx * .25, -ry * .55, rx * .28, ry * .14, -.4, 0, 6.283); c.fill();
  }
  // beard
  var bd = look.beard;
  if (bd && (bd.type === 'full' || bd.type === 'stubble')){
    c.globalAlpha = bd.type === 'stubble' ? .45 : 1;
    outlined(bd.color, function(){ c.moveTo(-rx * .95, S * .02); c.quadraticCurveTo(-rx * .9, ry * (bd.big ? 1.35 : 1.1), 0, ry * (bd.big ? 1.4 : 1.15)); c.quadraticCurveTo(rx * .9, ry * (bd.big ? 1.35 : 1.1), rx * .95, S * .02); c.quadraticCurveTo(rx * .55, S * .16, 0, S * .14); c.quadraticCurveTo(-rx * .55, S * .16, -rx * .95, S * .02); });
    c.globalAlpha = 1;
  }
  // eyes: two big ovals touching in the middle, pupils toward facing
  var ex = S * .17, ey = S * .2, eyy = -S * .02, sh = S * .04;
  c.fillStyle = '#fff'; c.strokeStyle = INKC; c.lineWidth = lw * .8;
  [-1, 1].forEach(function(sd){ c.beginPath(); c.ellipse(sd * ex * .95 + sh, eyy, ex, ey, 0, 0, 6.283); c.fill(); c.stroke(); });
  c.fillStyle = INKC; [-1, 1].forEach(function(sd){ c.beginPath(); c.arc(sd * ex * .95 + sh + S * .05, eyy + S * .02, S * .04, 0, 6.283); c.fill(); });
  if (look.brow || opt.angry){ c.lineWidth = lw; [-1, 1].forEach(function(sd){ c.beginPath(); c.moveTo(sd * ex * 1.7 + sh, eyy - ey * 1.05 + (opt.angry ? sd * -S * .03 : 0)); c.lineTo(sd * ex * .3 + sh, eyy - ey * 1.25 + (opt.angry ? S * .04 : 0)); c.stroke(); }); }
  if (look.glasses){ c.lineWidth = lw * .7; c.strokeStyle = '#3a2f2a'; [-1, 1].forEach(function(sd){ c.beginPath(); c.ellipse(sd * ex * .95 + sh, eyy, ex * 1.12, ey * 1.1, 0, 0, 6.283); c.stroke(); }); c.beginPath(); c.moveTo(sh - ex * .05, eyy - ey * .3); c.lineTo(sh + ex * .05, eyy - ey * .3); c.stroke(); }
  // mustache
  if (bd && bd.type === 'mustache'){ outlined(bd.color, function(){ c.moveTo(-S * .2, S * .2); c.quadraticCurveTo(0, S * .1, S * .2, S * .2); c.quadraticCurveTo(S * .1, S * .28, 0, S * .24); c.quadraticCurveTo(-S * .1, S * .28, -S * .2, S * .2); }); }
  // mouth
  var m = opt.mouth || look.mouth; c.strokeStyle = INKC; c.lineWidth = lw * .8; c.beginPath();
  if (m === 'open'){ c.ellipse(S * .05, S * .3, S * .1, S * .07, 0, 0, 6.283); c.fillStyle = '#7a2a3a'; c.fill(); c.stroke(); }
  else if (m === 'smile'){ c.moveTo(-S * .12, S * .27); c.quadraticCurveTo(S * .05, S * .38, S * .2, S * .26); c.stroke(); }
  else if (m === 'grr'){ c.moveTo(-S * .12, S * .32); c.lineTo(S * .22, S * .3); c.stroke(); }
  else { c.moveTo(-S * .1, S * .3); c.lineTo(S * .18, S * .3); c.stroke(); }
  if (look.chain && !opt.noChain){ c.strokeStyle = '#e6c25a'; c.lineWidth = lw * .5; c.beginPath(); c.moveTo(-S * .3, ry * 1.05); c.quadraticCurveTo(0, ry * 1.35, S * .3, ry * 1.05); c.stroke(); }
  c.restore();
}
