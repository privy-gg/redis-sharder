import { Client, ClientEvents, ClientOptions } from 'eris';
import { XShardManager } from './XShardManager';
import Redis from 'ioredis';
import * as redisLock from 'ioredis-lock';
import { PubSub } from '../pubsub/PubSub';
import { RequestOptions } from 'https';

const https = require('https');
const http = require('http');

/**
 * TYPES AND STUFF
 */

export interface ShardingOptions {
    /** Key to use for distributed lock. If you are running multiple bots using redis-sharder then this should be unique */
    lockKey?: string;
    /** How many shards to allocate per process. Any remainder will be put on the last cluster */
    shardsPerCluster: number;
    /** The specific cluster ID. Should be unique to each process and ZERO indexed */
    clusterID: number;
}

export interface RestOptions {
    proxyHost?: string;
    proxyPort?: number;
    proxyProtocol?: string;
}

export interface GatewayClientOptions {
    /** Eris options. View eris docs */
    erisOptions: ClientOptions;
    /** Redis connection options. View ioredis docs */
    redisOptions: Redis.RedisOptions;
    /** Redis sharder options */
    shardingOptions: ShardingOptions;
    /** Rest options */
    restOptions: RestOptions;
}

interface GatewayClientEvents<T> extends ClientEvents<T> {
	/**
	 * @event
	 * Fired when the client has acquired the lock to begin connecting. (Initial connect and when a shard disconnects)
	 */
    (event: 'acquiredLock', listener: () => void): T;
    
    /**
	 * @event
	 * Fired when the lock has been extended
	 */
    (event: 'extendedLock', listener: (duration: number) => void): T;
    
    /**
	 * @event
	 * Fired when the client has released the lock
	 */
	(event: 'releasedLock', listener: () => void): T;
};

export declare interface GatewayClient extends Client {
    on: GatewayClientEvents<this>;
};


/**
 * The actual GatewayClient
 */

export class GatewayClient extends Client {

    private redis: Redis.Redis;
    private lock: redisLock.Lock;

    // @ts-ignore
    private pubsub: PubSub;

    private gatewayOptions: GatewayClientOptions;

    /**
     * @param token Discord bot token
     * @param options Options for eris, redis, and redis-sharder configuration
     */
    constructor(token: string, options: GatewayClientOptions) {
        if (options.erisOptions.maxShards === 'auto' || !options.erisOptions.maxShards) {
            throw new Error('Max shards cannot be set to "auto". Change to a dedicated number for redis sharder to work');
        }

        // options.erisOptions.autoreconnect = false;

        super(token, options.erisOptions);

        this.gatewayOptions = options;

        this.redis = new Redis(options.redisOptions);
        this.lock = redisLock.createLock(this.redis, {
            timeout: +new Number(this.gatewayOptions.shardingOptions.shardsPerCluster) * 5000,
            retries: -1,
            delay: 1000,
        }); 

        this.pubsub = new PubSub(this.redis, { redisOptions: options.redisOptions });

        this.setupListeners();

        if (options.restOptions.proxyHost && options.restOptions.proxyHost !== '') https.request = (reqOptions: RequestOptions) => {
            if (reqOptions.host === 'discordapp.com') reqOptions.host = options.restOptions.proxyHost;
            if (options.restOptions.proxyPort) reqOptions.port = options.restOptions.proxyPort;
            return (options.restOptions.proxyProtocol === 'https' ? https.request(reqOptions) : http.request(reqOptions));
        }
    }

    /**
     * Get the internal redis instance
     */
    getRedis() {
        return this.redis;
    }

    /**
     * Queue cluster for connect to discord gateway
     * @param largeBotSharding The amount of shards the bot can connect every 5 seconds. If you don't know what this is then chances are you don't have it for your bot
     */
    async queue(largeBotSharding: number = 1) {
        const shards = this.calcShards();
        this.options.firstShardID = shards[0];
        this.options.lastShardID = shards[1];

        if (largeBotSharding > 1) {
            this.shards = new XShardManager(this, largeBotSharding);
        }

        await this.acquireLock();
        this.connect();
    }

    private calcShards() {
        const totalShards = +new Number(this.options.maxShards);
        const spc = this.gatewayOptions.shardingOptions.shardsPerCluster;

        const initial = this.gatewayOptions.shardingOptions.clusterID * spc;
        const shards = [initial, initial + (spc - 1)];
        if (totalShards - spc <= shards[1]) shards[1] = totalShards - 1;

        return shards;
    }

    /**
     * Get the distributed lock key 
     */
    get key() {
        return this.gatewayOptions.shardingOptions.lockKey || 'redis-sharder';
    }

    /**
     * Acquire the redis lock
     */
    private async acquireLock() {
        await this.lock.acquire(this.key);

        this.emit('acquiredLock');

        return true;
    }

    /**
     * Extend the current lock
     * @param duration Duration (in milliseconds) to extend the lock by
     */
    private async extendLock(duration: number) {
        try {
            await this.lock.extend(duration);
        } catch {
            return false;
        }

        this.emit('extendedLock', duration);

        return true;  
    }

    /**
     * Release the lock
     */
    private async releaseLock() {
        try {
            await this.lock.release();    
        } catch {
            return false;
        }

        this.emit('releasedLock');

        return true;
    }

    // TODO: 
    /**
     * Setup the ready/disconnected/etc listeners. You may want to call this if you mess with reloading events but I'm not sure if this will be exposed fully in 2.0
     */
    setupListeners() {
        this.on('shardReady', () => {
            this.extendLock(8000);
        });

        this.on('shardDisconnect', (_err, _id) => {});

        this.once('ready', () => {
            this.releaseLock();
        });
    }
}