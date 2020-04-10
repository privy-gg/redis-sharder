import * as Eris from 'eris';
import Redis from 'ioredis';
import { colors } from './constants';
import { PubSub } from './util/PubSub';
import { Stats, } from './stats';
const RedisLock = require('ioredis-lock');

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

export class GatewayClient extends Eris.Client{

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
    private pubSub: PubSub | undefined;


    constructor(token: string, options: GatewayClientOptions) {
        super(token, options.erisOptions || {});

        if (!options) throw new Error('No options provided');
        if (!options.shardsPerCluster) throw new Error('No function to get the first shard id provided.');

        this.options.autoreconnect = true; // yes

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
    }

    private async initialize(): Promise<void> {
        this.redisConnection = new Redis(this.redisPort, this.redisHost, {
            password: this.redisPassword,
        });
        this.redisLock = RedisLock.createLock(this.redisConnection, {
            timeout: this.shardsPerCluster*7500,
            retries: Number.MAX_SAFE_INTEGER,
            delay: 100,
        });

        setInterval(() => {
            if (this.fullyStarted) {
                this.shards.find((s: Eris.Shard) => s.status === 'disconnected')?.connect();
            };
        }, 5000);

        this.pubSub = new PubSub({ redisHost: this.redisHost, redisPassword: this.redisPassword, redisPort: this.redisPort }, this);
    };

    private setupListeners() {
        this.on('ready', () => {
            this.redisLock.release(`${this.lockKey}:shard:identify`);
            this.hasLock = false;
            this.fullyStarted = true;
        });

        this.on('shardDisconnect', async (_error: Error, id: number) => {
            if (this.hasLock === false) {
                setTimeout(async () => {
                    // @ts-ignore
                    this.shardStatusUpdate(this.shards.get(id));

                    if (this.aquire()) {
                        if (this.shards.get(id)?.status === 'disconnected') await this.shards.get(id)?.connect();
                    } else {
                        // do something but idk what
                    };
                }, 2000);
            };
        });
        this.on('shardReady', (id: number) => {
            // @ts-ignore
            this.shardStatusUpdate(this.shards.get(id))
            if (this.shards.find((s: Eris.Shard) => s.status === 'disconnected') && this.fullyStarted === true) {
                const shard: Eris.Shard | undefined = this.shards.find((s: Eris.Shard) => s.status === 'disconnected');
                if (shard) shard.connect();
            } else if (this.hasLock && this.fullyStarted === true) {
                try {
                    this.redisLock.release(`${this.lockKey}:shard:identify`);
                    this.hasLock = false;
                } catch {};
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

    async getStats(key?: string, timeout?: number): Promise<Stats> {
        return this.pubSub?.getStats(key || this.lockKey, timeout);
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
                timestamp: new Date(),
            }],
        });
    };

    getRedis(): Redis.Redis | undefined {
        return this.redisConnection;
    };

    getGuildByID(id: string) {
        return this.pubSub?.getGuild(id);
    };

    getUserByID(id: string) {
        return this.pubSub?.getUser(id);
    };

    evalAll(script: string) {
        if (!this.redisPassword) return new Error('Evaling across clusters requires your redis instance to be secured with a password!');
        return this.pubSub?.evalAll(script);
    };

    subscribeToEvent(event: string, func: Function): this {
        this.pubSub?.sub(event, func);
        return this;
    };

    publish(event: string, message: string): void {
        this.pubSub?.pub(event, message);
    };
};