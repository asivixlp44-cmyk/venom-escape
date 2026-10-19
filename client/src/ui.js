// HUD and panels. Top centre: what to do next (the reference's tutorial line) with your Wins, Venom
// and stage under it. Left: your level ring (the symbiote's face, how far to the next level, your
// tentacle's length). Right: Symbiotes, Train, Rebirth, x2 Venom. Top right: the menu icons (the top
// left stays free for the Bloxity overlay). Bottom: RELEASE VENOM on a launch pad, the tentacle meter
// while you steer. Then every popup and panel.
import { $ } from './engine.js';
import { S, actions, net } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume } from './audio.js';
import * as BX from './bloxity.js';
import { getQuality, setQuality } from './fx.js';
import { symIcon } from './venom.js';
import {
    CFG, STAGES, SYMBIOTES, symById, TRAIN_PADS, PASSES, PRODUCTS, priceOf, GIFTS, DAILY, dailyStatus, rewardText, fmt, fmtComma, clock,
    playtimeText, levelOf, venomFor, tentacleLen, rebirthLevel, rebirthMult, padUnlocked, symbioteVenom, WORLDS, STAGES_PER_WORLD,
    firstStageOf, worldOfStage, symAvailable,
} from '../../shared/config.js';

const C = (n) => '<span class="cup">🏆</span>' + fmt(n);
function setHtml(node, html) { if (node && node.innerHTML !== html) node.innerHTML = html; }
function setText(node, t) { if (node && node.textContent !== t) node.textContent = t; }
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const promptEl = $('#promptBtn'), promptTxtEl = $('#promptTxt');
const shown = () => (S.shownVenom ? S.shownVenom() : S.venom || 0);

// Every button clicks
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) sfx(b.classList.contains('g-green') ? 'clickBuy' : 'click'); }, true);

// ----- counters (count up smoothly) -----
let shownWins = 0, winsText = -1, venomText = '';
export function animateCounters(dt) {
    if (Math.abs(shownWins - S.wins) < 0.5) shownWins = S.wins;
    else shownWins += (S.wins - shownWins) * Math.min(1, dt * 8);
    const n = Math.round(shownWins);
    if (n !== winsText) { winsText = n; setText($('#winsVal'), fmtComma(n)); }
    const v = fmt(shown());
    if (v !== venomText) { venomText = v; setText($('#venomVal'), v); }
}
// Restarts a CSS animation: the class comes off now and back on next frame (reading offsetWidth
// instead would force a whole layout of the page in the middle of the game's frame)
// (hide: a banner stays invisible until its animation starts, so it doesn't flash up first)
function replay(el, cls, hide) {
    el.classList.remove(cls);
    if (hide) el.style.visibility = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => { el.classList.add(cls); if (hide) el.style.visibility = ''; }));
}
export function bumpWins() { replay($('#winsChip'), 'bump'); }

