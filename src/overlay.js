// Overlay layer for the recorder.
//
// Injected into the product's own page and drawn on top, pointer-events:none so
// it never intercepts a click. Title cards and callouts are rendered by the
// browser, which means real CSS transitions instead of post-production ones.
//
// Styling comes from the Saviynt design system via brand/tokens.json. Kept in
// its own module so the look can be previewed without running a whole build —
// see `npm run preview:overlay`.

import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Brand. Pulled from the Saviynt design system into brand/ — see
// brand/tokens.json for the source files and the sync date.
//
// Everything is inlined as a data URI because the overlay is injected into the
// product's own page: an external <link> or font URL is subject to that page's
// CSP and would silently fail mid-recording.
// ---------------------------------------------------------------------------
const brand = JSON.parse(fs.readFileSync('brand/tokens.json', 'utf8'));

const dataUri = (file, mime) =>
  `data:${mime};base64,${fs.readFileSync(path.join('brand', file)).toString('base64')}`;

const BRAND = {
  font: dataUri('fonts/HankenGrotesk-latin.woff2', 'font/woff2'),
  logo: dataUri('logo-white-green.svg', 'image/svg+xml'),
  bug: dataUri('bug-green.svg', 'image/svg+xml'),
};

// The end card animates the logo's parts, so it needs the lockup inline rather
// than as an <img> — the internals of an image can't be styled. The four green
// paths are the bug mark, in clockwise order from the top-right; the <g> that
// follows is the wordmark. Tagging them here keeps the animation declarative.
let pieceIndex = 0;
const LOCKUP_SVG = fs.readFileSync('brand/logo-white-green.svg', 'utf8')
  .replace(/<\?xml[^>]*\?>\s*/, '')
  .replace(/<path fill="#00FF00"/g, () => `<path class="__p${++pieceIndex}" fill="#00FF00"`)
  .replace('<g>', '<g class="__wm">');

if (pieceIndex !== 4) {
  throw new Error(
    `brand/logo-white-green.svg: expected 4 green bug paths, found ${pieceIndex}. ` +
    `The end-card animation targets them by class — re-check the asset after a brand re-sync.`
  );
}

// Motion curve. Decelerating ease-out — movement arrives fast and settles,
// which reads as deliberate on video. A symmetric ease looks sluggish at these sizes.
const EASE = 'cubic-bezier(.16,.84,.44,1)';

// Dissolves want an even curve. Reusing the entrance ease above dumps most of
// the opacity in the first fifth of the fade, which reads as a cut, not a fade.
const DISSOLVE = 'cubic-bezier(.45,.05,.55,.95)';

