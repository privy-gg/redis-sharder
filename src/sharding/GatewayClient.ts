import { Client, ClientOptions } from 'eris';
import { XShardManager } from './XShardManager';
import Redis from 'ioredis';
import * as redisLock from 'ioredis-lock';

export interface ShardingOptions {
    /** Key to use for distributed lock. If you are running multiple bots using redis-sharder then this should be unique */
    lockKey?: string;
    /** How many shards to allocate per process. Any remainder will be put on the last cluster */
    shardsPerCluster: number;
    /** The specific cluster ID. Should be unique to each process and ZERO indexed */
    clusterID: number;
}

export interface GatewayClientOptions {
    /** Eris options. View eris docs */
    erisOptions: ClientOptions;
    /** Redis connection options. View ioredis docs */
    redisOptions: Redis.RedisOptions;
    /** Redis sharder options */
    shardingOptions: ShardingOptions;
}

export class GatewayClient extends Client {

    private redis: Redis.Redis;
    private lock: redisLock.Lock;

    /**
     * @param token Discord bot token
     * @param options Options for eris, redis, and redis-sharder configuration
     */
    constructor(token: string, options: GatewayClientOptions) {
        super(token, options.erisOptions);

        this.redis = new Redis(options.redisOptions);
        this.lock = redisLock.createLock(this.redis, {
            timeout: 20000,
            retries: -1,
            delay: 1000,
        }); 
    }

    /**
     * Queue cluster for connect to discord gateway
     * @param largeBotSharding The amount of shards the bot can connect every 5 seconds. If you don't know what this is then chances are you don't have it for your bot
     */
    async queue(largeBotSharding: number = 1) {
        if (largeBotSharding > 1) {
            this.shards = new XShardManager(this, largeBotSharding);
        }

        await this.acquireLock();
        this.connect();
    }

    /**
     * Acquire the redis lock
     */
    private async acquireLock() {
        await this.lock.acquire('test');
    }
}