// ----- the HUD (10x a second) -----
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;
let ringKey = '', iconKey = null, rbKey = '';
export function updateHud() {
    const now = net.now();
    const v = shown(), L = levelOf(v);
    const a = venomFor(L), b = venomFor(L + 1), k = Math.max(0, Math.min(1, (v - a) / Math.max(1, b - a)));
    const w = S.here || 1, rk = L + '|' + Math.round(k * 100) + '|' + w;
    if (rk !== ringKey) {
        ringKey = rk;
        $('#lvRing').style.setProperty('--p', k.toFixed(3));
        setText($('#lvNum'), String(L));
        // the later worlds drain your venom: the tentacle you get here
        const len = tentacleLen(L, S, w), dr = WORLDS[w - 1].drain;
        setHtml($('#lvLen'), '<b>' + len + '</b> studs' + (dr < 1 ? ' <span class="drain">' + WORLDS[w - 1].ic + ' -' + Math.round((1 - dr) * 100) + '%</span>' : ''));
        setText($('#lvNext'), len >= CFG.maxLen ? 'Max length!' : fmt(Math.max(0, b - v)) + ' Venom to Lv ' + (L + 1));
    }
    const ik = S.wear || '';
    if (ik !== iconKey) { iconKey = ik; $('#lvFace').style.backgroundImage = `url("${symIcon(ik)}")`; }
    setText($('#venomRate'), '+' + fmt(Math.max(1, S.rate || 0)) + '/s');
    // the rebirth button: how close you are
    const need = rebirthLevel(S.rebirths);
    const rbw = Math.min(100, Math.round(L / need * 100)) + '%';
    if (rbw !== rbKey) { rbKey = rbw; $('#rbFill').style.width = rbw; }
    setText($('#rbText'), L >= need ? 'READY!' : 'Lv ' + L + '/' + need);
    $('#btnRebirth').classList.toggle('ready', L >= need);
    setText($('#rbMult'), 'x' + rebirthMult(S.rebirths));
    const dv = !!(S.passes && S.passes.DoubleVenom);
    $('#btnX2').classList.toggle('own', dv);
    setHtml($('#x2Sub'), dv ? 'OWNED' : C(PASSES.DoubleVenom.price));
    // menu icons
    const secs = sessionSecs();
    const next = GIFTS.findIndex((g, i) => !S.giftClaimed[i]);
    const ready = GIFTS.some((g, i) => !S.giftClaimed[i] && secs >= g.min * 60);
    $('#giftBadge').hidden = !ready;
    updateGiftChip(secs);
    setText($('#giftLb'), ready ? 'READY' : next < 0 ? 'DONE' : Math.max(1, Math.ceil((GIFTS[next].min * 60 - secs) / 60)) + 'm');
    $('#dailyBadge').hidden = !dailyStatus(S.daily, now).can;
    const shopReady = SYMBIOTES.some((s) => !(S.syms && S.syms[s.id]) && symAvailable(S, s) && S.wins >= s.price);
    $('#shopBadge').hidden = !shopReady;
    $('#symBadge').hidden = !shopReady;
    const boosts = [];
    if ((S.venomBoostUntil || 0) > now) boosts.push('🧪 x2 Venom ' + clock((S.venomBoostUntil - now) / 1000));
    if ((S.boostUntil || 0) > now) boosts.push('🏆 x2 Wins ' + clock((S.boostUntil - now) / 1000));
    setText($('#boostTag'), boosts.join('  ·  '));
    $('#boostTag').hidden = !boosts.length;
    setText($('#friendBoost'), (S.friends ? 'Friend Boost: +' + Math.round(Math.min(CFG.friendMax, S.friends) * CFG.friendBoost * 100) + '%' : ''));
}
// ----- the stage chip -----
let progKey = '';
export function renderProgress(stage, world, start) {
    const w = world || 1, f = firstStageOf(w), W = WORLDS[w - 1];
    const n = start ? 0 : Math.max(0, (stage ?? -1) - f + 1), key = w + '|' + n;
    if (key === progKey) return;
    progKey = key;
    setText($('#stageText'), n > 0 ? W.ic + ' Stage ' + (f + n) + ' · ' + n + '/' + STAGES_PER_WORLD : w === 1 ? 'Lobby' : W.ic + ' ' + W.name);
    $('#stageFill').style.width = Math.max(4, n / STAGES_PER_WORLD * 100) + '%';
}
// ----- the streak: platforms crossed in a row without falling (the Wins pads pay more) -----
let streakKey = -1;
export function setStreak(n) {
    if (n === streakKey) return;
    streakKey = n;
    const el = $('#streakChip'), bonus = Math.min(CFG.streakMax, Math.max(0, n - 1) * CFG.streakStep);
    el.hidden = n < 2;
    if (n >= 2) { setHtml($('#streakVal'), n + '<small>+' + Math.round(bonus * 100) + '%</small>'); replay(el, 'bump'); }
}
// ----- worlds: the title card on arrival, the loading card the first time -----
export function showWorldTitle(w) {
    const W = WORLDS[w - 1];
    setText($('#stageName'), W.ic + ' WORLD ' + w + ': ' + W.name.toUpperCase());
    setHtml($('#stageSub'), w === 1 ? 'Train, shop and rebirth, then swing over the lava!' : 'The ' + (w === 2 ? 'toxic air' : 'void') + ' drains your venom: tentacles are <b>' + Math.round((1 - W.drain) * 100) + '% shorter</b> here. Train on the new pads!');
    pop('#stageTitle', 4200);
}
export function setWorldLoading(w) {
    const el = $('#worldLoad');
    if (!w) { el.hidden = true; return; }
    const W = WORLDS[w - 1];
    setText($('#worldLoadT'), W.ic + ' Entering World ' + w + '…');
    setText($('#worldLoadS'), W.name);
    el.className = 'overlay wl' + w;
    el.hidden = false;
}
// ----- the objective line -----
// a goal can carry an action: the line becomes a button (buy that symbiote, go train...)
let goalText = null, goalAct = null;
export function setGoal(text, act) {
    goalAct = act || null;
    const g = $('#goal');
    g.classList.toggle('act', !!goalAct);
    if (text === goalText) return;
    goalText = text;
    g.hidden = !text;
    if (text) { setText($('#goalText'), text); replay(g, 'pop'); }
}
$('#goal').addEventListener('click', () => { if (goalAct) goalAct(); });
// ----- the next playtime gift, counting down under the stats (tap to claim) -----
let giftKey = '';
function updateGiftChip(secs) {
    const k = GIFTS.findIndex((g, i) => !S.giftClaimed[i]), el = $('#giftChip');
    if (k < 0) { if (!el.hidden) el.hidden = true; return; }
    const g = GIFTS[k], left = Math.max(0, Math.ceil(g.min * 60 - secs)), ready = left <= 0;
    const t = ready ? '🎁 CLAIM: ' + rewardText(g) + '!' : '🎁 ' + rewardText(g) + ' in ' + clock(left);
    const key = t + ready;
    if (key === giftKey) return;
    giftKey = key;
    el.hidden = false;
    el.classList.toggle('ready', ready);
    el.dataset.k = k;
    setText($('#giftChipT'), t);
}
$('#giftChip').addEventListener('click', () => {
    const el = $('#giftChip'), k = +el.dataset.k;
    if (el.classList.contains('ready')) net.send('gift', { k }); else openModal('gifts');
});
// ----- the tentacle meter (bottom centre while you steer) -----
let meterKey = '', knobT = '';
export function setMeter(m) {
    const el = $('#meter');
    if (!m.on) { if (!el.hidden) el.hidden = true; meterKey = ''; return; }
    el.hidden = false;
    const key = m.left + '/' + m.total;
    if (key !== meterKey) {
        meterKey = key;
        setText($('#meterText'), key);
        $('#meterFill').style.width = (m.left / Math.max(1, m.total) * 100) + '%';
        $('#meter').classList.toggle('low', m.left / Math.max(1, m.total) < 0.25);
    }
    const kt = `translateX(${(m.steer * 4.2).toFixed(2)}rem)`;
    if (kt !== knobT) { knobT = kt; $('#meterKnob').style.transform = kt; }
}
let launchOn = null;
export function setLaunch(on, touch) {
    if (on === launchOn) return;
    launchOn = on;
    $('#launchBtn').hidden = !on;
    $('#launchKey').hidden = !!touch;
}
$('#launchBtn').addEventListener('click', () => actions.release && actions.release());
let homeOn = null;
export function setHome(on, touch) {
    if (on === homeOn) return;
    homeOn = on;
    $('#homeBtn').hidden = !on;
    $('#homeKey').hidden = !!touch;
}
$('#homeBtn').addEventListener('click', () => actions.goHome && actions.goHome());
let trainKey = null;
export function setTrainTag(mult) {
    if (mult === trainKey) return;
    trainKey = mult;
    const el = $('#trainTag');
    el.hidden = !mult;
    if (mult > 0) setHtml(el, '⚡ TRAINING <b>x' + fmt(mult) + '</b> VENOM');
    else if (mult < 0) setHtml(el, '🔒 This pad is locked');
}