const OVERLAY_CSS = `
  @font-face {
    font-family:'Hanken Grotesk Demo';
    src:url('${BRAND.font}') format('woff2');
    font-weight:300 700; font-style:normal; font-display:block;
  }

  #__demo_layer { position:fixed; inset:0; z-index:2147483647; pointer-events:none;
    font-family:'Hanken Grotesk Demo', ui-sans-serif, system-ui, sans-serif; }

  /* Plain black cover for the pre-roll. Separate from the title card so the
     card's entrance transitions are still unspent when the first scene starts. */
  #__demo_hold { position:absolute; inset:0; background:${brand.darkSurface.surface};
    opacity:0; transition:opacity .3s ${EASE}; }
  #__demo_hold.on { opacity:1; }

  /* ---- Title card: the dark title slide from the design system ---- */
  #__demo_card { position:absolute; inset:0; background:${brand.darkSurface.surface};
    opacity:0; transform:scale(1.015); transform-origin:50% 50%;
    transition:opacity .55s ${EASE}, transform .55s ${EASE};
    overflow:hidden; }
  #__demo_card.on { opacity:1; transform:scale(1); }

  /* Electric-blue glow bleeding off the top-right, as on title-dark.html */
  #__demo_card .__glow { position:absolute; right:-18%; top:-32%;
    width:72%; aspect-ratio:1; border-radius:50%;
    background:radial-gradient(circle, rgba(37,53,239,.50) 0%, rgba(37,53,239,.14) 45%, transparent 70%);
    opacity:0; transition:opacity 1.1s ${EASE} .1s; }
  #__demo_card.on .__glow { opacity:1; }

  /* Green bug motif, cropped by the right edge */
  #__demo_card .__bug { position:absolute; right:-9%; top:21%; width:30%;
    opacity:0; transform:translateX(26px);
    transition:opacity .8s ${EASE} .15s, transform .8s ${EASE} .15s; }
  #__demo_card.on .__bug { opacity:1; transform:translateX(0); }

  #__demo_card .__logo { position:absolute; left:var(--m); top:7.1%; width:17.8%;
    opacity:0; transform:translateY(-8px);
    transition:opacity .5s ${EASE} .12s, transform .5s ${EASE} .12s; }
  #__demo_card.on .__logo { opacity:1; transform:translateY(0); }

  /* Brand gradient rule — the green-to-blue signature, wiped in horizontally.
     Sits in flow directly above the headline so the spacing holds at any size. */
  #__demo_card .__rule { height:4px; width:96px; margin:0 0 28px;
    background:linear-gradient(90deg, ${brand.color.green}, ${brand.color.blue});
    transform:scaleX(0); transform-origin:0 50%;
    transition:transform .5s ${EASE} .18s; }
  #__demo_card.on .__rule { transform:scaleX(1); }

  /* Headline block starts at 46% of frame height, matching title-dark.html */
  #__demo_card .__text { position:absolute; left:var(--m); right:26%; top:46%; }
  #__demo_card h1 { margin:0; color:${brand.darkSurface.text};
    font-size:var(--h1); font-weight:${brand.type.coreWeight};
    line-height:${brand.type.leadingTight}; letter-spacing:-.015em;
    opacity:0; transform:translateY(14px);
    transition:opacity .5s ${EASE} .24s, transform .5s ${EASE} .24s; }
  #__demo_card p { margin:14px 0 0; color:${brand.darkSurface.text};
    font-size:var(--sub); font-weight:${brand.type.lightWeight}; opacity:0;
    transform:translateY(14px);
    transition:opacity .5s ${EASE} .34s, transform .5s ${EASE} .34s; }
  #__demo_card.on h1 { opacity:1; transform:translateY(0); }
  #__demo_card.on p  { opacity:.74; transform:translateY(0); }

  /* ---- End card ----
     A short film-style sting: the statement holds, dissolves, and the mark
     assembles from its four pieces, pulses once, and dissolves out to black.
     Every offset below is a CSS variable set from the scene's own narration
     budget, so the sting always finishes inside the shot. */
  #__demo_end { position:absolute; inset:0; background:${brand.darkSurface.surface};
    opacity:0; transition:opacity .5s ${EASE}; overflow:hidden; }
  #__demo_end.on { opacity:1; }

  #__demo_end .__endtext { position:absolute; left:var(--m); right:26%; top:46%; }
  #__demo_end h1 { margin:0; color:${brand.darkSurface.text};
    font-size:var(--h1); font-weight:${brand.type.coreWeight};
    line-height:${brand.type.leadingTight}; letter-spacing:-.015em; opacity:0; }
  #__demo_end p { margin:14px 0 0; color:${brand.darkSurface.text};
    font-size:var(--sub); font-weight:${brand.type.lightWeight}; opacity:0; }
  #__demo_end.on h1 { animation:__eIn .5s ${EASE} .22s both, __eOut .55s ${DISSOLVE} var(--t-textout) forwards; }
  #__demo_end.on p  { animation:__eInSub .5s ${EASE} .38s both, __eOut .55s ${DISSOLVE} var(--t-textout) forwards; }

  /* Green bloom behind the mark. Rides the same pulse as the lockup. */
  #__demo_end .__bloom { position:absolute; left:50%; top:50%; width:52%; aspect-ratio:1;
    margin:-26% 0 0 -26%; border-radius:50%; opacity:0;
    background:radial-gradient(circle, rgba(0,255,0,.30) 0%, rgba(0,255,0,.07) 40%, transparent 68%); }
  #__demo_end.on .__bloom { animation:__bloom 1.6s ${EASE} var(--t-pulse) both,
    __eOut .8s ${DISSOLVE} var(--t-out) forwards; }

  #__demo_end .__lockup { position:absolute; left:50%; top:50%; width:42%;
    transform:translate(-50%,-50%); }
  #__demo_end .__lockup svg { width:100%; height:auto; display:block; }

  /* Each bug piece drifts in from its own corner of the mark, 140ms apart. */
  #__demo_end .__lockup .__p1,
  #__demo_end .__lockup .__p2,
  #__demo_end .__lockup .__p3,
  #__demo_end .__lockup .__p4,
  #__demo_end .__lockup .__wm { opacity:0; }
  #__demo_end.on .__lockup .__p1 { animation:__pTR .62s ${EASE} var(--t-p1) both, __eOut .8s ${DISSOLVE} var(--t-out) forwards; }
  #__demo_end.on .__lockup .__p2 { animation:__pTL .62s ${EASE} var(--t-p2) both, __eOut .8s ${DISSOLVE} var(--t-out) forwards; }
  #__demo_end.on .__lockup .__p3 { animation:__pBL .62s ${EASE} var(--t-p3) both, __eOut .8s ${DISSOLVE} var(--t-out) forwards; }
  #__demo_end.on .__lockup .__p4 { animation:__pBR .62s ${EASE} var(--t-p4) both, __eOut .8s ${DISSOLVE} var(--t-out) forwards; }
  #__demo_end.on .__lockup .__wm { animation:__eIn .6s ${EASE} var(--t-wm) both, __eOut .8s ${DISSOLVE} var(--t-out) forwards; }

  @keyframes __eIn    { from { opacity:0; transform:translateY(14px); }
                        to   { opacity:1; transform:translateY(0); } }
  @keyframes __eInSub { from { opacity:0; transform:translateY(14px); }
                        to   { opacity:.74; transform:translateY(0); } }
  @keyframes __eOut   { to   { opacity:0; } }
  @keyframes __bloom  { 0% { opacity:0; transform:scale(.86); }
                        45% { opacity:1; transform:scale(1); }
                        100% { opacity:.55; transform:scale(1.04); } }
  /* Translations are in SVG user units, so they scale with the lockup. */
  @keyframes __pTR { from { opacity:0; transform:translate(46px,-38px); } to { opacity:1; transform:translate(0,0); } }
  @keyframes __pTL { from { opacity:0; transform:translate(-46px,-38px); } to { opacity:1; transform:translate(0,0); } }
  @keyframes __pBL { from { opacity:0; transform:translate(-46px,38px); } to { opacity:1; transform:translate(0,0); } }
  @keyframes __pBR { from { opacity:0; transform:translate(46px,38px); } to { opacity:1; transform:translate(0,0); } }

  /* ---- Callout ---- */
  /* Scrim and ring are separate elements so the dim can settle slower than the
     ring draws — the eye lands on the ring first, then the surroundings drop.
     The scrim is positioned on the target's own box: the huge shadow spread
     dims everything outside it while leaving the element itself lit. */
  .__demo_scrim { position:absolute; border-radius:10px;
    box-shadow:0 0 0 9999px rgba(0,0,0,.62);
    opacity:0; transition:opacity .5s ${EASE}; }
  .__demo_scrim.on { opacity:1; }

  .__demo_ring { position:absolute; border:2.5px solid ${brand.video.ringGreen};
    border-radius:10px; opacity:0; transform:scale(1.05); transform-origin:50% 50%;
    box-shadow:0 0 22px rgba(0,255,0,.45), inset 0 0 0 1px rgba(0,0,0,.5);
    transition:opacity .32s ${EASE} .06s, transform .32s ${EASE} .06s; }
  .__demo_ring.on { opacity:1; transform:scale(1); }

  /* Black-on-green pill: green is the accent on dark surfaces, and the high
     luma gap keeps small type crisp through 4:2:0 chroma subsampling. */
  .__demo_tip { position:absolute; background:${brand.color.green};
    color:${brand.video.tipText}; padding:8px 14px; border-radius:${brand.radius.pill}px;
    font-size:15px; font-weight:${brand.type.coreWeight}; letter-spacing:.005em;
    white-space:nowrap; box-shadow:0 6px 20px rgba(0,0,0,.45);
    opacity:0; transform:translateY(6px);
    transition:opacity .3s ${EASE} .16s, transform .3s ${EASE} .16s; }
  .__demo_tip.on { opacity:1; transform:translateY(0); }
`;

