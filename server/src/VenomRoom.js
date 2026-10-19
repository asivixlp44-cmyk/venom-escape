import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import {
    CFG, STAGES, WORLDS, escapeWins, firstStageOf, symAvailable, SYMBIOTES, symById, TRAIN_PADS, PASSES, PRODUCTS, priceOf, GIFTS, DAILY, CODES, KITS, SKINS,
    dailyStatus, dayKey, rewardText, winsMult, venomRate, levelOf, rebirthLevel, padUnlocked, clamp,
} from '../../shared/config.js';
import { PLATFORMS, ESCAPES, HUBS, ORBS, LOBBY, SPAWN, WORLD, REBIRTH, trainPadAt, runStartOf } from '../../shared/course.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', BLUE = '#6fe0ff', PURPLE = '#d68aff';

function cleanName(name) {
    return String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
}
const randomName = () => 'Player' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
// A run: where you are on the course (the last platform reached, -1 = the lobby) and the platforms
// you got to by crossing the lava this run (their Wins pads pay once each)
// fromStart: it began at the start of a world (the lobby or a hub), so its escape pays in full
const newRun = (at, fromStart) => ({ at: at ?? -1, crossed: new Set(), claimed: new Set(), orbs: new Set(), start: Date.now(), fromStart: fromStart ?? (at ?? -1) < 0 });
const orbByKey = new Map(ORBS.map((o) => [o.key, o]));

export const liveRooms = new Set();