// ----- toasts, banners -----
export function toast(text, color) {
    const d = document.createElement('div');
    d.className = 'toast o';
    d.style.color = color || '#fff';
    d.textContent = text;
    const box = $('#toasts');
    box.appendChild(d);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => d.remove(), 2900);
}
function pop(id, ms) {
    const el = $(id);
    el.hidden = false; replay(el, 'go', true);
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.hidden = true; }, ms);
}
export function showStageTitle(i) {
    const s = STAGES[i];
    if (!s) return;
    setText($('#stageName'), s.ic + ' Stage ' + (i + 1) + ': ' + s.name);
    setHtml($('#stageSub'), esc(s.sub) + ' · Recommended <b>Lv ' + s.R + '</b>');
    pop('#stageTitle', 3200);
}
export function showStageClear(i, s) {
    setText($('#clearT'), 'STAGE ' + (i + 1) + ' CLEAR!');
    const next = worldOfStage(i + 1) === worldOfStage(i) ? STAGES[i + 1] : null;
    setHtml($('#clearS'), next ? 'Next: ' + next.ic + ' ' + esc(next.name) + ' · Recommended Lv ' + next.R : '👑 The escape portal is right there!');
    pop('#clearBanner', 2400);
    void s;
}
export function showPadWin(n, bonus) {
    setHtml($('#winPopT'), (bonus ? '✨ BONUS ' : '') + '+' + fmt(n) + ' WINS!');
    $('#winPop').classList.toggle('bonus', !!bonus);
    pop('#winPop', 1900);
    bumpWins();
}
export function showLevelUp(L, len) {
    setText($('#lvUpT'), 'LEVEL ' + L + '!');
    setText($('#lvUpS'), '🕷️ Tentacle: ' + len + ' studs');
    pop('#lvUp', 2000);
}
export function showEscaped(m) {
    const W = WORLDS[(m.w || 1) - 1];
    setText($('#escSub'), W.ic + ' ' + W.name + ' · +' + fmt(m.wins) + ' Wins · ' + clock(m.secs) + ((m.w || 1) === 1 && m.best && m.best === m.secs ? ' (new best!)' : ''));
    const u = $('#escUnlock');
    u.hidden = !m.unlocked;
    if (m.unlocked) setText(u, '🔓 WORLD ' + m.unlocked + ' UNLOCKED: ' + WORLDS[m.unlocked - 1].ic + ' ' + WORLDS[m.unlocked - 1].name + '!');
    pop('#escBanner', 5200);
}
export function showReborn(r) {
    setText($('#rebornS'), 'Rebirth ' + r + ' · x' + rebirthMult(r) + ' Venom forever!');
    pop('#reborn', 3600);
}
const CHEERS = ['💪 Nice swing!', '🕷️ Venomous!', '🔥 Unstoppable!', '⭐ Keep going!', '😎 Too easy!', '🚀 Nothing can stop you!'];
let cheerN = 0;
export function cheer() { setText($('#cheer'), CHEERS[cheerN++ % CHEERS.length]); pop('#cheer', 2600); }
export function flash(color, ms) {
    const f = $('#flash');
    f.style.transition = 'none'; f.style.background = color || '#fff'; f.style.opacity = 0.85;
    requestAnimationFrame(() => { f.style.transition = 'opacity ' + ((ms || 600) / 1000) + 's ease'; f.style.opacity = 0; });
}
export function teleportFx() { replay($('#tpFx'), 'go'); }

