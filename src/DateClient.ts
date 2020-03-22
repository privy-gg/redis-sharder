import Redis from 'ioredis';
import { PubSub } from './util/PubSub';

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
    latency: number | null,
    guilds: number,
};

export interface RawClusterStats {
    id: number,
    guilds: number,
    users: number,
    voice: number,
    shards: ShardStats[],
    memoryUsage: MemoryUsage,
    uptime: number,
};

export interface ClusterStats {
    id: number,
    shards: number[],
    guilds: number,
    users: number,
    voice: number,
    memoryUsage: MemoryUsage,
    uptime: number,
};

export interface StatsOptions {
    enabled: boolean,
    interval: number,
};


export interface GatewayClientOptions {
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


    constructor(options: GatewayClientOptions) {

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

    async getStats(): Promise<Stats> {
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
                            uptime: clusterStats.uptime,
                        });
                        return stringStats;
                    } else return null;
                });
                await Promise.all(thing);
                stream.resume();
            });
    
            stream?.once('end', async () => {
                // const addAllShards = new Array(this.options.maxShards).fill(undefined).map((_test, index) => {
                //     if (data.shards.find((s: ShardStats) => s.id === index)) return null;
                //     else data.shards.push({
                //         // @ts-ignore
                //         status: 'disconnected',
                //         id: index,
                //         latency: null,
                //         guilds: 0,
                //     });
                // });
                // await Promise.all(addAllShards)

                return resolve(data);
            });
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
};