export async function installOverlay(page) {
  await page.addStyleTag({ content: OVERLAY_CSS }).catch(() => {});
  await page.evaluate(([logo, bug, t, lockupSvg]) => {
    if (document.getElementById('__demo_layer')) return;
    const layer = document.createElement('div');
    layer.id = '__demo_layer';

    // Type and margin scale with the viewport so the card keeps the design
    // system's proportions at any capture size.
    const w = window.innerWidth;
    layer.innerHTML = `
      <div id="__demo_hold"></div>
      <div id="__demo_card" style="
        --m:${Math.round(w * t.marginRatio)}px;
        --h1:${Math.round(w * t.headlineRatio)}px;
        --sub:${Math.round(w * t.headlineRatio * 0.3)}px;">
        <div class="__glow"></div>
        <img class="__bug"  src="${bug}"  alt="">
        <img class="__logo" src="${logo}" alt="Saviynt">
        <div class="__text"><div class="__rule"></div><h1></h1><p></p></div>
      </div>
      <div id="__demo_end" style="
        --m:${Math.round(w * t.marginRatio)}px;
        --h1:${Math.round(w * t.headlineRatio)}px;
        --sub:${Math.round(w * t.headlineRatio * 0.3)}px;">
        <div class="__bloom"></div>
        <div class="__endtext"><h1></h1><p></p></div>
        <div class="__lockup">${lockupSvg}</div>
      </div>`;
    document.body.appendChild(layer);
  }, [BRAND.logo, BRAND.bug, brand.titleSlide, LOCKUP_SVG]);
}