// ----- offline earnings: "GET VENOM OFFLINE" -----
export function showOffline(venom, secs) {
    setText($('#offAmt'), '+' + fmt(venom) + ' Venom');
    setText($('#offSecs'), 'Your symbiote kept growing for ' + playtimeText(secs) + ' while you were away!');
    $('#offlineCard').hidden = false;
    setMusicDuck(true);
}
$('#offClaim').addEventListener('click', () => { net.send('offline'); $('#offlineCard').hidden = true; setMusicDuck(false); });

// =====================================================================================
// Purchases: everything costs Wins. A confirm shows the price; the server checks it and takes the Wins.
// =====================================================================================
let pending = null;
function confirmBuy(o) {
    pending = o;
    const short = o.price - (S.wins || 0);
    setHtml($('#confirmIc'), o.ic);
    setText($('#confirmTitle'), o.name);
    setText($('#confirmText'), o.desc || '');
    setHtml($('#confirmCost'), C(o.price) + ' Wins');
    const yes = $('#confirmYes');
    yes.disabled = short > 0;
    setText(yes, short > 0 ? 'Need ' + fmt(short) + ' more' : 'Buy');
    setText($('#confirmNote'), short > 0 ? 'Cross the lava to earn Wins: every stage pays more than the last!' : 'You have ' + fmtComma(S.wins) + ' Wins');
    $('#confirm').hidden = false;
    setMusicDuck(true);
}
export function buy(kind, key) {
    const item = kind === 'pass' ? PASSES[key] : PRODUCTS[key];
    if (!item) return;
    if (kind === 'pass' && S.passes[key]) { toast(item.name + ' already owned!', '#6fe0ff'); return; }
    confirmBuy({ ic: item.ic, name: item.name, desc: item.desc, price: priceOf(kind, key), send: ['buy', { kind, key }] });
}
// A symbiote: buy it (or wear it if it's yours)
actions.buySym = (id) => {
    const s = symById[id];
    if (!s) return;
    if (S.syms && S.syms[id]) { net.send('wear', { id: S.wear === id ? '' : id }); sfx('equip'); return; }
    confirmBuy({ ic: `<img src="${symIcon(id)}" alt="">`, name: s.name, desc: '+' + fmt(s.venom) + ' Venom every second, forever. Wear it: your suit and tentacle in its colours!', price: s.price, send: ['sym', { id }] });
};
actions.unlockPadConfirm = (i) => {
    const d = TRAIN_PADS[i];
    confirmBuy({ ic: '⚡', name: fmt(d.mult) + 'x Venom pad', desc: 'Unlock the ' + fmt(d.mult) + 'x pad ' + ((d.world || 1) > 1 ? 'in the World ' + d.world + ' hub' : 'in the Train Zone') + ' forever: stand on it to multiply your Venom.', price: d.wins, send: ['unlockPad', { i }] });
};
export function notEnough(m) { toast('Not enough Wins! You need ' + fmt(m.need) + ' more for ' + m.name, '#ff5a7a'); }
function closeConfirm() { $('#confirm').hidden = true; pending = null; if (!modalOpen()) setMusicDuck(false); }
$('#confirmYes').addEventListener('click', () => { const p = pending; closeConfirm(); if (p) net.send(p.send[0], p.send[1]); });
$('#confirmNo').addEventListener('click', closeConfirm);
$('#confirmClose').addEventListener('click', closeConfirm);

