import { schema, t } from '@colyseus/schema';

// Public, synced to every client. Private progress (Venom, symbiotes, passes...) is sent only to
// its owner with the "profile" and "v" messages.
export const PlayerState = schema({
    name: t.string().default(''),
    x: t.float32().default(0),
    y: t.float32().default(0),
    z: t.float32().default(0),
    ry: t.angle(),
    anim: t.uint8().default(0),     // 0 idle, 1 run, 2 air, 3 casting the tentacle, 4 zipping
    level: t.uint16().default(1),
    rebirths: t.uint16().default(0),
    wins: t.number().default(0),
    sym: t.string().default(''),    // the symbiote suit being worn
    tent: t.uint8().default(0),     // the tentacle: 0 none, 1 growing, 2 zipping along it
    hx: t.float32().default(0),     // its head
    hy: t.float32().default(0),
    hz: t.float32().default(0),
    friends: t.uint8().default(0),  // Friend Boost: Bloxity friends in this server
    kit: t.uint8().default(0),
    skin: t.uint8().default(0),
    av: t.string().default(''),     // packed Bloxity avatar (equipped ids + proportions)
}, 'PlayerState');

export const GameState = schema({
    players: t.map(PlayerState),
}, 'GameState');
