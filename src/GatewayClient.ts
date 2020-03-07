import * as Eris from 'eris';
import Redis from 'ioredis';
import { colors } from './constants';
const RedisLock = require('ioredis-lock');

export interface Stats {
    guilds: number,
    users: number,
    voice: number,
    shards: ShardStats[],
    memoryUsage: MemoryUsage,
    clusters: ClusterStats[],
};

export enum ShardStatus {
    READY,
    HANDSHAKING,
    DISCONNECTED,
    CONNECTING,
};

export interface MemoryUsage {
    rss: number,
    heapUsed: number,
};

export interface ShardStats {
    status: ShardStatus,
    id: number,
    latency: number,
    guilds: number,
};

export interface RawClusterStats {
    id: number,
    guilds: number,
    users: number,
    voice: number,
    shards: ShardStats[],
    memoryUsage: MemoryUsage,
};

export interface ClusterStats {
    id: number,
    shards: number[],
    guilds: number,
    users: number,
    voice: number,
    memoryUsage: MemoryUsage,
};

export interface StatsOptions {
    enabled: boolean,
    interval: number,
};

export interface WebhookOptions {
    discord?: {
        id?: string,
        token?: string,
    },
    http?: {
        url?: string,
        authorization?: string,
    },
};

export interface GatewayClientOptions {
    redisPort?: number,
    redisPassword?: string,
    redisHost?: string,
    shardsPerCluster?: number,
    stats?: StatsOptions,
    lockKey?: string,
    getFirstShard(): Promise<number>,
    erisOptions: Eris.ClientOptions,
    webhooks?: WebhookOptions,
};

interface GatewayClientEvents<T> extends Eris.ClientEvents<T> {
	/**
	 * @event
	 * Fired when the client has acquired the lock to begin connecting. (Initial connect and when a shard disconnects)
	 */
	(event: 'acquiredLock', listener: () => void): T;
};

export declare interface GatewayClient extends Eris.Client {
    on: GatewayClientEvents<this>;
};

// the good stuff

export class GatewayClient extends Eris.Client {

    redisPort: number | undefined;
    redisHost: string | undefined;
    redisPassword: string | undefined;
    shardsPerCluster: number;
    lockKey: string;
    stats: StatsOptions = {
        enabled: true,
        interval: 5000,
    }
    webhooks: WebhookOptions = {};

    getFirstShard: () => Promise<number> | number;

    private redisConnection: Redis.Redis | undefined;
    private redisLock: any;
    private hasLock: boolean;
    private fullyStarted: boolean;
    // private pubSub: PubSub | undefined;


    constructor(token: string, options: GatewayClientOptions) {
        super(token, options.erisOptions || {});

        if (!options) throw new Error('No options provided');
        if (!options.shardsPerCluster) throw new Error('No function to get the first shard id provided.');

        this.options.autoreconnect = false; // yes

        this.redisPort = options.redisPort;
        this.redisHost = options.redisHost;
        this.redisPassword = options.redisPassword;
        this.getFirstShard = options.getFirstShard;
        this.shardsPerCluster = options.shardsPerCluster || 5;
        this.lockKey = options.lockKey || 'redis-sharder';

        this.webhooks = options.webhooks || {};

        this.hasLock = false;
        this.fullyStarted = false;

        this.initialize();
        this.setupListeners();
    };

    private async initialize(): Promise<void> {
        this.redisConnection = new Redis(this.redisPort, this.redisHost, {
            password: this.redisPassword,
        });
        this.redisLock = RedisLock.createLock(this.redisConnection, {
            timeout: this.shardsPerCluster*7500,
            retries: Number.MAX_SAFE_INTEGER,
            delay: 100,
        });

        if (this.stats.enabled) {
            setInterval(async () => {
                await this.redisConnection?.set(`${this.lockKey}:cluster:stats:${await this.getFirstShard()}`, JSON.stringify({
                    guilds: this.guilds.size,
                    users: this.users.size,
                    voice: this.voiceConnections.size,
                    shards: this.shards.map((s: Eris.Shard) => {
                        return {
                            status: s.status,
                            id: s.id,
                            latency: s.latency,
                            guilds: this.guilds.filter(g => g.shard.id === s.id).length,
                        };
                    }),
                    memoryUsage: {
                        rss: process.memoryUsage().rss,
                        heapUsed: process.memoryUsage().heapUsed, 
                    },
                    id: await this.getFirstShard()
                }), 'EX', 10);

            }, this.stats.interval);
        }

        // this.pubSub = new PubSub({}, this.redisConnection, this);
    };