// =====================================================================================
// Panels
// =====================================================================================
let modalKind = null, modalTab = null;
export function openModal(kind, tab) { modalKind = kind; modalTab = tab || null; renderModal(); $('#modal').hidden = false; setMusicDuck(true); }
export function closeModal() { $('#modal').hidden = true; modalKind = null; setMusicDuck(false); }
export function refreshModal() { if (!$('#modal').hidden) renderModal(); }
export const modalOpen = () => !$('#modal').hidden;
$('#modalClose').addEventListener('click', closeModal);
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') closeModal(); });

function el(tag, cls, html) { const d = document.createElement(tag); if (cls) d.className = cls; if (html !== undefined) d.innerHTML = html; return d; }
function sec(body, text) { body.appendChild(el('div', 'sec o1', esc(text))); }
function note(body, text) { body.appendChild(el('p', 'note o1', text)); }
function card(o) {
    const d = el('div', 'card' + (o.cls ? ' ' + o.cls : ''));
    d.innerHTML = `<div class="ic">${o.ic}</div><div class="nm o1">${esc(o.name)}</div>${o.desc ? `<div class="ds o1">${o.desc}</div>` : ''}`;
    if (o.btn) {
        const b = el('button', 'btn ' + (o.btnCls || 'g-green') + ' o1', o.btn);
        b.disabled = !!o.disabled;
        b.addEventListener('click', o.onClick);
        d.appendChild(b);
    }
    return d;
}
function tabs(list) {
    const t = $('#modalTabs');
    t.innerHTML = '';
    if (!list) return;
    for (const [id, label] of list) {
        const b = el('button', 'btn g-purple o1' + (modalTab === id ? ' on' : ''), label);
        b.addEventListener('click', () => { modalTab = id; renderModal(); });
        t.appendChild(b);
    }
}
function renderModal() {
    const body = $('#modalBody');
    const scroll = body.scrollTop;
    body.innerHTML = '';
    const titles = { shop: 'WIN SHOP', rebirth: 'REBIRTH', config: 'SETTINGS', gifts: 'GIFTS', invite: 'INVITE', teleport: 'TELEPORT' };
    setText($('#modalTitle'), titles[modalKind] || '');
    tabs(null);
    ({ shop: renderShop, rebirth: renderRebirth, config: renderConfig, gifts: renderGifts, invite: renderInvite, teleport: renderTeleport }[modalKind] || (() => {}))(body);
    body.scrollTop = scroll;
}

