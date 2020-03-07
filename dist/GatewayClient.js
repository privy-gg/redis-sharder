"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const Eris = __importStar(require("eris"));
const ioredis_1 = __importDefault(require("ioredis"));
const RedisLock = require('ioredis-lock');
;
;
;
;
;
;
;
// the good stuff
class GatewayClient extends Eris.Client {
    // private pubSub: PubSub | undefined;
    constructor(token, options) {
        super(token, options.erisOptions || {});
        this.stats = {
            enabled: true,
            interval: 5000,
        };
        if (!options)
            throw new Error('No options provided');
        if (!options.shardsPerCluster)
            throw new Error('No function to get the first shard id provided.');
        this.options.autoreconnect = false; // yes
        this.redisPort = options.redisPort;
        this.redisHost = options.redisHost;
        this.redisPassword = options.redisPassword;
        this.getFirstShard = options.getFirstShard;
        this.shardsPerCluster = options.shardsPerCluster || 5;
        this.lockKey = options.lockKey || 'redis-sharder';
        this.hasLock = false;
        this.fullyStarted = false;
        this.initialize();
        this.setupListeners();
    }
    ;
    initialize() {
        return __awaiter(this, void 0, void 0, function* () {
            this.redisConnection = new ioredis_1.default(this.redisPort, this.redisHost, {
                password: this.redisPassword,
            });
            this.redisLock = RedisLock.createLock(this.redisConnection, {
                timeout: this.shardsPerCluster * 7500,
                retries: Number.MAX_SAFE_INTEGER,
                delay: 100,
            });
            if (this.stats.enabled) {
                setInterval(() => __awaiter(this, void 0, void 0, function* () {
                    var _a;
                    (_a = this.redisConnection) === null || _a === void 0 ? void 0 : _a.set(`${this.lockKey}:cluster:stats:${yield this.getFirstShard()}`, JSON.stringify({
                        guilds: this.guilds.size,
                        users: this.users.size,
                        voice: this.voiceConnections.size,
                        shards: this.shards.map((s) => {
                            return {
                                status: s.status,
                                id: s.id,
                            };
                        }),
                    }), 'EX', 100);
                    // console.log(await this.redisConnection?.get(`${this.lockKey}:cluster:stats:${await this.getFirstShard()}`))
                }), this.stats.interval);
            }
            // this.pubSub = new PubSub({}, this.redisConnection, this);
        });
    }
    ;
    setupListeners() {
        this.on('ready', () => {
            this.redisLock.release(`${this.lockKey}:shard:identify`);
            this.hasLock = false;
            this.fullyStarted = true;
        });
        this.on('shardDisconnect', (error, id) => {
            var _a;
            console.debug(`shard ${id} disconnected`);
            if (this.hasLock === false) {
                if (this.aquire()) {
                    (_a = this.shards.get(id)) === null || _a === void 0 ? void 0 : _a.connect();
                }
                else {
                    // do something but idk what
                }
                ;
            }
            ;
        });
        this.on('shardReady', (id) => {
            if (this.shards.filter((s) => s.status === 'ready').length === this.shards.size) {
                // Lock.release(`shard:identify:${CLIENT_ID}`);
                this.hasLock = false;
            }
            else if (this.shards.find((s) => s.status === 'disconnected') && this.fullyStarted === true) {
                const shard = this.shards.find((s) => s.status === 'disconnected');
                if (shard)
                    shard.connect();
            }
            ;
        });
    }
    ;
    calculateThisShards() {
        return __awaiter(this, void 0, void 0, function* () {
            const firstShardID = yield this.getFirstShard();
            return [this.shardsPerCluster * firstShardID, this.shardsPerCluster * firstShardID + (this.shardsPerCluster - 1)];
        });
    }
    ;
    queue() {
        return __awaiter(this, void 0, void 0, function* () {
            const shards = yield this.calculateThisShards();
            this.options.firstShardID = shards[0];
            this.options.lastShardID = shards[1];
            if (yield this.aquire()) {
                this.connect();
            }
            else
                setTimeout(() => {
                    this.queue();
                }, 5000);
        });
    }
    ;
    aquire() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => {
                this.redisLock.acquire(`${this.lockKey}:shard:identify`).then((err) => {
                    if (err)
                        return;
                    this.hasLock = true;
                    this.emit('acquiredLock');
                    resolve(true);
                }).catch(() => {
                    resolve(false);
                });
            });
        });
    }
    ;
    getStats() {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
                var _a, _b, _c;
                const stream = (_a = this.redisConnection) === null || _a === void 0 ? void 0 : _a.scanStream({ match: `${this.lockKey}:cluster:stats:*`, });
                const data = {
                    guilds: 0,
                    users: 0,
                    voice: 0,
                    shards: [],
                };
                let keys = [];
                (_b = stream) === null || _b === void 0 ? void 0 : _b.on('data', (chunk) => __awaiter(this, void 0, void 0, function* () {
                    stream.pause();
                    keys.concat(chunk);
                    const thing = chunk.map((key) => __awaiter(this, void 0, void 0, function* () {
                        var _d;
                        let stringStats = yield ((_d = this.redisConnection) === null || _d === void 0 ? void 0 : _d.get(key));
                        if (stringStats) {
                            let clusterStats = JSON.parse(stringStats);
                            data.guilds = data.guilds + clusterStats.users;
                            data.users = data.users + clusterStats.users;
                            data.voice = data.voice + clusterStats.voice;
                            clusterStats.shards.forEach((shard) => {
                                // @ts-ignore
                                data.shards.push(shard);
                            });
                            return stringStats;
                        }
                        else
                            return null;
                    }));
                    yield Promise.all(thing);
                    stream.resume();
                }));
                (_c = stream) === null || _c === void 0 ? void 0 : _c.once('end', () => __awaiter(this, void 0, void 0, function* () {
                    return resolve(data);
                }));
            }));
        });
    }
}
exports.GatewayClient = GatewayClient;
;
