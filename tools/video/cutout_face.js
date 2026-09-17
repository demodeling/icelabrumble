// Extracted from src/index.html (roster look + drawCutoutFace) so the video renderer draws the same faces.
function hashOf(s){ var h = 2166136261; for (var i = 0; i < s.length; i++){ h = (h ^ s.charCodeAt(i)) >>> 0; h = (h * 16777619) >>> 0; } return h; }
// Generic paper-cutout avatars, built from a hash of the id — a look per fighter, not a likeness of anyone.
var SKINS = ['#f1c9a5', '#f3c8b0', '#f0cdb0', '#f2d0b4', '#efc8ac', '#e9c0a0', '#e8bfa0', '#d8a882', '#c08b62', '#8d5a3b'];
var HAIRC = ['#2b2320', '#4a3626', '#6b4a2e', '#8a6a48', '#c9a266', '#a86f45', '#5a5a5e', '#d8d3c8'];
var HAIRT = ['short', 'long', 'bangs', 'curly', 'buzz'];
var MOUTHS = ['smile', 'flat', 'open'];
function lookFor(id){
  var h = hashOf(id + '-look'), t = HAIRT[h % HAIRT.length];
  return {skin: SKINS[(h >>> 3) % SKINS.length],
          hair: {type: t, color: HAIRC[(h >>> 7) % HAIRC.length], big: ((h >>> 11) & 1) === 1, messy: ((h >>> 12) & 1) === 1, receding: t === 'short' && ((h >>> 13) & 3) === 0},
          beard: null, glasses: ((h >>> 17) % 3) === 0, mouth: MOUTHS[(h >>> 19) % MOUTHS.length],
          brow: ((h >>> 23) & 3) === 0};
}
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
  // goatee: a chin patch (drawn before the mouth) + a thin mustache
  if (bd && bd.type === 'goatee'){
    outlined(bd.color, function(){ c.moveTo(-S * .2, S * .3); c.quadraticCurveTo(-S * .2, ry * 1.12, S * .04, ry * 1.14); c.quadraticCurveTo(S * .28, ry * 1.12, S * .28, S * .3); c.quadraticCurveTo(S * .04, S * .36, -S * .2, S * .3); });
    outlined(bd.color, function(){ c.moveTo(-S * .16, S * .21); c.quadraticCurveTo(S * .04, S * .14, S * .24, S * .21); c.quadraticCurveTo(S * .14, S * .25, S * .04, S * .23); c.quadraticCurveTo(-S * .06, S * .25, -S * .16, S * .21); });
  }
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