// ----- the Win Shop: symbiotes, boosts, Train Zone pads -----
function renderShop(body) {
    tabs([['syms', '🕷️ Symbiotes'], ['boosts', '⚡ Boosts'], ['pads', '🏋️ Train Pads']]);
    const tab = modalTab || 'syms';
    const g = el('div', 'grid');
    if (tab === 'syms') {
        note(body, 'Every symbiote you own adds Venom <b>every second</b> (you have +' + fmt(symbioteVenom(S)) + '/s from symbiotes). Wear your favourite: your suit and tentacle take its colours.');
        SYMBIOTES.forEach((s) => {
            const own = !!(S.syms && S.syms[s.id]), wear = S.wear === s.id, avail = symAvailable(S, s);
            g.appendChild(card({
                ic: `<img src="${symIcon(s.id)}" alt="">`, name: s.name, desc: '<span class="vps">+' + fmt(s.venom) + ' Venom/sec</span>' + ((s.world || 1) > 1 ? ' · ' + WORLDS[s.world - 1].ic + ' World ' + s.world : ''),
                cls: (wear ? 'own wear' : own ? 'own' : '') + (s.rainbow ? ' rainbow' : s.price >= 15000 ? ' gold' : ''),
                btn: wear ? 'Wearing' : own ? 'Wear' : !avail ? '🔒 World ' + s.world : C(s.price), btnCls: own ? 'g-blue' : avail && S.wins >= s.price ? 'g-green' : 'g-grey',
                disabled: wear || (!own && !avail), onClick: () => actions.buySym(s.id),
            }));
        });
    } else if (tab === 'boosts') {
        for (const [k, cls] of [['DoubleVenom', 'hot'], ['DoubleWins', 'gold'], ['FastTentacle', ''], ['LongTentacle', ''], ['DoubleJump', '']]) {
            const p = PASSES[k], own = !!S.passes[k];
            g.appendChild(card({ ic: p.ic, name: p.name, desc: esc(p.desc), cls: (cls || '') + (own ? ' own' : ''), btn: own ? 'Owned' : C(p.price), btnCls: own ? 'g-blue' : S.wins >= p.price ? 'g-green' : 'g-grey', disabled: own, onClick: () => buy('pass', k) }));
        }
        for (const k of ['VenomBoost', 'WinsBoost']) {
            const p = PRODUCTS[k];
            g.appendChild(card({ ic: p.ic, name: p.name, desc: esc(p.desc), btn: C(p.price), btnCls: S.wins >= p.price ? 'g-green' : 'g-grey', onClick: () => buy('product', k) }));
        }
    } else {
        note(body, 'Stand on a Train Zone pad to multiply your Venom: eight in the lobby (west side), three bigger ones in each world\'s hub. The small ones unlock with rebirths; the big ones you buy with Wins.');
        TRAIN_PADS.forEach((d, i) => {
            const on = padUnlocked(S, i), w = d.world || 1, wl = w > (S.world || 1);
            g.appendChild(card({
                ic: w > 1 ? WORLDS[w - 1].ic : '⚡', name: fmt(d.mult) + 'x Venom', desc: wl ? 'Reach World ' + w : on ? 'Unlocked' + (w > 1 ? ' · World ' + w : '') : d.wins ? 'Unlock with Wins' + (w > 1 ? ' · World ' + w : '') : 'Needs ' + d.reb + ' rebirth' + (d.reb > 1 ? 's' : ''),
                cls: on ? 'own' : '', btn: wl ? '🔒 World ' + w : on ? 'Go train' : d.wins ? C(d.wins) : '🔒 ' + d.reb + ' ♻️', btnCls: on ? 'g-blue' : !wl && d.wins && S.wins >= d.wins ? 'g-green' : 'g-grey',
                disabled: wl || (!on && !d.wins), onClick: () => { if (on) { closeModal(); actions.goPad(i); } else actions.unlockPadConfirm(i); },
            }));
        });
    }
    body.appendChild(g);
}
// ----- Rebirth -----
function renderRebirth(body) {
    const r = S.rebirths || 0, L = levelOf(shown()), need = rebirthLevel(r);
    const d = el('div', 'rebirth');
    d.innerHTML = `<div class="rbBig o">x${rebirthMult(r)} <span>→</span> x${rebirthMult(r + 1)}</div>
        <div class="o1">Rebirth <b>${r + 1}</b>: your Venom multiplier goes up forever.</div>
        <div class="rbBar"><div class="rbBarFill" style="width:${Math.min(100, L / need * 100)}%"></div><span class="o1">Level ${L} / ${need}</span></div>
        <ul class="o1"><li>✅ Keep your Wins, symbiotes, passes and pads</li><li>✅ Unlock new Train Zone pads (${TRAIN_PADS.filter((p) => p.reb === r + 1).map((p) => p.mult + 'x').join(', ') || 'more to come'})</li><li>⚠️ Your Venom (and level) go back to zero</li></ul>`;
    const b = el('button', 'btn ' + (L >= need ? 'g-purple' : 'g-grey') + ' o big', L >= need ? '♻️ REBIRTH!' : 'Reach level ' + need);
    b.disabled = L < need;
    b.addEventListener('click', () => { net.send('rebirth'); closeModal(); });
    d.appendChild(b);
    body.appendChild(d);
}
// ----- Teleport -----
function renderTeleport(body) {
    sec(body, 'Worlds');
    const g = el('div', 'grid');
    WORLDS.forEach((W, k) => {
        const w = k + 1, open = (S.world || 1) >= w;
        g.appendChild(card({
            ic: open ? (w === 1 ? '🏠' : W.ic) : '🔒', name: w === 1 ? 'Lobby' : 'World ' + w, desc: esc(w === 1 ? 'World 1 · ' + W.name : W.name),
            btn: open ? 'Go' : 'Escape World ' + (w - 1), btnCls: open ? 'g-green' : 'g-grey', disabled: !open,
            onClick: () => { closeModal(); if (w === 1) actions.teleportLobby(); else actions.goWorld(w); },
        }));
    });
    g.appendChild(card({ ic: '⚡', name: 'Train Zone', desc: 'Your best pad', btn: 'Go', onClick: () => { closeModal(); actions.goTrain(); } }));
    body.appendChild(g);
    WORLDS.forEach((W, k) => {
        const w = k + 1, f = firstStageOf(w);
        if (w > 1 && (S.maxStage || 0) <= f) return;
        sec(body, W.ic + ' ' + W.name + ': platforms you have reached');
        const r = el('div', 'grid');
        for (let i = f; i < f + STAGES_PER_WORLD; i++) {
            const ok = i < (S.maxStage || 0), s = STAGES[i];
            r.appendChild(card({ ic: ok ? s.ic : '🔒', name: 'Stage ' + (i + 1), desc: esc(s.name), btn: ok ? 'Go' : 'Not reached', btnCls: ok ? 'g-green' : 'g-grey', disabled: !ok, onClick: () => { closeModal(); actions.teleportTo(i); } }));
        }
        body.appendChild(r);
    });
    note(body, 'Teleporting starts a new run from that platform: its Wins pad pays when you cross to the next one. A run from a world\'s start pays its full escape: ' + WORLDS.map((W) => W.ic + ' ' + fmt(W.escape)).join(' · ') + ' Wins.');
}
// ----- Settings -----
function slider(body, ic, label, kind) {
    const r = el('div', 'row');
    r.innerHTML = `<span class="ic">${ic}</span><span class="tx" style="flex:0 0 9rem"><b class="o1">${label}</b></span>`;
    const s = el('input');
    s.type = 'range'; s.min = 0; s.max = 100; s.value = Math.round((getVolumes()[kind] ?? 1) * 100);
    s.setAttribute('aria-label', label);
    s.addEventListener('input', () => setVolume(kind, s.value / 100));
    r.appendChild(s);
    body.appendChild(r);
}
function renderConfig(body) {
    sec(body, 'Sound');
    slider(body, '🎵', 'Music', 'music');
    slider(body, '👣', 'Footsteps', 'asmr');
    slider(body, '🔔', 'Effects', 'sfx');
    sec(body, 'Graphics');
    const q = el('div', 'row');
    q.innerHTML = '<span class="ic">✨</span><span class="tx"><b class="o1">Quality</b><small class="o1">Low is smoothest on older PCs and phones</small></span>';
    for (const [k, n] of [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]) {
        const b = el('button', 'btn ' + (getQuality() === k ? 'g-green' : 'g-grey') + ' o1', n);
        b.addEventListener('click', () => { setQuality(k); renderModal(); });
        q.appendChild(b);
    }
    body.appendChild(q);
    sec(body, 'Controls');
    const a = el('div', 'row');
    a.innerHTML = '<span class="ic">🎯</span><span class="tx"><b class="o1">Aim assist</b><small class="o1">While you aren\'t steering, the tentacle drifts toward a good line</small></span>';
    for (const [v, n] of [[true, 'On'], [false, 'Off']]) {
        const b = el('button', 'btn ' + ((actions.getAssist && actions.getAssist()) === v ? 'g-green' : 'g-grey') + ' o1', n);
        b.addEventListener('click', () => { if (actions.setAssist) actions.setAssist(v); renderModal(); });
        a.appendChild(b);
    }
    body.appendChild(a);
    sec(body, 'Codes');
    const c = el('div', 'row');
    c.innerHTML = '<span class="ic">🎟️</span>';
    const inp = el('input', 'input'); inp.placeholder = 'Enter a code'; inp.maxLength = 24;
    const go = el('button', 'btn g-green o1', 'Redeem');
    go.addEventListener('click', () => { if (inp.value.trim()) net.send('code', { code: inp.value.trim() }); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') go.click(); e.stopPropagation(); });
    c.appendChild(inp); c.appendChild(go);
    body.appendChild(c);
    const stats = el('div', 'row');
    stats.innerHTML = `<span class="ic">📊</span><span class="tx"><b class="o1">Escapes ${fmt(S.escapes)} · Best ${S.best ? clock(S.best) : '—'} · Rebirths ${fmt(S.rebirths)}</b><small class="o1">Playtime ${playtimeText(S.playtime)} · Wins earned ${fmt(S.totalWins)} · Venom ever ${fmt(S.venomAll)} · Lava dips ${fmt(S.deaths)}</small></span>`;
    body.appendChild(stats);
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff5a7a'); }
// ----- Gifts (playtime) -----
function renderGifts(body) {
    note(body, 'Keep playing to unlock gifts! (' + Math.floor(sessionSecs() / 60) + ' min played this session)');
    const g = el('div', 'grid');
    const secs = sessionSecs();
    GIFTS.forEach((gift, i) => {
        const claimed = !!S.giftClaimed[i], ready = secs >= gift.min * 60;
        const left = Math.max(0, gift.min * 60 - secs);
        g.appendChild(card({
            ic: gift.boost || gift.venomBoost ? '⏱️' : '🎁', name: rewardText(gift), desc: gift.min + ' min',
            cls: claimed ? 'own' : ready ? 'hot' : '', btn: claimed ? 'Claimed' : ready ? 'CLAIM' : clock(left), btnCls: ready && !claimed ? 'g-green' : 'g-grey',
            disabled: claimed || !ready, onClick: () => net.send('gift', { k: i }),
        }));
    });
    body.appendChild(g);
}
// ----- Invite -----
function renderInvite(body) {
    note(body, 'Escape with friends! Friend Boost gives +' + Math.round(CFG.friendBoost * 100) + '% Venom and Wins for every Bloxity friend in your server (up to +' + Math.round(CFG.friendBoost * CFG.friendMax * 100) + '%).');
    const r = el('div', 'row');
    r.innerHTML = '<span class="ic">🔗</span><span class="tx"><b class="o1">Invite link</b><small class="o1">Send it to a friend</small></span>';
    const b = el('button', 'btn g-green o1', 'Copy');
    b.addEventListener('click', async () => {
        const link = BX.getInviteLink() || location.href;
        try { await navigator.clipboard.writeText(link); toast('Invite link copied!', '#7dff6b'); } catch (e) { toast(link, '#ffffff'); }
    });
    r.appendChild(b);
    body.appendChild(r);
    const list = el('div', 'grid');
    body.appendChild(list);
    if (BX.bloxity.ready && BX.identity().loggedIn) {
        BX.getFriends().then((fr) => {
            if (!fr.length) { list.appendChild(el('p', 'note o1', 'No Bloxity friends yet.')); return; }
            for (const f of fr.slice(0, 24)) {
                const nm = f.displayName || f.username || 'Friend';
                list.appendChild(card({ ic: '🙂', name: nm, btn: 'Invite', onClick: async () => { const ok = await BX.inviteFriend(f._id || f.id); toast(ok ? 'Invited ' + nm + '!' : 'Could not invite ' + nm, ok ? '#7dff6b' : '#ff5a7a'); } }));
            }
        });
    } else note(body, 'Log in to Bloxity to invite your friends directly.');
}

// =====================================================================================
// Daily rewards
// =====================================================================================
// The daily reward pops up once you've played a little (a brand-new player first gets to their first
// Win), never in the middle of a swing or over another popup
let dailyWait = false;
export function openDailyOnJoin() {
    if (openDailyOnJoin.done || dailyWait || !dailyStatus(S.daily, net.now()).can) return;
    dailyWait = true;
    const tryOpen = () => {
        const played = Date.now() - (S.joinedAt || Date.now());
        if ((S.totalWins > 0 || played > 75000) && !S.flying && !anyPopup()) { dailyWait = false; openDailyOnJoin.done = true; if (dailyStatus(S.daily, net.now()).can) openDaily(); return; }
        setTimeout(tryOpen, 1500);
    };
    setTimeout(tryOpen, 1500);
}
function openDaily() { renderDaily(); $('#daily').hidden = false; setMusicDuck(true); }
function renderDaily() {
    const st = dailyStatus(S.daily, net.now());
    const cards = $('#dailyCards');
    cards.innerHTML = '';
    DAILY.forEach((r, i) => {
        const done = i < st.day || (!st.can && i === st.day);
        const now = st.can && i === st.day;
        const d = el('div', 'dcard o1' + (done ? ' done' : '') + (now ? ' now' : ''));
        d.innerHTML = `<span class="d">Day ${i + 1}</span><span class="i">${r.sym ? `<img src="${symIcon(r.sym)}" alt="" style="width:1.9rem;height:1.9rem">` : r.boost || r.venomBoost ? '⏱️' : '🏆'}</span><span>${esc(rewardText(r))}</span>`;
        cards.appendChild(d);
    });
    $('#dailyClaim').disabled = !st.can;
    setText($('#dailyLeft'), st.can ? 'Your daily reward is ready!' : 'Come back tomorrow for Day ' + ((st.streak % 7) + 1) + '!');
}
$('#dailyClaim').addEventListener('click', () => { net.send('daily'); setTimeout(renderDaily, 300); });
$('#dailyClose').addEventListener('click', () => { $('#daily').hidden = true; setMusicDuck(false); });
export const refreshDaily = () => { if (!$('#daily').hidden) renderDaily(); };

// =====================================================================================
// HUD buttons
// =====================================================================================
$('#btnSyms').addEventListener('click', () => openModal('shop', 'syms'));
$('#btnTrain').addEventListener('click', () => actions.goTrain && actions.goTrain());
$('#btnRebirth').addEventListener('click', () => openModal('rebirth'));
$('#btnX2').addEventListener('click', () => (S.passes && S.passes.DoubleVenom ? toast('🧪 x2 Venom is on forever!', '#c8ff7a') : buy('pass', 'DoubleVenom')));
$('#btnShop').addEventListener('click', () => openModal('shop'));
$('#btnConfig').addEventListener('click', () => openModal('config'));
$('#btnInvite').addEventListener('click', () => openModal('invite'));
$('#btnGift').addEventListener('click', () => openModal('gifts'));
$('#btnTeleport').addEventListener('click', () => openModal('teleport'));
$('#btnDaily').addEventListener('click', openDaily);
$('#winsPlus').addEventListener('click', () => openModal('shop', 'boosts'));
actions.openRebirth = () => openModal('rebirth');
actions.openShop = () => openModal('shop');
actions.buy = buy;

// Closes the topmost popup (Escape / controller B); false when nothing was open
export function closeTop() {
    if (!$('#confirm').hidden) { closeConfirm(); return true; }
    if (!$('#daily').hidden) { $('#dailyClose').click(); return true; }
    if (!$('#offlineCard').hidden) { $('#offClaim').click(); return true; }
    if (modalOpen()) { closeModal(); return true; }
    return false;
}
export const anyPopup = () => ['#confirm', '#daily', '#modal', '#offlineCard'].some((id) => !$(id).hidden);
