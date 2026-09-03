/* FlagBook — render a play as SVG in the Raiders.pdf visual style.
 * FB.field.render(svgEl, play, opts)   opts: { selected, showGrid, names:{pos:name}, interactive }
 * FB.field.svgString(play, opts)       standalone <svg> markup (thumbnails, print)
 */
(function () {
  'use strict';
  const FB = (window.FB = window.FB || {});
  const G = FB.geo, U = FB.util;
  const NS = 'http://www.w3.org/2000/svg';
  const F = {};

  const STROKE = 4;          // route width
  const ARROW = 15;          // arrowhead length
  const RED = '#E5352B';
  const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  function meta(pos) { return FB.store.POSITION_META[pos] || { shape: 'circle', fill: '#999', text: '#fff' }; }

  function arrowHead(x, y, dx, dy, color) {
    // filled triangle with tip at (x,y) pointing along (dx,dy)
    const L = ARROW, W = ARROW * 0.62;
    const bx = x - dx * L, by = y - dy * L;
    const px = -dy, py = dx;
    const p1 = [bx + px * W, by + py * W], p2 = [bx - px * W, by - py * W];
    return `<polygon points="${f(x)},${f(y)} ${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])}" fill="${color}" />`;
  }
  const f = n => Math.round(n * 100) / 100;

  function routeMarkup(pos, play, opts) {
    const r = play.routes[pos], at = play.players[pos];
    if (!r || !at || !r.pts || r.pts.length < 2) return '';
    const color = r.hot ? RED : '#111';
    const [ox, oy] = at;
    const end = r.end || 'arrow';
    const d = G.routePath(r, ox, oy, end === 'arrow' ? ARROW * 0.8 : 0);
    const dash = r.dashed ? ` stroke-dasharray="${STROKE * 3} ${STROKE * 2.2}"` : '';
    const sel = opts.selected === pos ? ' route-selected' : '';
    let s = `<g class="route${sel}" data-pos="${pos}">`;
    // wide invisible hit area for taps
    if (opts.interactive) s += `<path d="${G.routePath(r, ox, oy, 0)}" fill="none" stroke="rgba(0,0,0,0.001)" stroke-width="28" class="route-hit" data-pos="${pos}" />`;
    s += `<path d="${d}" fill="none" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"${dash} class="route-line" />`;
    const n = r.pts.length;
    const ex = ox + r.pts[n - 1][0], ey = oy + r.pts[n - 1][1];
    const [dx, dy] = G.endDirection(r);
    if (end === 'arrow') s += arrowHead(ex, ey, dx, dy, color);
    else if (end === 'dot') s += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${STROKE * 1.6}" fill="${color}" />`;
    else if (end === 'block') {
      const px = -dy, py = dx, L = 20;
      s += `<line x1="${f(ex + px * L)}" y1="${f(ey + py * L)}" x2="${f(ex - px * L)}" y2="${f(ey - py * L)}" stroke="${color}" stroke-width="${STROKE}" stroke-linecap="round" />`;
    }
    if (r.steps != null && r.steps !== '') {
      const [lx, ly] = G.labelPoint(r, ox, oy, r.labelSide || 1, 22);
      s += `<text x="${f(lx)}" y="${f(ly)}" text-anchor="middle" dominant-baseline="central" font-family="${FONT}" font-weight="800" font-size="36" fill="${color}">${U.esc(r.steps)}</text>`;
    }
    s += '</g>';
    return s;
  }

  function tokenMarkup(pos, play, opts) {
    const at = play.players[pos];
    if (!at) return '';
    const m = meta(pos), [x, y] = at, R = G.TOKEN_R;
    const sel = opts.selected === pos;
    let s = `<g class="token${sel ? ' token-selected' : ''}" data-pos="${pos}" transform="translate(${f(x)} ${f(y)})">`;
    if (sel) s += m.shape === 'diamond'
      ? `<polygon points="0,${-R - 12} ${R + 14},0 0,${R + 12} ${-R - 14},0" fill="none" stroke="#2A7DE1" stroke-width="3" stroke-dasharray="6 4" />`
      : `<circle r="${R + 8}" fill="none" stroke="#2A7DE1" stroke-width="3" stroke-dasharray="6 4" />`;
    if (m.shape === 'diamond') s += `<polygon points="0,${-R - 3} ${R + 9},0 0,${R + 3} ${-R - 9},0" fill="${m.fill}" />`;
    else s += `<circle r="${R}" fill="${m.fill}" />`;
    s += `<text text-anchor="middle" dominant-baseline="central" dy="1" font-family="${FONT}" font-weight="800" font-size="27" fill="${m.text}" style="paint-order:stroke" stroke="${pos === 'Z' ? 'rgba(90,70,0,0.55)' : 'none'}" stroke-width="1.2">${pos}</text>`;
    const name = opts.names && opts.names[pos];
    if (name) {
      // If someone lines up directly below (Q under C), the caption goes to the upper right instead.
      const crowded = Object.keys(play.players).some(o => o !== pos && Math.abs(play.players[o][0] - x) < 34 && play.players[o][1] - y > 20 && play.players[o][1] - y < 70);
      // ...on the side away from the route's step number (which defaults to the right of travel).
      const rt = play.routes && play.routes[pos];
      const side = rt && rt.steps != null && (rt.labelSide || 1) === -1 ? 1 : -1;
      const attrs = crowded ? `x="${side * (R - 2)}" y="${-R - 7}" text-anchor="${side > 0 ? 'start' : 'end'}"` : `y="${R + 19}" text-anchor="middle"`;
      s += `<text ${attrs} font-family="${FONT}" font-weight="700" font-size="17" fill="#222" style="paint-order:stroke" stroke="#fff" stroke-width="3">${U.esc(name)}</text>`;
    }
    s += '</g>';
    return s;
  }

  /* Red double-headed spacing arrows between adjacent on-the-line players. */
  function spacingMarkup(play) {
    if (!play.spacing || !play.spacing.show) return '';
    const online = Object.keys(play.players)
      .filter(p => Math.abs(play.players[p][1] - G.LOS_Y) < 45)
      .sort((a, b) => play.players[a][0] - play.players[b][0]);
    let s = '<g class="spacing">';
    for (let i = 0; i < online.length - 1; i++) {
      const a = online[i], b = online[i + 1];
      const ax = play.players[a][0] + G.TOKEN_R + 6, bx = play.players[b][0] - G.TOKEN_R - 6;
      if (bx - ax < 14) continue;
      const y = G.RECEIVER_Y;
      const key = a + '|' + b;
      let label = play.spacing.labels && play.spacing.labels[key];
      if (label == null || label === '') {
        const yards = (play.players[b][0] - play.players[a][0]) / G.UNITS_PER_YARD;
        label = String(Math.round(yards * 2) / 2).replace(/\.0$/, '');
      }
      s += `<g class="gap" data-gap="${key}">`;
      s += `<line x1="${f(ax + 6)}" y1="${y}" x2="${f(bx - 6)}" y2="${y}" stroke="${RED}" stroke-width="3" />`;
      s += arrowHead(ax, y, -1, 0, RED).replace(/points="[^"]*"/, m => m); // left head
      s += arrowHead(bx, y, 1, 0, RED);
      s += `<rect x="${f((ax + bx) / 2 - 22)}" y="${y + 8}" width="44" height="40" fill="rgba(255,255,255,0.001)" />`;
      s += `<text x="${f((ax + bx) / 2)}" y="${y + 34}" text-anchor="middle" font-family="${FONT}" font-weight="800" font-size="34" fill="${RED}">${U.esc(label)}</text>`;
      s += '</g>';
    }
    return s + '</g>';
  }

  function gridMarkup() {
    // faint 5-yard lines for orientation (editor only, never printed)
    let s = '<g class="grid" pointer-events="none">';
    const yd = G.UNITS_PER_YARD;
    for (let y = G.LOS_Y; y > 0; y -= yd * 5) s += `<line x1="0" y1="${f(y)}" x2="${G.FIELD_W}" y2="${f(y)}" stroke="#d8d8d8" stroke-width="1" stroke-dasharray="6 6" />`;
    for (let y = G.LOS_Y + yd * 5; y < G.FIELD_H; y += yd * 5) s += `<line x1="0" y1="${f(y)}" x2="${G.FIELD_W}" y2="${f(y)}" stroke="#d8d8d8" stroke-width="1" stroke-dasharray="6 6" />`;
    for (let y = G.LOS_Y - yd; y > 0; y -= yd) s += `<line x1="8" y1="${f(y)}" x2="18" y2="${f(y)}" stroke="#cfcfcf" stroke-width="1" /><line x1="${G.FIELD_W - 18}" y1="${f(y)}" x2="${G.FIELD_W - 8}" y2="${f(y)}" stroke="#cfcfcf" stroke-width="1" />`;
    return s + '</g>';
  }

  F.innerMarkup = function (play, opts) {
    opts = opts || {};
    let s = `<rect x="0" y="0" width="${G.FIELD_W}" height="${G.FIELD_H}" fill="#ffffff" class="field-bg" />`;
    if (opts.showGrid) s += gridMarkup();
    s += `<line x1="0" y1="${G.LOS_Y}" x2="${G.FIELD_W}" y2="${G.LOS_Y}" stroke="#111" stroke-width="${STROKE}" class="los" />`;
    s += spacingMarkup(play);
    const order = Object.keys(play.players);
    // routes under tokens
    for (const pos of order) if (pos !== opts.selected) s += routeMarkup(pos, play, opts);
    if (opts.selected && play.players[opts.selected]) s += routeMarkup(opts.selected, play, opts);
    for (const pos of order) if (pos !== opts.selected) s += tokenMarkup(pos, play, opts);
    if (opts.selected && play.players[opts.selected]) s += tokenMarkup(opts.selected, play, opts);
    if (opts.liveStroke && opts.liveStroke.length > 1) {
      s += `<polyline points="${opts.liveStroke.map(p => f(p[0]) + ',' + f(p[1])).join(' ')}" fill="none" stroke="#2A7DE1" stroke-width="3" stroke-opacity="0.6" stroke-linecap="round" stroke-linejoin="round" />`;
    }
    return s;
  };

  F.render = function (svg, play, opts) {
    svg.setAttribute('viewBox', `0 0 ${G.FIELD_W} ${G.FIELD_H}`);
    svg.innerHTML = F.innerMarkup(play, opts);
  };

  F.svgString = function (play, opts, attrs) {
    return `<svg xmlns="${NS}" viewBox="0 0 ${G.FIELD_W} ${G.FIELD_H}" ${attrs || ''}>${F.innerMarkup(play, opts)}</svg>`;
  };

  /* Convert a pointer event to field coordinates. */
  F.pointFromEvent = function (svg, ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX; pt.y = ev.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const p = pt.matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  FB.field = F;
})();
