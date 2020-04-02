import Redis from 'ioredis';
import { PubSub } from './util/PubSub';
import { Stats } from './stats';

export interface DataClientOptions {
    redisPort?: number,
    redisPassword?: string,
    redisHost?: string,
    lockKey?: string,
    maxShards: number,
    shardsPerCluster: number,
};

export class DataClient {

    redisPort: number | undefined;
    redisHost: string | undefined;
    redisPassword: string | undefined;
    lockKey: string;

    maxShards: number;
    shardsPerCluster: number;

    private redisConnection: Redis.Redis | undefined;
    private pubSub: PubSub | undefined;


    constructor(options: DataClientOptions) {

        if (!options) throw new Error('No options provided');
        if (!options.maxShards) throw new Error('No max shards provided.');
        if (!options.shardsPerCluster) throw new Error('No shards per cluster provided.');

        this.redisPort = options.redisPort;
        this.redisHost = options.redisHost;
        this.redisPassword = options.redisPassword;
        this.lockKey = options.lockKey || 'redis-sharder';

        this.shardsPerCluster = options.shardsPerCluster;
        this.maxShards = options.maxShards;

        this.initialize();
    };

    private async initialize(): Promise<void> {
        this.redisConnection = new Redis(this.redisPort, this.redisHost, {
            password: this.redisPassword,
        });

        this.pubSub = new PubSub({ redisHost: this.redisHost, redisPassword: this.redisPassword, redisPort: this.redisPort }, this);
    };

    async getStats(key?: string): Promise<Stats> {
        return this.pubSub?.getStats(key || this.lockKey);
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
};