    private setupListeners() {
        this.on('ready', () => {
            this.redisLock.release(`${this.lockKey}:shard:identify`);
            this.hasLock = false;
            this.fullyStarted = true;
        });

        this.on('shardDisconnect', (_error: Error, id: number) => {
            // @ts-ignore
            this.shardStatusUpdate(this.shards.get(id))
            if (this.hasLock === false) {
                if (this.aquire()) {
                    this.shards.get(id)?.connect();
                } else {
                    // do something but idk what
                };
            };
        });
        this.on('shardReady', (id: number) => {
            // @ts-ignore
            this.shardStatusUpdate(this.shards.get(id))
            if (this.shards.find((s: Eris.Shard) => s.status === 'disconnected') && this.fullyStarted === true) {
                const shard: Eris.Shard | undefined = this.shards.find((s: Eris.Shard) => s.status === 'disconnected');
                if (shard) shard.connect();
            };
        });
    };

    private async calculateThisShards(): Promise<number[]> {
        const firstShardID = await this.getFirstShard();
        return [this.shardsPerCluster*firstShardID, this.shardsPerCluster*firstShardID+(this.shardsPerCluster-1)];
    };

    async queue(): Promise<void> {
        const shards = await this.calculateThisShards();
        this.options.firstShardID = shards[0];
        this.options.lastShardID = shards[1];

        if (await this.aquire()) {
            this.connect();
        } else setTimeout(() => {
            this.queue();
        }, 5000);
    };

    private async aquire(): Promise<boolean> {
        return new Promise((resolve, _reject) => {
            this.redisLock.acquire(`${this.lockKey}:shard:identify`).then((err: Error) => {
                if (err) return resolve(false);
                this.hasLock = true;
                this.emit('acquiredLock');
                resolve(true);
            }).catch(() => {
                resolve(false);
            });
        });
    };

    async getStats() {
        return new Promise(async (resolve, _reject) => {
            const stream = this.redisConnection?.scanStream({ match: `${this.lockKey}:cluster:stats:*`, });
            const data:Stats = {
                guilds: 0,
                users: 0,
                voice: 0,
                shards: [],
                memoryUsage: {
                    heapUsed: 0,
                    rss: 0,
                },
                clusters: [],
            };
    
            stream?.on('data', async (chunk: string[]) => {
                stream.pause();
                const thing = chunk.map(async (key: string) => {
                    let stringStats = await this.redisConnection?.get(key);
                    if (stringStats) {
                        let clusterStats: RawClusterStats = JSON.parse(stringStats);
                        data.guilds = data.guilds + clusterStats.guilds;
                        data.users = data.users + clusterStats.users;
                        data.voice = data.voice + clusterStats.voice;                    
                        clusterStats.shards.forEach((shard: ShardStats) => {
                            // @ts-ignore
                            data.shards.push(shard);
                        });
                        data.memoryUsage.rss = data.memoryUsage.rss + clusterStats.memoryUsage.rss;
                        data.memoryUsage.heapUsed = data.memoryUsage.heapUsed + clusterStats.memoryUsage.heapUsed;
                        data.clusters.push({
                            id: clusterStats.id,
                            shards: clusterStats.shards.map(s => s.id),
                            guilds: clusterStats.guilds,
                            users: clusterStats.users,
                            voice: clusterStats.voice,
                            memoryUsage: clusterStats.memoryUsage,
                        });
                        return stringStats;
                    } else return null;
                });
                await Promise.all(thing);
                stream.resume();
            });
    
            stream?.once('end', async () => {
                return resolve(data);
            });
        });
    };

    private shardStatusUpdate(shard: Eris.Shard): void {
        if (!this.webhooks.discord?.id || !this.webhooks.discord?.token) return;
        let color = undefined;
        if (shard.status === 'ready') color = colors.green;
        if (shard.status === 'disconnected') color = colors.red;

        this.executeWebhook(this.webhooks.discord.id, this.webhooks.discord.token, {
            embeds: [{
                title:'Shard status update', description: `ID: **${shard.id}** \nStatus: **${shard.status}**`,
                color: color,
            }],
        });
    };
};