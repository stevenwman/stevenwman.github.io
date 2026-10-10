// Pixel-art Easter egg in the hero: a small bot rides a two-armed robot. Steer the nearer arm with
// the cursor, hold to grip the graphics card, and feed the bot; it grows with every GPU, and the fifth one is one too many.
(() => {
  "use strict";
  const root = document.documentElement;
  const hero = document.getElementById("hero");
  const cv = document.getElementById("bench");
  const ctx = cv.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let W = 0,
    H = 0; // canvas size in art pixels
  let pal = {},
    M = {};
  let now = 0,
    visible = true,
    script = null;
  const mouse = { x: 0, y: 0, down: false, t: -1e9 };

  // ---------- colors: the scene follows the page theme ----------
  function readPalette() {
    const cs = getComputedStyle(root),
      g = (n) => cs.getPropertyValue(n).trim(),
      dark = root.getAttribute("data-theme") === "dark";
    pal = { ink: g("--ink"), line: g("--line-strong"), accent: g("--accent"), bot: "#d97757", botEye: "#2b1a14" };
    pal.arm = dark ? "#565d68" : "#27292e";
    pal.steel = dark ? "#c4c9d0" : "#b3b8bf";
    pal.slot = dark ? "#2c3139" : "#0d0e10";
    // shaded materials, as [outline, shadow, base, light, glint]
    M.arm = dark ? ["#1b1f25", "#3a4049", "#565d68", "#78808c", "#a9b1bc"] : ["#08090a", "#16171a", "#27292e", "#44474e", "#72777f"];
    M.steel = dark ? ["#6b727c", "#9aa1ab", "#c4c9d0", "#e6e9ed", "#ffffff"] : ["#555b63", "#878d96", "#b3b8bf", "#dcdfe4", "#ffffff"];
    M.table = dark ? ["#1f2825", "#2c3733", "#3a4641", "#50605a", "#50605a"] : ["#9a958a", "#b5b0a6", "#cfcbc2", "#e6e3dc", "#e6e3dc"];
  }
  document.addEventListener("themechange", readPalette);

  // ---------- pixel primitives ----------
  // The scene is laid out in units. The canvas has Z x Z pixels per unit: flat details are drawn as whole units,
  // while the robot and the graphics card are drawn pixel by pixel.
  const Z = 2;
  const R = (x, y, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  const LIGHT = (() => {
    const l = [-0.45, -0.62, 0.64],
      n = Math.hypot(l[0], l[1], l[2]);
    return l.map((v) => v / n);
  })(); // from the upper left, towards the viewer
  // which of a material's tones a surface facing (nx, ny) gets: 1 shadow, 2 base, 3 light, 4 glint (0 is the outline)
  function tone(nx, ny) {
    const i = nx * LIGHT[0] + ny * LIGHT[1] + Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) * LIGHT[2];
    return i > 0.93 ? 4 : i > 0.66 ? 3 : i > 0.3 ? 2 : 1;
  }
  // paints one pixel row, merging neighbours that share a tone; pick(x) returns a tone index or -1 for nothing
  function row(y, x0, x1, mat, pick) {
    let start = x0,
      cur = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      const t = x <= x1 ? pick(x) : -1;
      if (t !== cur) {
        if (cur >= 0) {
          ctx.fillStyle = mat[cur];
          ctx.fillRect(start / Z, y / Z, (x - start) / Z, 1 / Z);
        }
        cur = t;
        start = x;
      }
    }
  }
  // a rounded cylinder from a to b (a ball when they coincide), lit like a 3D solid and outlined
  function capsule(ax, ay, bx, by, r, mat) {
    ax *= Z;
    ay *= Z;
    bx *= Z;
    by *= Z;
    r *= Z;
    const vx = bx - ax,
      vy = by - ay,
      vv = vx * vx + vy * vy || 1e-9;
    const x0 = Math.floor(Math.min(ax, bx) - r),
      x1 = Math.ceil(Math.max(ax, bx) + r),
      y0 = Math.floor(Math.min(ay, by) - r),
      y1 = Math.ceil(Math.max(ay, by) + r);
    for (let y = y0; y <= y1; y++)
      row(y, x0, x1, mat, (x) => {
        const px = x + 0.5 - ax,
          py = y + 0.5 - ay,
          t = clamp((px * vx + py * vy) / vv, 0, 1),
          dx = px - t * vx,
          dy = py - t * vy,
          d = Math.hypot(dx, dy);
        return d > r ? -1 : d > r - 1.15 ? 0 : tone(dx / r, dy / r);
      });
  }
  // a short slice of cylinder centred on c with its axis along u: the metal rings around the joints
  function band(cx, cy, ux, uy, hw, r, mat) {
    cx *= Z;
    cy *= Z;
    hw *= Z;
    r *= Z;
    const ext = Math.ceil(Math.hypot(hw, r)) + 1;
    for (let y = Math.floor(cy - ext); y <= cy + ext; y++)
      row(y, Math.floor(cx - ext), Math.ceil(cx + ext), mat, (x) => {
        const px = x + 0.5 - cx,
          py = y + 0.5 - cy,
          al = px * ux + py * uy,
          pe = py * ux - px * uy;
        return Math.abs(al) > hw || Math.abs(pe) > r ? -1 : Math.abs(pe) > r - 1.15 ? 0 : tone((-uy * pe) / r, (ux * pe) / r);
      });
  }
  // a rounded slab seen face-on: outlined, lit along the top edge, shaded along the bottom and right
  function box(x, y, w, h, rad, mat) {
    x = Math.round(x * Z);
    y = Math.round(y * Z);
    w = Math.round(w * Z);
    h = Math.round(h * Z);
    rad *= Z;
    for (let yy = y; yy < y + h; yy++)
      row(yy, x, x + w - 1, mat, (xx) => {
        const qx = Math.abs(xx + 0.5 - (x + w / 2)) - (w / 2 - rad),
          qy = Math.abs(yy + 0.5 - (y + h / 2)) - (h / 2 - rad);
        const sd = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
        return sd > 0 ? -1 : sd > -1.15 ? 0 : yy - y < 3 ? 3 : y + h - yy <= 3 || x + w - xx <= 3 ? 1 : 2;
      });
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (dt, rate) => 1 - Math.exp(-dt * rate);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const active = () => mouse.down || now - mouse.t < 3;
  const anchorX = () => (cv.getBoundingClientRect().width < 760 ? Math.round(W / 2) : Math.round(W * 0.71));
  const groundY = () => H - 9;

  // ---------- the scene: feed the bot (it rides a two-armed robot; hand it the GPU and it grows) ----------
  const L1 = 18,
    L2 = 15,
    GR = 6,
    CRUMB = "#aab0b8";
  const tele = {
    arms: [
      { a1: 2.2, a2: 1.2, g: 0 },
      { a1: 0.9, a2: 1.9, g: 0 },
    ],
    food: { x: 0, y: 0, vy: 0, state: "free", held: -1, bites: 0, t: 0, lost: 0, flip: false, ox: 0, oy: 0 },
    crumbs: [],
    bits: [],
    tears: [],
    happy: 0,
    chomp: 0,
    init: false,
    fed: 0,
    size: 0,
    sel: 0,
    fx: 0,
    gy: 0,
    end: null,
    endT: 0,
    drop: 0,
    shake: 0,
    bounce: 0,
    broken: false,
    ufo: null,
  };
  const FULL = 5,
    DROP = 40; // GPUs until the robot gives way, and how far the upper body falls when it does
  // The gripper is rigid with the forearm, so to the solver the arm is a two-link chain from shoulder to fingertip.
  const LA = L1,
    LB = L2 + GR,
    RMAX = (LA + LB) * 0.985,
    RSOFT = RMAX * 0.86,
    RMIN = Math.abs(LA - LB) + 3;
  function ik(S, P, side, arm) {
    const dx = P.x - S.x,
      dy = P.y - S.y,
      d = Math.hypot(dx, dy) || 1e-6;
    // near full reach the elbow angle is hypersensitive to distance, so approach the limit gradually and never go dead straight
    const dd = Math.max(RMIN, d > RSOFT ? RSOFT + (RMAX - RSOFT) * (1 - Math.exp(-(d - RSOFT) / (RMAX - RSOFT))) : d);
    const phi = Math.atan2(dy, dx),
      a = Math.acos(clamp((LA * LA + dd * dd - LB * LB) / (2 * LA * dd), -1, 1));
    // Two elbow poses reach the same point. Keep the one from the previous frame, and switch only when the
    // other bends clearly further away from the body; the joints then glide across instead of flip-flopping.
    if (!arm.br) arm.br = side ? -1 : 1;
    const better = (side ? 1 : -1) * (Math.cos(phi - arm.br * a) - Math.cos(phi + arm.br * a));
    if (better > 0.6) arm.br = -arm.br;
    const a1 = phi + arm.br * a,
      ex = S.x + LA * Math.cos(a1),
      ey = S.y + LA * Math.sin(a1);
    return { a1, a2: Math.atan2(S.y + dd * Math.sin(phi) - ey, S.x + dd * Math.cos(phi) - ex) };
  }
  function fk(S, a) {
    const e = { x: S.x + L1 * Math.cos(a.a1), y: S.y + L1 * Math.sin(a.a1) };
    const w = { x: e.x + L2 * Math.cos(a.a2), y: e.y + L2 * Math.sin(a.a2) };
    return { e, w, t: { x: w.x + GR * Math.cos(a.a2), y: w.y + GR * Math.sin(a.a2) } };
  }
  function drawArm(S, a) {
    const p = fk(S, a),
      u1 = { x: Math.cos(a.a1), y: Math.sin(a.a1) },
      u2 = { x: Math.cos(a.a2), y: Math.sin(a.a2) },
      n = { x: -u2.y, y: u2.x },
      open = 1 + 2 * (1 - a.g);
    capsule(S.x, S.y, p.e.x, p.e.y, 2.5, M.arm); // upper arm
    capsule(p.e.x, p.e.y, p.w.x, p.w.y, 2.1, M.arm); // forearm
    band(S.x + u1.x * 5, S.y + u1.y * 5, u1.x, u1.y, 0.5, 2.9, M.steel);
    band(p.e.x - u1.x * 5, p.e.y - u1.y * 5, u1.x, u1.y, 0.5, 2.9, M.steel);
    band(p.e.x + u2.x * 5, p.e.y + u2.y * 5, u2.x, u2.y, 0.5, 2.5, M.steel);
    band(p.w.x - u2.x * 3.6, p.w.y - u2.y * 3.6, u2.x, u2.y, 0.5, 2.5, M.steel);
    capsule(S.x, S.y, S.x, S.y, 3.5, M.arm);
    capsule(p.e.x, p.e.y, p.e.x, p.e.y, 3.3, M.arm); // motor housings at the shoulder and elbow
    capsule(S.x, S.y, S.x, S.y, 1.2, M.steel);
    capsule(p.e.x, p.e.y, p.e.x, p.e.y, 1.1, M.steel); // their hub caps
    for (const s of [-1, 1]) {
      // curved steel fingers
      const b = { x: p.w.x + n.x * s * (open + 1), y: p.w.y + n.y * s * (open + 1) };
      const m = { x: b.x + u2.x * 3 + n.x * s, y: b.y + u2.y * 3 + n.y * s };
      capsule(b.x, b.y, m.x, m.y, 0.8, M.steel);
      capsule(m.x, m.y, p.t.x + n.x * s * open * 0.6, p.t.y + n.y * s * open * 0.6, 0.8, M.steel);
    }
    capsule(p.w.x - n.x * 2.4, p.w.y - n.y * 2.4, p.w.x + n.x * 2.4, p.w.y + n.y * 2.4, 2.1, M.arm); // gripper motor, lying across the wrist
  }
  // what the bot eats: a graphics card after the RTX 5090 Founders Edition. Chamfered gunmetal frame, two fans,
  // the X brace between them, a lit logo strip, the steel bracket at one end and the connector underneath.
  const GPU = [
    "vv...kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk...",
    "vv..keeeeeeeeeeeewwwwwwwwwweeeeeeeeeek..",
    "vv.keeeebbbbbbeeeeeeeeeeeeeebbbbbbeeeek.",
    "vvkeemmbbbbggbbmmxxmmmmmxmmbbbbggbbmmeek",
    "vVkeembggggbgbbbmmxxmmmxxmbggggbgbbbmeek",
    "vVkeebbbbbbbbgbgbmmxxmxxmbbbbbbbbgbgbeek",
    "vvkeebbggbhhbgbgbmmxxmxxmbbggbhhbgbgbeek",
    "vVkeebgbbhhhhbgbbmmmxxxmmbgbbhhhhbgbbeek",
    "vVkeebgbbhhhhbgbbmmmxxxmmbgbbhhhhbgbbeek",
    "vvkeebbgbbhhbbbgbmmxxmxxmbbgbbhhbbbgbeek",
    "vVkeebbgbgbbggggbmmxxmxxmbbgbgbbggggbeek",
    "vVkeembggbgbbbbbmmxxmmmxxmbggbgbbbbbmeek",
    "vvkeemmbgbbgggbmmxxmmmmmxmmbgbbgggbmmeek",
    "vv.keeeebbbbbbeeeeeeeeeeeeeebbbbbbeeeek.",
    "vv..keeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeek..",
    "vv...kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk...",
    "vv......yyyy..yyyyyyyyyyyyyyyy..........",
    "vv......yYyY..yYyYyYyYyYyYyYyY..........",
  ];
  const GPU_INK = {
    k: "#0e0f11",
    e: "#7c828b",
    m: "#2b2e33",
    w: "#f4f6f8",
    b: "#101114",
    g: "#4a4f57",
    h: "#a3a9b2",
    x: "#8b9199",
    y: "#e3b341",
    Y: "#b98a22",
    v: "#b9bec6",
    V: "#6f757e",
  };
  const GPX = GPU[0].length, // sprite size in pixels...
    GW = GPX / Z, // ...and in scene units
    GH = GPU.length / Z;
  const gpuLeft = (bites) => Math.round(GPX * (1 - bites / 3)); // pixel columns left after so many bites
  // flip: the card is being eaten from its left end instead of its right
  function gpu(x, y, bites, flip) {
    const w = gpuLeft(bites),
      x0 = Math.round(x * Z),
      y0 = Math.round(y * Z);
    GPU.forEach((line, r) => {
      for (let c = flip ? GPX - w : 0; c < (flip ? GPX : w); c++)
        if (line[c] !== ".") {
          ctx.fillStyle = GPU_INK[line[c]];
          ctx.fillRect((x0 + c) / Z, (y0 + r) / Z, 1 / Z, 1 / Z);
        }
    });
  }
  // The visiting saucer in the finale: the OpenAI mark, downsampled to a 46 x 46 bitmap.
  const KNOT = [
    ".................#######......................",
    "...............###########....................",
    ".............###############..................",
    "............######.....######.................",
    "...........#####.........###########..........",
    "...........####...........############........",
    "..........####..........################......",
    "..........###.........######........#####.....",
    "........####........######...........####.....",
    "......######......######..............####....",
    "....########.....######................####...",
    "...#########....#####........##.........###...",
    "..#####..###....###........######.......###...",
    "..####...###....##........#########.....###...",
    ".####....###....##......####..######.....###..",
    ".###.....###....##....####......######...###..",
    "####.....###....##..######........##########..",
    "###......###....############........#######...",
    "###......###....#####....#####.......######...",
    "###......###....###........####........#####..",
    "###......###....##..........#####.......####..",
    "###......###....##..........#######......####.",
    "####.....###....##..........##..####......###.",
    ".###......####..##..........##....###.....####",
    ".####......#######..........##....###......###",
    "..####.......#####..........##....###......###",
    "..#####........####........###....###......###",
    "...#####........#####.....####....###......###",
    "...#######........####..######....###......###",
    "...#########........######..##....###.....####",
    "..###...######......####....##....###.....###.",
    "..###....######...####......##....###....####.",
    "...###.....##########.......##....###....###..",
    "...###.......######........###....###...####..",
    "...###.........##........#####....###.#####...",
    "...####.................######....########....",
    "....####..............######......#######.....",
    ".....####...........######........#####.......",
    ".....#####........######.........####.........",
    "......#################.........####..........",
    "........#############...........####..........",
    "..........###########.........#####...........",
    "..............#..#####.......#####............",
    "..................###############.............",
    "...................############...............",
    "......................#######.................",
  ];
  function emblem(cx, cy, c) {
    const x0 = Math.round(cx * Z) - 23,
      y0 = Math.round(cy * Z) - 23;
    ctx.fillStyle = c;
    KNOT.forEach((line, y) => {
      for (let x = 0; x < line.length; x++)
        if (line[x] === "#") {
          let e = x;
          while (line[e + 1] === "#") e++;
          ctx.fillRect((x0 + x) / Z, (y0 + y) / Z, (e - x + 1) / Z, 1 / Z);
          x = e;
        }
    });
  }
  function teleop(dt) {
    const gy = groundY(),
      fx = anchorX() + 8,
      ty = gy - 14,
      f = tele.food;
    const spawn = (drop) => {
      const s = Math.random() < 0.5 ? -1 : 1;
      f.x = fx + s * (17 + Math.round(Math.random() * 5)) - GW / 2;
      f.y = drop ? ty - 34 : ty - GH;
      f.flip = false;
      f.vy = 0;
      f.state = "free";
      f.held = -1;
      f.bites = 0;
      f.t = 0;
      f.lost = 0;
    };
    if (!tele.init) {
      spawn(false);
      f.x = fx - 20 - GW / 2;
      tele.init = true;
    }
    if (tele.fx && (fx !== tele.fx || gy !== tele.gy)) {
      f.x += fx - tele.fx;
      f.y += gy - tele.gy;
    } // the canvas was resized: move the GPU with the scene
    tele.fx = fx;
    tele.gy = gy;

    // ----- finale: the last GPU is one too many. creak -> crash -> cry -> saucer arrives -> scan -> rebuild -> saucer leaves
    const setEnd = (p) => {
      tele.end = p;
      tele.endT = 0;
    };
    if (tele.end) tele.endT += dt;
    const T = tele.endT; // time in the phase that was running when this frame began
    if (tele.end === "creak") {
      tele.shake = 0.7 + T;
      if (T > 0.9) setEnd("crash");
    } else if (tele.end === "crash") {
      const before = tele.drop;
      tele.drop = Math.min(DROP, 170 * T * T);
      if (before < DROP && tele.drop >= DROP) {
        // impact
        tele.shake = 3;
        tele.broken = true;
        tele.bounce = 0.5;
        for (let k = 0; k < 10; k++)
          tele.bits.push({
            x: fx + (Math.random() - 0.5) * 16,
            y: gy - 6,
            vx: (Math.random() - 0.5) * 90,
            vy: -30 - Math.random() * 70,
            w: 1 + (k % 3),
            h: 1 + (k % 2),
            c: k % 3 ? pal.arm : pal.steel,
          });
        for (let k = 0; k < 14; k++)
          tele.crumbs.push({
            x: fx + (Math.random() - 0.5) * 50,
            y: gy - 2,
            vx: (Math.random() - 0.5) * 60,
            vy: -10 - Math.random() * 25,
            life: 0.5 + Math.random() * 0.4,
            c: pal.line,
          });
      }
      if (T > 1.3) setEnd("cry");
    } else if (tele.end === "cry") {
      if (T > 2.4) setEnd("ufoIn");
    } else if (tele.end === "ufoIn") {
      if (T > 1.3) setEnd("scan");
    } else if (tele.end === "scan") {
      if (T > 1.8) {
        setEnd("rebuild");
        tele.fed = 0;
        tele.tears = [];
      }
    } else if (tele.end === "rebuild") {
      const k = clamp(T / 1.2, 0, 1);
      tele.drop = DROP * (1 - k * k * (3 - 2 * k));
      if (k > 0.5) {
        tele.broken = false;
        tele.bits = [];
      }
      if (T > 1.5) setEnd("ufoOut");
    } else if (tele.end === "ufoOut") {
      if (T > 1.0) {
        setEnd(null);
        spawn(true);
      }
    }
    // A phase may have just changed above, which restarts its clock. Drawing must use the new phase's time,
    // or the first frame of a phase is drawn with the old phase's (finished) time and things flash out of place.
    const TD = tele.endT;
    const E = tele.end,
      wreck = E === "crash" || E === "cry" || E === "ufoIn" || E === "scan",
      sad = E === "cry" || E === "ufoIn" || E === "scan";
    tele.shake = Math.max(0, tele.shake - dt * 5);
    tele.bounce = Math.max(0, tele.bounce - dt);
    tele.size += (Math.min(tele.fed, FULL) - tele.size) * ease(dt, E === "rebuild" ? 4 : 6);

    const sy = gy - 46 + tele.drop; // shoulder height; the whole upper body rides on it, so it sinks when the column gives way
    const grow = (tele.size * 10) / FULL,
      bw = Math.round(13 + 2.4 * grow),
      bh = Math.round(8 + 1.5 * grow); // the bot's body grows with every GPU
    const S = [
        { x: fx - 13, y: sy },
        { x: fx + 13, y: sy },
      ],
      mouth = { x: fx, y: sy - 8 - bh + Math.round(bh * 0.65) + 1 };
    const act = active() && !E;
    if (!mouse.down) tele.sel = mouse.x < fx ? 0 : 1; // the cursor picks the nearer arm, but never swaps arms mid-grip
    const fc = { x: f.x + GW / 2, y: f.y + GH / 2 },
      near = tele.sel;

    for (let i = 0; i < 2; i++) {
      const a = tele.arms[i],
        sgn = i ? 1 : -1;
      if (wreck) {
        // limp: flung out sideways and left lying on the floor
        a.a1 += wrap((i ? 0.22 : Math.PI - 0.22) - a.a1) * ease(dt, 5);
        a.a2 += wrap((i ? -0.05 : Math.PI + 0.05) - a.a2) * ease(dt, 5);
        a.g += (0 - a.g) * ease(dt, 14);
        continue;
      }
      let P = { x: S[i].x + sgn * 10, y: S[i].y + 26 + (reduce ? 0 : Math.sin(now * 1.3 + i)) },
        grip = 0; // rest pose
      if (act && near === i) {
        P = { x: mouse.x, y: mouse.y };
        grip = mouse.down ? 1 : 0;
      }
      P.y = Math.min(P.y, ty - 3);
      const d = ik(S[i], P, i, a);
      a.a1 += wrap(d.a1 - a.a1) * ease(dt, 9);
      a.a2 += wrap(d.a2 - a.a2) * ease(dt, 9);
      a.g += (grip - a.g) * ease(dt, 14);
    }
    const tips = [fk(S[0], tele.arms[0]).t, fk(S[1], tele.arms[1]).t];

    // GPU: on the table, in a gripper, being eaten, or gone until the next one drops in
    if (f.state === "held") {
      if (tele.arms[f.held].g < 0.5) {
        f.state = "free";
        f.held = -1;
        f.vy = 0.01;
      } else {
        f.x = tips[f.held].x - f.ox;
        f.y = tips[f.held].y - f.oy;
        // it is eaten once either end (or the middle) reaches the mouth
        const cy = f.y + GH / 2,
          reach = Math.min(
            Math.hypot(f.x - mouth.x, cy - mouth.y),
            Math.hypot(f.x + GW - mouth.x, cy - mouth.y),
            Math.hypot(f.x + GW / 2 - mouth.x, cy - mouth.y)
          );
        if (reach < 5) {
          f.state = "eating";
          f.t = 0;
          f.flip = f.x + GW / 2 > mouth.x; // fed from the right: it goes in left end first
        }
      }
    }
    if (f.state === "free") {
      for (let i = 0; i < 2; i++)
        if (tele.arms[i].g > 0.6 && tips[i].x > f.x - 2 && tips[i].x < f.x + GW + 2 && tips[i].y > f.y - 2 && tips[i].y < f.y + GH + 2) {
          f.state = "held";
          f.held = i;
          f.ox = clamp(tips[i].x - f.x, 1, GW - 1); // where on the card it was gripped
          f.oy = clamp(tips[i].y - f.y, 1, GH - 1);
        }
      const onTable = fc.x > fx - 34 && fc.x < fx + 35,
        floor = (onTable ? ty : gy) - GH;
      f.vy += 140 * dt;
      f.y += f.vy * dt;
      if (f.y >= floor) {
        f.y = floor;
        f.vy = 0;
        f.lost = onTable ? 0 : f.lost + dt;
      }
      if (f.lost > 1.4) spawn(true);
    } else if (f.state === "eating") {
      // slide the card in so its bitten end stays at the mouth
      const left = gpuLeft(f.bites) / Z;
      f.x += (mouth.x - (f.flip ? GW - left : left) - f.x) * ease(dt, 20);
      f.y += (mouth.y - GH / 2 - f.y) * ease(dt, 20);
      f.t += dt;
      if (f.t > 0.3) {
        f.t = 0;
        f.bites++;
        tele.chomp = 0.12;
        for (let k = 0; k < 3; k++)
          tele.crumbs.push({ x: mouth.x + 2, y: mouth.y + 1, vx: (Math.random() - 0.3) * 26, vy: -18 * Math.random(), life: 0.7 });
        if (f.bites >= 3) {
          f.state = "gone";
          f.t = 0;
          tele.fed++;
          if (tele.fed >= FULL) setEnd("creak");
          else tele.happy = 1.6;
        }
      }
    } else if (f.state === "gone") {
      f.t += dt;
      if (!tele.end && f.t > 1.1) spawn(true);
    }
    tele.happy = Math.max(0, tele.happy - dt);
    tele.chomp = Math.max(0, tele.chomp - dt);

    ctx.save();
    if (tele.shake > 0.3 && !reduce) {
      const amp = Math.min(2, tele.shake);
      ctx.translate(Math.round((Math.random() * 2 - 1) * amp), Math.round((Math.random() * 2 - 1) * amp));
    }
    ctx.fillStyle = pal.line;
    ctx.fillRect(-4, gy, W + 8, 0.5); // floor
    // the robot, after the OpenArm: steel base plate with two gussets, black extrusion column, chest shroud, shoulder motors
    box(fx - 11.5, gy - 2, 23, 2, 0.3, M.steel);
    if (tele.drop < 6) {
      capsule(fx + 4, gy - 13, fx + 9, gy - 2.5, 0.6, M.steel);
      capsule(fx - 4, gy - 13, fx - 9, gy - 2.5, 0.6, M.steel);
    }
    const colH = gy - 2 - (sy + 4);
    if (colH > 0.5) {
      box(fx - 2.5, sy + 4, 5, colH, 0.3, M.arm);
      if (colH > 3) {
        ctx.fillStyle = pal.slot;
        ctx.fillRect(fx - 0.5, sy + 5.5, 0.5, colH - 2.5);
      }
    }
    capsule(fx - 13, sy, fx - 7, sy, 3.6, M.arm);
    capsule(fx + 7, sy, fx + 13, sy, 3.6, M.arm); // shoulder motors
    band(fx - 9, sy, 1, 0, 0.5, 4, M.steel);
    band(fx + 9, sy, 1, 0, 0.5, 4, M.steel);
    box(fx - 5.5, sy + 1, 11, 4.5, 1.5, M.arm);
    box(fx - 7.5, sy - 6.5, 15, 9.5, 2, M.arm); // chest shroud
    R(fx - 1, sy - 3, 1, 1, pal.accent);
    R(fx + 1, sy - 3, 1, 1, pal.accent);
    R(fx, sy - 1, 1, 1, pal.accent);
    if (tele.broken) {
      capsule(fx - 38, gy - 1.2, fx - 17, gy - 8, 1, M.table);
      capsule(fx + 38, gy - 1.2, fx + 17, gy - 8, 1, M.table);
    } // table, snapped in two
    else {
      box(fx - 32, ty + 1.5, 2, gy - ty - 1.5, 0.2, M.table);
      box(fx + 31, ty + 1.5, 2, gy - ty - 1.5, 0.2, M.table);
      box(fx - 34.5, ty, 70, 2, 0.5, M.table);
    } // table

    // the passenger: a small orange pixel bot riding on the shoulders
    const hop = tele.happy > 0 && !reduce ? -Math.abs(Math.round(Math.sin(now * 13) * 1.6)) : 0;
    const bounce = tele.bounce > 0 ? -Math.round(Math.abs(Math.sin(tele.bounce * 16)) * 9 * tele.bounce) : 0,
      sob = sad && !reduce ? Math.round(Math.sin(now * 17) * 0.6) : 0;
    const squash = tele.chomp > 0 ? 1 : 0,
      ox = fx - Math.floor(bw / 2),
      oy = sy - 8 - bh + hop + squash + bounce + sob;
    // drawn flat on purpose: plain blocks of one color, no outline or shading, unlike the robot it sits on
    for (const k of [0.1, 0.27, 0.68, 0.85]) R(ox + Math.round(bw * k), oy + bh, grow >= 6 ? 2 : 1, 2 - squash, pal.bot);
    R(ox, oy, bw, bh, pal.bot);
    R(ox - 1, oy + Math.round(bh * 0.4), 1, 2, pal.bot);
    R(ox + bw, oy + Math.round(bh * 0.4), 1, 2, pal.bot);
    const watching =
      E && E !== "creak" && E !== "crash" && tele.ufo ? tele.ufo.x : f.state === "held" || f.state === "eating" ? fc.x : act ? mouse.x : fx;
    const look = clamp(Math.round((watching - fx) / 22), -1, 1);
    const eyes = [ox + Math.round(bw * 0.23), ox + Math.round(bw * 0.7)],
      ey = oy + Math.round(bh * 0.25),
      ew = grow >= 6 ? 2 : 1,
      eh = grow >= 3 ? 3 : 2;
    eyes.forEach((ex, n) => {
      if (sad) {
        // brows up in the middle, and tears
        const inner = n ? ex - 1 : ex + ew;
        R(n ? ex : ex, ey + 1, ew, 1, pal.botEye);
        R(inner, ey, 1, 1, pal.botEye);
        if (Math.floor((now + n * 0.17) / 0.34) !== Math.floor((now + n * 0.17 - dt) / 0.34))
          tele.tears.push({ x: ex + (n ? ew - 1 : 0), y: ey + 2, v: 4 });
      } else if (E === "creak" || E === "crash")
        R(ex, ey - 1, ew + 1, eh + 1, pal.botEye); // wide-eyed
      else if (tele.happy > 0) {
        R(ex - 1, ey + 1, 1, 1, pal.botEye);
        R(ex, ey, ew, 1, pal.botEye);
        R(ex + ew, ey + 1, 1, 1, pal.botEye);
      } else if (!reduce && now % 4 < 0.12) R(ex + look, ey + 1, ew, 1, pal.botEye);
      else R(ex + look, ey, ew, eh, pal.botEye);
    });
    const hungry =
      f.state === "eating" ||
      (f.state !== "gone" && Math.min(Math.hypot(f.x - mouth.x, fc.y - mouth.y), Math.hypot(f.x + GW - mouth.x, fc.y - mouth.y)) < 14);
    const mw = 3 + Math.floor(grow / 4),
      mx = fx - Math.floor(mw / 2),
      my = oy + Math.round(bh * 0.65);
    if (sad) {
      R(mx + 1, my, mw - 2, 1, pal.botEye);
      R(mx, my + 1, 1, 1, pal.botEye);
      R(mx + mw - 1, my + 1, 1, 1, pal.botEye);
    } // frown
    else if (E === "creak" || E === "crash") R(mx + 1, my, mw - 2, 2, pal.botEye);
    else if (tele.chomp > 0) R(mx, my + 1, mw, 1, pal.botEye);
    else if (hungry) R(mx, my, mw, 2, pal.botEye);
    tele.tears = tele.tears.filter((t) => {
      t.v += 70 * dt;
      t.y += t.v * dt;
      return t.y < oy + bh + 1;
    });
    for (const t of tele.tears) R(t.x, t.y, 1, 2, "#7cc4ff");

    for (let i = 0; i < 2; i++) drawArm(S[i], tele.arms[i]);
    if (f.state !== "gone") gpu(f.x, f.y, f.bites, f.flip);
    for (const b of tele.bits) {
      // wreckage: flies, then lies where it lands
      if (!b.rest) {
        b.vy += 220 * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y >= gy - b.h) {
          b.y = gy - b.h;
          b.rest = true;
        }
      }
      R(b.x, b.y, b.w, b.h, b.c);
    }
    tele.crumbs = tele.crumbs.filter((c) => (c.life -= dt) > 0);
    for (const c of tele.crumbs) {
      c.vy += (c.c ? 30 : 160) * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      R(c.x, c.y, 1, 1, c.c || CRUMB);
    }
    if (tele.happy > 0) {
      const hx = fx - 2,
        hy = oy - 7 - Math.round((1.6 - tele.happy) * 3),
        red = "#e2546b";
      R(hx + 1, hy, 1, 1, red);
      R(hx + 3, hy, 1, 1, red);
      R(hx, hy + 1, 5, 1, red);
      R(hx + 1, hy + 2, 3, 1, red);
      R(hx + 2, hy + 3, 1, 1, red);
    }
    ctx.restore();

    // the visitor: flies in, sweeps a scanning beam over the wreck, puts everything back, and leaves
    tele.ufo = null;
    if (E === "ufoIn" || E === "scan" || E === "rebuild" || E === "ufoOut") {
      const hov = { x: fx, y: 14 + (reduce ? 0 : Math.round(Math.sin(now * 3))) };
      let u = hov;
      if (E === "ufoIn") {
        const k = 1 - Math.pow(1 - clamp(TD / 1.3, 0, 1), 3);
        u = { x: W + 16 + (hov.x - W - 16) * k, y: 12 + (hov.y - 12) * k + Math.sin(k * Math.PI) * 8 };
      }
      if (E === "ufoOut") {
        const k = Math.pow(clamp(TD / 1.0, 0, 1), 2);
        u = { x: hov.x - (hov.x + 18) * k, y: hov.y - 30 * k };
      }
      tele.ufo = u;
      if (E === "scan" || E === "rebuild") {
        const y0 = Math.round(u.y) + 14,
          span = gy - y0,
          hw = (y) => Math.round(3 + 42 * ((y - y0) / span));
        ctx.fillStyle = "rgba(120,235,205,0.13)";
        for (let y = y0; y < gy; y += 0.5) {
          const h = 3 + 42 * ((y - y0) / span);
          ctx.fillRect(Math.round(u.x * Z - h * Z) / Z, y, Math.round(h * 2 * Z) / Z, 0.5);
        }
        if (E === "scan") {
          const p = (TD / 0.9) % 2,
            yb = y0 + Math.round(span * (p < 1 ? p : 2 - p));
          R(Math.round(u.x) - hw(yb), yb, 2 * hw(yb) + 1, 1, "rgba(200,255,238,0.9)");
        } else
          for (let k = 0; k < 7; k++) {
            const y = y0 + Math.floor(Math.random() * span);
            R(Math.round(u.x) - hw(y) + Math.floor(Math.random() * (2 * hw(y) + 1)), y, 1, 1, "rgba(255,255,255,0.9)");
          }
      }
      emblem(u.x, u.y, pal.ink);
      for (let k = 0; k < 3; k++) R(Math.round(u.x) - 4 + k * 4, Math.round(u.y) + 12.5, 1, 1, Math.floor(now * 6) % 3 === k ? "#7ef0d0" : pal.line);
    }
  }

  // ---------- input, sizing, loop ----------
  function point(e) {
    const r = cv.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * W;
    mouse.y = ((e.clientY - r.top) / r.height) * H;
    mouse.t = now;
  }
  hero.addEventListener("pointermove", point);
  hero.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("button,a")) {
      point(e);
      mouse.down = true;
    }
  });
  addEventListener("pointerup", () => {
    mouse.down = false;
  });
  addEventListener("pointercancel", () => {
    mouse.down = false;
  });
  function resize() {
    const r = cv.getBoundingClientRect(),
      px = r.width < 760 ? 3 : 4;
    const w = Math.max(40, Math.ceil(r.width / px)),
      h = Math.max(40, Math.ceil(r.height / px));
    if (w === W && h === H) return;
    W = w;
    H = h;
    cv.width = W * Z;
    cv.height = H * Z;
  }
  new ResizeObserver(resize).observe(cv);
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
  }).observe(cv);

  function step(dt) {
    now += dt;
    if (script) script();
    ctx.setTransform(Z, 0, 0, Z, 0, 0);
    ctx.clearRect(0, 0, W, H);
    teleop(dt);
  }
  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (visible && !document.hidden) step(dt);
    else now += dt;
    requestAnimationFrame(frame);
  }
  readPalette();
  resize();
  // debug hooks: ?fed=N starts with N GPUs eaten, ?path=1 scripts a grab-and-feed, ?ff=S fast-forwards S seconds, ?theme=dark|light
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("theme")) {
      root.setAttribute("data-theme", q.get("theme"));
      readPalette();
    }
    if (q.get("fed")) tele.fed = tele.size = +q.get("fed");
    if (q.get("path"))
      script = () => {
        const fx = anchorX() + 8,
          gy = groundY(),
          bh = Math.round(8 + (15 * tele.size) / FULL);
        const a = { x: fx - 20, y: gy - 14 - GH / 2 },
          b = { x: fx - GW / 2 + 2, y: gy - 46 - 8 - bh + Math.round(bh * 0.65) },
          k = clamp((now - 1.4) / 0.9, 0, 1);
        mouse.x = a.x + (b.x - a.x) * k;
        mouse.y = a.y + (b.y - a.y) * k;
        mouse.down = now > 0.9 && now < 4;
        mouse.t = now;
      };
    for (let i = 0, n = Math.round((+q.get("ff") || 0) * 60); i < n; i++) step(1 / 60);
  } catch (e) {}
  requestAnimationFrame(frame);
})();