// One shared canyon. Movement and the tentacle are client-side; everything that changes progress
// (Venom every second, Wins pads, checkpoints, the escape, rebirths, symbiotes, passes) is decided
// here. There are no real-money purchases: every price is in Wins, checked and taken here.
export class VenomRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(50);
        this.sessions = new Map();
        this.joinCount = 0;

        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('move', this.onMove);
        on('cp', this.onCheckpoint);
        on('pad', this.onPad);
        on('escape', this.onEscape);
        on('lobby', this.onLobby);
        on('tp', this.onTeleport);
        on('died', this.onDied);
        on('client', this.onClientInfo);
        on('launch', this.onLaunch);
        on('world', this.onWorld);
        on('orb', this.onOrb);
        on('sym', this.onSymbiote);
        on('wear', this.onWear);
        on('unlockPad', this.onUnlockPad);
        on('rebirth', this.onRebirth);
        on('buy', this.onBuy);
        on('offline', this.onOffline);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        on('friends', this.onFriends);

        this.setSimulationInterval(() => this.tick(), 1000);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // A fresh server on a temporary disk restores the browser's signed backup.
        // With a database the profile is never lost, so backups are not accepted at all.
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        // every visit starts in the lobby (reached platforms stay in the Teleport menu)
        profile.stage = -1;
        const player = new PlayerState();
        player.name = profile.name;
        player.av = cleanAvatar(options.av);
        player.x = SPAWN.x; player.y = SPAWN.y; player.z = SPAWN.z; player.ry = 0;
        player.kit = this.joinCount % KITS.length;
        player.skin = (this.joinCount * 3) % SKINS.length;
        this.joinCount++;
        this.state.players.set(client.sessionId, player);
        const s = {
            client, profile, player,
            pos: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
            run: newRun(-1), padAt: {}, onPad: -1, rate: 0, streak: 0, lastOrb: 0,
            joinedAt: Date.now(), giftClaimed: {}, friends: 0, guest, lastChat: 0, playSecs: 0, offline: 0,
            stats: { fresh: Date.now() - (profile.firstPlay || 0) < 60000, maxStage: -1, escapes: 0, deaths: 0, launches: 0, wins0: profile.totalWins, buys: 0, rebirths: 0, dBy: {}, touch: false, q: '', fps: 0, gifts: 0 },
        };
        this.sessions.set(client.sessionId, s);
        // Offline earnings: a share of your Venom per second for the time you were away
        const away = (Date.now() - (profile.lastSeen || Date.now())) / 1000;
        if (away > 120 && (profile.venomAll || 0) > 0) {
            const secs = Math.min(away, CFG.offlineHours * 3600);
            s.offline = Math.floor(venomRate(profile, -1, Date.now(), 0) * CFG.offlineShare * secs);
        }
        profile.lastSeen = Date.now();
        this.syncPublic(client.sessionId);
        client.send('hello', { now: Date.now(), bloxity: uid.startsWith('legion_') });
        this.sendProfile(client.sessionId);
        this.sendVenom(s);
        if (s.offline > 0) client.send('offlineOffer', { venom: s.offline, secs: Math.round(Math.min(away, CFG.offlineHours * 3600)) });
        this.broadcastBoards(client);
    }

    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['wins', 'totalWins', 'venom', 'venomAll', 'rebirths', 'escapes', 'boostUntil', 'venomBoostUntil', 'deaths']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        for (const k of ['syms', 'pads', 'passes', 'codes']) if (!p[k] || typeof p[k] !== 'object') p[k] = {};
        for (const k of Object.keys(p.syms)) if (!symById[k]) delete p.syms[k];
        if (typeof p.wear !== 'string' || (p.wear && !p.syms[p.wear])) p.wear = '';
        p.stage = clamp(Math.floor(finite(p.stage) ? p.stage : -1), -WORLDS.length, PLATFORMS.length - 1);
        p.world = clamp(Math.floor(finite(p.world) ? p.world : 1), 1, WORLDS.length);
        p.maxStage = clamp(Math.floor(finite(p.maxStage) ? p.maxStage : 0), 0, PLATFORMS.length);
    }

    onDrop(client) {
        this.allowReconnection(client, 30);
    }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(client.sessionId);
        this.sendVenom(s);
        this.broadcastBoards(client);
    }

    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        markDirty();
        if (!s) return;
        s.profile.lastSeen = Date.now();
        const st = s.stats;
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, maxStage: st.maxStage,
            level: levelOf(s.profile.venom), world: s.profile.world || 1, escapes: st.escapes, deaths: st.deaths, launches: st.launches,
            wins: (s.profile.totalWins || 0) - (st.wins0 || 0), buys: st.buys, rebirths: st.rebirths,
            dBy: st.dBy, touch: st.touch, q: st.q, fps: st.fps, gifts: st.gifts,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(s.profile.uid)) releaseProfile(s.profile.uid, isOnline);
    }

    onDispose() { liveRooms.delete(this); for (const s of this.sessions.values()) s.profile.lastSeen = Date.now(); markDirty(); return saveProfiles(); }

    // ----- helpers -----
    syncPublic(id) {
        const s = this.sessions.get(id);
        if (!s) return;
        const p = s.profile, pl = s.player;
        pl.wins = p.wins;
        pl.level = Math.min(65535, levelOf(p.venom));
        pl.rebirths = Math.min(65535, p.rebirths || 0);
        pl.sym = p.wear || '';
        pl.name = p.name;
    }
    sendProfile(id) {
        const s = this.sessions.get(id);
        if (!s) return;
        const p = s.profile;
        s.client.send('profile', {
            wins: p.wins, totalWins: p.totalWins, venom: p.venom, venomAll: p.venomAll, rebirths: p.rebirths, escapes: p.escapes, best: p.best || 0,
            deaths: p.deaths, playtime: p.playtime, stage: p.stage, maxStage: p.maxStage, world: p.world || 1, streak: s.streak, syms: p.syms, wear: p.wear, pads: p.pads, passes: p.passes,
            boostUntil: p.boostUntil, venomBoostUntil: p.venomBoostUntil, daily: p.daily, codes: p.codes, firstPlay: p.firstPlay,
            giftClaimed: s.giftClaimed, sessionSecs: s.playSecs, runAt: s.run.at,
            save: sealProfile(p),
        });
    }
    // The Venom counter: the total and how fast it grows (the client counts up in between)
    sendVenom(s) {
        s.client.send('v', { v: s.profile.venom, r: s.rate, pad: s.onPad, all: s.profile.venomAll });
    }
    changed(id) { this.syncPublic(id); this.sendProfile(id); saveSoon(); }
    toast(s, text, color) { s.client.send('toast', { text, color: color || '#ffffff' }); }
    addWins(s, base, why, extra) {
        const n = Math.max(1, Math.round(base * winsMult(s.profile, Date.now(), s.friends)));
        s.profile.wins = (s.profile.wins || 0) + n;
        s.profile.totalWins = (s.profile.totalWins || 0) + n;
        s.client.send('earn', { n, why, ...(extra || {}) });
        return n;
    }

    // Every second: Venom grows (times the Train Zone pad you stand on), playtime
    tick() {
        const now = Date.now();
        for (const s of this.sessions.values()) {
            const p = s.profile;
            p.playtime = (p.playtime || 0) + 1;
            s.playSecs++;
            const pad = trainPadAt(s.pos.x, s.pos.y, s.pos.z);
            s.onPad = pad >= 0 && padUnlocked(p, pad) ? pad : (pad >= 0 ? -2 - pad : -1);
            s.rate = venomRate(p, pad, now, s.friends);
            const before = levelOf(p.venom);
            p.venom += s.rate;
            p.venomAll = (p.venomAll || 0) + s.rate;
            const after = levelOf(p.venom);
            if (after > before) {
                s.player.level = Math.min(65535, after);
                s.client.send('levelUp', { level: after });
            }
            this.sendVenom(s);
        }
        markDirty();
    }

    // ----- movement & the course -----
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const pl = s.player;
        pl.x = clamp(m.x, WORLD.x0, WORLD.x1); pl.y = clamp(m.y, WORLD.y0, WORLD.y1); pl.z = clamp(m.z, WORLD.z0, WORLD.z1);
        pl.ry = finite(m.ry) ? m.ry : 0;
        pl.anim = clamp(m.a | 0, 0, 4);
        const tent = clamp(m.t | 0, 0, 2);
        pl.tent = tent;
        if (tent && finite(m.hx) && finite(m.hy) && finite(m.hz)) {
            pl.hx = clamp(m.hx, WORLD.x0, WORLD.x1); pl.hy = clamp(m.hy, WORLD.y0, WORLD.y1); pl.hz = clamp(m.hz, WORLD.z0, WORLD.z1);
        }
        s.pos = { x: pl.x, y: pl.y, z: pl.z };
    }
    near(s, x, y, z, r, dy) { return dist2(s.pos, { x, z }) <= r * r && Math.abs(s.pos.y - y) <= dy; }

    // Standing on platform i: it's your checkpoint now (and a crossing if you came from the one before)
    onCheckpoint(client, m) {
        const s = this.sessions.get(client.sessionId);
        const i = m.i | 0, pl = PLATFORMS[i];
        if (!s || !pl || !this.near(s, pl.x, pl.top, (pl.zs + pl.ze) / 2, Math.max(pl.w, pl.d), 9)) return;
        const p = s.profile;
        // a world you haven't unlocked yet doesn't count
        if (pl.world > (p.world || 1)) return;
        const first = i >= (p.maxStage || 0);
        if (i === s.run.at + 1 && !s.run.crossed.has(i)) { s.run.crossed.add(i); s.streak++; }
        s.run.at = i;
        p.stage = i;
        p.maxStage = Math.max(p.maxStage || 0, i + 1);
        s.stats.maxStage = Math.max(s.stats.maxStage, i);
        if (first) this.broadcast('announce', { text: '🕷️ ' + p.name + ' reached Stage ' + (i + 1) + '!', color: PURPLE }, { except: client });
        client.send('cpOk', { i, first, crossed: s.run.crossed.has(i) });
        this.changed(client.sessionId);
    }
    // A Wins pad (or the bonus pad on its pillar): pays once per run, after crossing to that platform
    onPad(client, m) {
        const s = this.sessions.get(client.sessionId);
        const i = m.i | 0, pl = PLATFORMS[i], bonus = !!m.b;
        if (!s || !pl) return;
        const pad = bonus ? pl.bonus : pl.pad;
        if (!this.near(s, pad.x, pad.y, pad.z, pad.s, 6)) return;
        const key = i + (bonus ? 'b' : '');
        if (s.run.claimed.has(key)) return;
        if (!s.run.crossed.has(i)) {
            client.send('padNo', { i, b: bonus, why: 'cross' });
            return;
        }
        const now = Date.now();
        if (now - (s.padAt[key] || 0) < CFG.padCooldown * 1000) { client.send('padNo', { i, b: bonus, why: 'wait', left: Math.ceil((CFG.padCooldown * 1000 - (now - s.padAt[key])) / 1000) }); return; }
        s.padAt[key] = now;
        s.run.claimed.add(key);
        const streak = Math.min(CFG.streakMax, Math.max(0, s.streak - 1) * CFG.streakStep);
        this.addWins(s, STAGES[i].wins * (bonus ? 2 : 1) * (1 + streak), bonus ? 'bonus' : 'pad', { i, streak });
        this.changed(client.sessionId);
    }
    // The escape portal after a world's last stage: pays, and unlocks the next world
    onEscape(client, m) {
        const s = this.sessions.get(client.sessionId);
        const w = clamp(m.w | 0 || 1, 1, WORLDS.length), E = ESCAPES[w - 1];
        if (!s || !E || !this.near(s, E.x, E.y, E.z, E.r + 4, 8)) return;
        const last = firstStageOf(w) + 14;
        const secs = (Date.now() - s.run.start) / 1000;
        if (!s.run.crossed.has(last) || secs < CFG.minEscapeSecs) {
            this.toast(s, 'Cross the lava to the last platform to escape!', BLUE);
            return;
        }
        const p = s.profile;
        p.escapes = (p.escapes || 0) + 1;
        s.stats.escapes++;
        const fromStart = s.run.fromStart;
        if (w === 1 && fromStart && (!p.best || secs < p.best)) p.best = Math.round(secs);
        // a run that started part way along pays less
        const n = this.addWins(s, escapeWins(w) * (fromStart ? 1 : 0.4), 'escape');
        const unlocked = w < WORLDS.length && (p.world || 1) <= w ? w + 1 : 0;
        if (unlocked) p.world = unlocked;
        client.send('escaped', { w, escapes: p.escapes, secs: Math.round(secs), wins: n, best: p.best || 0, unlocked });
        this.broadcast('announce', { text: '👑 ' + p.name + ' ESCAPED ' + WORLDS[w - 1].name + '!' + (unlocked ? ' World ' + unlocked + ' unlocked!' : ''), color: GOLD }, { except: client });
        s.run = newRun(-1);
        s.streak = 0;
        p.stage = -1;
        this.changed(client.sessionId);
    }
    onLobby(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.run = newRun(-1);
        s.streak = 0;
        s.profile.stage = -1;
        s.pos = { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z };
    }
    // Through a world portal: to that world's hub (World 1: the lobby); a new run starts there
    onWorld(client, m) {
        const s = this.sessions.get(client.sessionId);
        const w = m.w | 0;
        if (!s || w < 1 || w > WORLDS.length) return;
        if (w > (s.profile.world || 1)) return this.toast(s, 'Escape World ' + (w - 1) + ' to unlock World ' + w + '!', BLUE);
        s.streak = 0;
        if (w === 1) { this.onLobby(client); client.send('worldTo', { w }); this.changed(client.sessionId); return; }
        const h = HUBS[w - 1];
        s.run = newRun(firstStageOf(w) - 1, true);
        s.profile.stage = -w;
        s.pos = { x: h.spawn.x, y: h.spawn.y, z: h.spawn.z };
        client.send('worldTo', { w });
        this.changed(client.sessionId);
    }
    // A venom orb the tentacle's head flew through: a few seconds' worth of Venom (once per run)
    onOrb(client, m) {
        const s = this.sessions.get(client.sessionId);
        const o = orbByKey.get(m.k | 0), now = Date.now();
        if (!s || !o || s.run.orbs.has(o.key) || now - s.lastOrb < 60) return;
        if (o.i !== s.run.at + 1 && o.i !== s.run.at) return;
        s.lastOrb = now;
        s.run.orbs.add(o.key);
        const n = Math.max(1, Math.round(venomRate(s.profile, -1, now, s.friends) * CFG.orbSecs));
        s.profile.venom += n;
        s.profile.venomAll = (s.profile.venomAll || 0) + n;
        client.send('orbOk', { k: o.key, n });
        this.sendVenom(s);
    }
    // Teleport to a platform you've reached (free); a new run starts there
    onTeleport(client, m) {
        const s = this.sessions.get(client.sessionId);
        const i = m.i | 0, pl = PLATFORMS[i];
        if (!s || !pl || i >= (s.profile.maxStage || 0)) return;
        s.run = newRun(i);
        s.streak = 0;
        s.profile.stage = i;
        s.pos = { x: pl.spawn.x, y: pl.spawn.y, z: pl.spawn.z };
        client.send('tpTo', { i });
        this.changed(client.sessionId);
    }
    onDied(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.stats.deaths++;
        // what sent them in: a tentacle too short, a missed landing, a hazard, walking off an edge
        const why = ['short', 'missed', 'hazard', 'walk', 'other'].includes(m && m.why) ? m.why : 'other';
        s.stats.dBy[why] = (s.stats.dBy[why] || 0) + 1;
        s.profile.deaths = (s.profile.deaths || 0) + 1;
        // back at the checkpoint: the run carries on from there (the streak doesn't)
        s.run.at = runStartOf(s.profile.stage);
        s.streak = 0;
    }
    // The player's device: touch screen, graphics quality, frame rate (for the play stats)
    onClientInfo(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m) return;
        s.stats.touch = !!m.touch;
        s.stats.q = String(m.q || '').slice(0, 8);
        if (finite(m.fps)) s.stats.fps = clamp(Math.round(m.fps), 0, 240);
    }
    onLaunch(client) { const s = this.sessions.get(client.sessionId); if (s) s.stats.launches++; }

    // ----- the Win Shop: symbiotes -----
    onSymbiote(client, m) {
        const s = this.sessions.get(client.sessionId);
        const d = symById[String(m.id || '')];
        if (!s || !d) return;
        const p = s.profile;
        if (p.syms[d.id]) { this.wear(s, client, d.id); return; }
        if (!symAvailable(p, d)) return this.toast(s, 'Reach World ' + d.world + ' to buy ' + d.name + '!', BLUE);
        if ((p.wins || 0) < d.price) return client.send('broke', { need: d.price - (p.wins || 0), price: d.price, name: d.name });
        p.wins -= d.price;
        p.syms[d.id] = true;
        p.wear = d.id;
        s.stats.buys++;
        this.toast(s, '🕷️ ' + d.name + ' unlocked! +' + d.venom + ' Venom/sec', GREEN);
        client.send('fx', { kind: 'sym', key: d.id });
        this.changed(client.sessionId);
    }
    wear(s, client, id) {
        if (id && !s.profile.syms[id]) return;
        s.profile.wear = id || '';
        this.changed(client.sessionId);
    }
    onWear(client, m) { const s = this.sessions.get(client.sessionId); if (s) this.wear(s, client, String(m.id || '')); }
    // The Train Zone pads that cost Wins
    onUnlockPad(client, m) {
        const s = this.sessions.get(client.sessionId);
        const i = m.i | 0, d = TRAIN_PADS[i];
        if (!s || !d || !d.wins) return;
        const p = s.profile;
        if (p.pads[i]) return;
        if ((d.world || 1) > (p.world || 1)) return this.toast(s, 'Reach World ' + d.world + ' first!', BLUE);
        if ((p.wins || 0) < d.wins) return client.send('broke', { need: d.wins - (p.wins || 0), price: d.wins, name: d.mult + 'x Venom pad' });
        p.wins -= d.wins;
        p.pads[i] = true;
        s.stats.buys++;
        this.toast(s, '⚡ ' + d.mult + 'x Venom pad unlocked!', GREEN);
        client.send('fx', { kind: 'pad', key: i });
        this.changed(client.sessionId);
    }
    // Rebirth: Venom (and so your level) back to zero, a bigger multiplier forever
    onRebirth(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, L = levelOf(p.venom), need = rebirthLevel(p.rebirths);
        if (L < need) return this.toast(s, 'Reach level ' + need + ' to rebirth!', BLUE);
        p.rebirths = (p.rebirths || 0) + 1;
        p.venom = 0;
        p.stage = -1;
        s.run = newRun(-1);
        s.streak = 0;
        s.stats.rebirths++;
        client.send('reborn', { rebirths: p.rebirths });
        this.broadcast('announce', { text: '♻️ ' + p.name + ' rebirthed! (x' + (p.rebirths + 1) + ')', color: PURPLE }, { except: client });
        this.changed(client.sessionId);
        this.sendVenom(s);
    }
    // ----- passes and boosts (Wins) -----
    onBuy(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || (m.kind !== 'pass' && m.kind !== 'product')) return;
        const p = s.profile, key = String(m.key || '');
        const item = (m.kind === 'pass' ? PASSES : PRODUCTS)[key];
        if (!item) return;
        if (m.kind === 'pass' && p.passes[key]) return this.toast(s, item.name + ' already owned!', BLUE);
        const price = priceOf(m.kind, key);
        if ((p.wins || 0) < price) return client.send('broke', { need: price - (p.wins || 0), price, name: item.name });
        p.wins -= price;
        s.stats.buys++;
        if (m.kind === 'pass') {
            p.passes[key] = true;
            this.toast(s, item.ic + ' ' + item.name + ' unlocked!', GREEN);
        } else if (key === 'VenomBoost') {
            p.venomBoostUntil = Math.max(Date.now(), p.venomBoostUntil || 0) + CFG.boostMinutes * 60000;
            this.toast(s, '⏱️ x2 Venom for ' + CFG.boostMinutes + ' minutes!', GOLD);
        } else if (key === 'WinsBoost') {
            p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + CFG.boostMinutes * 60000;
            this.toast(s, '⏱️ x2 Wins for ' + CFG.boostMinutes + ' minutes!', GOLD);
        }
        client.send('fx', { kind: 'confetti', key });
        this.changed(client.sessionId);
    }
    onOffline(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !(s.offline > 0)) return;
        const n = s.offline;
        s.offline = 0;
        s.profile.venom += n;
        s.profile.venomAll = (s.profile.venomAll || 0) + n;
        client.send('earnVenom', { n, why: 'offline' });
        this.changed(client.sessionId);
        this.sendVenom(s);
    }

    // ----- rewards -----
    giveReward(s, r) {
        const p = s.profile;
        if (r.wins) { p.wins += r.wins; p.totalWins += r.wins; }
        if (r.boost) p.boostUntil = Math.max(Date.now(), p.boostUntil || 0) + CFG.boostMinutes * 60000;
        if (r.venomBoost) p.venomBoostUntil = Math.max(Date.now(), p.venomBoostUntil || 0) + CFG.boostMinutes * 60000;
        if (r.sym && symById[r.sym]) {
            if (!p.syms[r.sym]) p.syms[r.sym] = true;
            else { p.wins += 50; p.totalWins += 50; }
        }
    }
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now();
        const st = dailyStatus(p.daily, now);
        if (!st.can) return this.toast(s, 'Come back tomorrow for more!', BLUE);
        const r = DAILY[st.day];
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, r);
        this.toast(s, 'Day ' + p.daily.streak + ' reward: ' + rewardText(r) + '!', GREEN);
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId);
        const k = m.k | 0, g = GIFTS[k];
        if (!s || !g || s.giftClaimed[k]) return;
        if (s.playSecs < g.min * 60 - 2) return this.toast(s, 'Keep playing to unlock this gift!', BLUE);
        s.giftClaimed[k] = true;
        s.stats.gifts++;
        this.giveReward(s, g);
        this.toast(s, '🎁 ' + rewardText(g) + '!', GREEN);
        client.send('fx', { kind: 'confetti' });
        this.changed(client.sessionId);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 24);
        const r = CODES[code];
        const p = s.profile;
        if (!r) return client.send('codeResult', { ok: false, text: 'Invalid code' });
        if (p.codes[code]) return client.send('codeResult', { ok: false, text: 'Code already used' });
        p.codes[code] = true;
        this.giveReward(s, r);
        client.send('codeResult', { ok: true, text: rewardText(r) + '!' });
        this.changed(client.sessionId);
    }

    broadcastBoards(client) {
        const row = (key) => topProfiles(key).filter((p) => (p[key] || 0) > 0).map((p) => ({ n: p.name, v: Math.floor(p[key] || 0) }));
        const m = { totalWins: row('totalWins'), venomAll: row('venomAll'), rebirths: row('rebirths') };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        this.changed(client.sessionId);
        this.sendVenom(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (s && m) s.player.av = cleanAvatar(m.av);
    }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
    onFriends(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || !Array.isArray(m.names)) return;
        const here = new Set([...this.sessions.values()].filter((o) => o !== s).map((o) => o.profile.name));
        const n = new Set(m.names.slice(0, 50).map(String).filter((x) => here.has(x))).size;
        const friends = Math.min(CFG.friendMax, n);
        if (friends === s.friends) return;
        s.friends = friends;
        s.player.friends = friends;
    }
}

function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
void LOBBY; void REBIRTH; void SYMBIOTES; void STAGES;
