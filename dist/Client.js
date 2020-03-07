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
class RedisClient extends Eris.Client {
    constructor(token, options) {
        if (!options)
            throw new Error('No options provided');
        if (!options.shardsPerCluster)
            throw new Error('No function to get the first shard id provided.');
        super(token, options.erisOptions || {});
        this.options.autoreconnect = false; // yes
        this.redisPort = options.redisPort;
        this.redisHost = options.redisHost;
        this.redisPassword = options.redisPassword;
        this.getFirstShard = options.getFirstShard;
        this.shardsPerCluster = options.shardsPerCluster || 5;
        this.lockKey = options.lockKey || 'redis-lock-aquire-key';
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
        });
    }
    ;
    setupListeners() {
        this.on('ready', () => {
            this.redisLock.release(`shard:identify:${this.lockKey}`);
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
                console.log('bot is online');
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
                this.redisLock.acquire(`shard:identify:${this.lockKey}`).then((err) => {
                    if (err)
                        return;
                    this.hasLock = true;
                    resolve(true);
                }).catch(() => {
                    resolve(false);
                });
            });
        });
    }
}
exports.RedisClient = RedisClient;
;