// Pre-roll cover. Held under the title card and cleared along with it.
export async function showHold(page) {
  await installOverlay(page);
  await page.evaluate(() => {
    document.getElementById('__demo_hold')?.classList.add('on');
  });
}

export async function showCard(page, title, subtitle) {
  await installOverlay(page);
  await page.evaluate(([t, s]) => {
    const card = document.getElementById('__demo_card');
    card.querySelector('h1').textContent = t;
    card.querySelector('p').textContent = s || '';
    card.classList.add('on');
  }, [title, subtitle]);
}

export async function hideCard(page) {
  await page.evaluate(() => {
    document.getElementById('__demo_hold')?.classList.remove('on');
    document.getElementById('__demo_card')?.classList.remove('on');
    document.getElementById('__demo_end')?.classList.remove('on');
  }).catch(() => {});
}

// End card. `budgetMs` is the scene's narration length plus its tail — the sting
// is laid out against it so the dissolve lands inside the shot no matter how the
// closing line is rewritten. The recorder's trailing hold covers the last frames.
export async function showEndCard(page, title, subtitle, budgetMs) {
  await installOverlay(page);

  const D = budgetMs;
  const STAGGER = 140, PIECE = 620, OUT = 800;
  const textOut = Math.max(1800, D * 0.30);   // statement holds, then clears
  const p1 = textOut + 420;                   // mark starts assembling
  const wm = p1 + 3 * STAGGER + PIECE - 120;  // wordmark resolves as it settles

  // The dissolve must finish inside the scene budget. compose muxes with
  // -shortest against a voice track exactly as long as the sum of the scene
  // budgets, so the recorder's trailing hold is trimmed off the end — anything
  // still animating past D is simply not in the file.
  const out = D - OUT - 20;

  // Warn from here, not from inside page.evaluate: that runs in the browser and
  // its console never reaches the terminal.
  if (out < wm + 350) {
    console.warn(
      `  ! end card "${title}": the closing narration (${Math.round(D)}ms) is too ` +
      `short for the logo sting. Lengthen the line, or the mark will barely land.`
    );
  }

  const vars = {
    '--t-textout': textOut,
    '--t-p1': p1,
    '--t-p2': p1 + STAGGER,
    '--t-p3': p1 + 2 * STAGGER,
    '--t-p4': p1 + 3 * STAGGER,
    '--t-wm': wm,
    '--t-pulse': wm + 120,
    '--t-out': out,
  };

  await page.evaluate(([t, s, v]) => {
    const end = document.getElementById('__demo_end');
    end.querySelector('h1').textContent = t;
    end.querySelector('p').textContent = s || '';
    Object.entries(v).forEach(([k, ms]) => end.style.setProperty(k, `${Math.round(ms)}ms`));
    end.classList.add('on');
  }, [title, subtitle, vars]);
}

export async function callout(page, selector, text) {
  await installOverlay(page);
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return;
  await page.evaluate(([b, label]) => {
    const layer = document.getElementById('__demo_layer');

    const scrim = document.createElement('div');
    scrim.className = '__demo_scrim';
    Object.assign(scrim.style, {
      left: `${b.x - 6}px`, top: `${b.y - 6}px`,
      width: `${b.width + 12}px`, height: `${b.height + 12}px`,
    });

    const ring = document.createElement('div');
    ring.className = '__demo_ring';
    Object.assign(ring.style, {
      left: `${b.x - 6}px`, top: `${b.y - 6}px`,
      width: `${b.width + 12}px`, height: `${b.height + 12}px`,
    });

    const tip = document.createElement('div');
    tip.className = '__demo_tip';
    tip.textContent = label;

    // Mount hidden to measure, then place. The tip is nowrap, so for a target
    // low or far right in the frame the old fixed offset ran it off-screen.
    tip.style.visibility = 'hidden';
    layer.append(scrim, ring, tip);

    const GAP = 14, EDGE = 16;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;

    let top = b.y + b.height + GAP;
    if (top + th > vh - EDGE) top = b.y - th - GAP;      // flip above
    top = Math.max(EDGE, Math.min(top, vh - th - EDGE));

    let left = b.x - 6;
    left = Math.max(EDGE, Math.min(left, vw - tw - EDGE)); // clamp horizontally

    Object.assign(tip.style, { left: `${left}px`, top: `${top}px`, visibility: '' });

    requestAnimationFrame(() => {
      scrim.classList.add('on');
      ring.classList.add('on');
      tip.classList.add('on');
    });
  }, [box, text]);
}

export async function clearCallout(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.__demo_scrim, .__demo_ring, .__demo_tip').forEach(n => {
      n.classList.remove('on');
      setTimeout(() => n.remove(), 600);
    });
  }).catch(() => {});
}
