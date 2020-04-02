import Redis from 'ioredis';
import { GatewayClient } from '../GatewayClient';
import { Base, Shard, Guild } from 'eris';
import { DataClient } from '../DateClient';
import { Stats, ShardStats, RawClusterStats } from '../stats';

export interface PubSubOptions {
    redisPort?: number,
    redisPassword?: string,
    redisHost?: string,
};

export class PubSub {
    
    private subRedis: Redis.Redis | undefined;
    private pubRedis: Redis.Redis | undefined;
    private client: GatewayClient | DataClient;
    private options: any;

    private returns: Map<string, Function> = new Map();
    private evals: Map<string, any> = new Map();
    private stats: Map<string, any> = new Map();
    private subs: Map<string, Function> = new Map();

    constructor(options:PubSubOptions, client: GatewayClient | DataClient) {
        this.client = client;
        this.options = options;

        this.initialize();
        this.setupSubscriptions();
    };

    private initialize(): void {
        this.pubRedis = new Redis(this.options.redisPort, this.options.redisHost, {
            password: this.options.redisPassword,
        });
        this.subRedis = new Redis(this.options.redisPort, this.options.redisHost, {
            password: this.options.redisPassword,
        });

        const thispls = this;
        this.subRedis.on('message', this.handleMessage.bind(thispls));
    };

    private setupSubscriptions(): void {
        this.subRedis?.subscribe('getGuild', 'returnGuild', 'getUser', 'returnUser', 'eval', 'returnEval', 'acquiredLock', 'stats', 'returnStats');
    };

    private async handleMessage(channel: string, msg: any) {
        let message:any = JSON.parse(msg);

        if (channel === 'getGuild') {
            if (this.client instanceof DataClient) return;
            const guild = this.client.guilds.get(message.id);
            if (guild) this.pubRedis?.publish('returnGuild', JSON.stringify(guild?.toJSON()));
        };

        if (channel === 'returnGuild') {
            let toReturn: Function | undefined = this.returns.get(`guild_${message.id}`);
            if (toReturn) {
                toReturn(message);
                this.returns.delete(`guild_${message.id}`);
            };
        };

        if (channel === 'getUser') {
            if (this.client instanceof DataClient) return;
            const user = this.client.users.get(message.id);
            if (user) this.pubRedis?.publish('returnUser', JSON.stringify(user?.toJSON()));
        };

        if (channel === 'returnUser') {
            let toReturn: Function | undefined = this.returns.get(`user_${message.id}`);
            if (toReturn) {
                toReturn(message);
                this.returns.delete(`user_${message.id}`);
            };
        };

        if (channel === 'eval') {
            if (!this.options.redisPassword) return;
            try {
                let output = eval(message.script);

                // to do
                // try to .toJSON()
                if (Array.isArray(output)) output = output.map((item: any) => {
                    if (item instanceof Base) return item.toJSON();
                    else return item;
                });
                if (output instanceof Base) output = output.toJSON();

                this.pubRedis?.publish('returnEval', JSON.stringify({ output: output, id: message.id }));
            } catch {
                this.pubRedis?.publish('returnEval', JSON.stringify({ output: undefined, id: message.id }));
            };
        };

        if (channel === 'returnEval') {
            if (!this.options.redisPassword) return;
            let toReturn: Function | undefined = this.returns.get(`eval_${message.id}`);
            if (toReturn) {
                const evals = this.evals.get(message.id) || [];
                evals.push(message.output);
                this.evals.set(message.id, evals);

                if (this.client instanceof DataClient) {
                    if (Number(this.client.maxShards) / this.client.shardsPerCluster === evals.length) {
                        this.returns.delete(`eval_${message.id}`);
                        this.evals.delete(message.id);
                        toReturn(evals);
                    };
                } else if (Number(this.client.options.maxShards) / this.client.shardsPerCluster === evals.length) {
                    this.returns.delete(`eval_${message.id}`);
                    this.evals.delete(message.id);
                    toReturn(evals);
                };
            };
        };

        if (channel === 'stats') {
            if (!(this.client instanceof DataClient) && this.client.lockKey === message.key) {
                this.pubRedis?.publish('returnStats', JSON.stringify({
                    key: this.client.lockKey,
                    id: message.id,
                    stats: {
                        guilds: this.client.guilds.size,
                        users: this.client.users.size,
                        voice: this.client.voiceConnections.size,
                        shards: this.client.shards.map((s: Shard) => {
                            return {
                                status: s.status,
                                id: s.id,
                                latency: s.latency,
                                guilds: s.client.guilds.filter((g: Guild) => g.shard.id === s.id).length,
                            };
                        }),
                        memoryUsage: {
                            rss: process.memoryUsage().rss,
                            heapUsed: process.memoryUsage().heapUsed, 
                        },
                        id: await this.client.getFirstShard(),
                        uptime: this.client.uptime,
                    },
                }));
            };
        };

        if (channel === 'returnStats') {
            let toReturn: Function | undefined = this.returns.get(`stats_${message.id}`);
            if (toReturn) {
                const stats = this.stats.get(message.id) || [];
                stats.push(message);
                this.stats.set(message.id, stats);

                if (this.client instanceof DataClient) {
                    if (Number(this.client.maxShards) / this.client.shardsPerCluster === stats.length) {
                        this.returns.delete(`stats_${message.id}`);
                        this.stats.delete(message.id);
                        toReturn(this.formatStats(stats));
                    };
                } else if (Number(this.client.options.maxShards) / this.client.shardsPerCluster === stats.length) {
                    this.returns.delete(`stats_${message.id}`);
                    this.stats.delete(message.id);
                    toReturn(this.formatStats(stats));
                };
            };
        };

        console.log(channel)

        const sub = this.subs.get(channel);
        if (sub) sub(message);
    };

    private formatStats(stats: any[]): Stats {
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

        stats.forEach((clusterStats: { key: string, id: string, stats: RawClusterStats }) => {
            data.guilds = data.guilds + clusterStats.stats.guilds;
            data.users = data.users + clusterStats.stats.users;
            data.voice = data.voice + clusterStats.stats.voice;                    
            clusterStats.stats.shards.forEach((shard: ShardStats) => {
                data.shards.push(shard);
            });
            data.memoryUsage.rss = data.memoryUsage.rss + clusterStats.stats.memoryUsage.rss;
            data.memoryUsage.heapUsed = data.memoryUsage.heapUsed + clusterStats.stats.memoryUsage.heapUsed;
            data.clusters.push({
                id: clusterStats.stats.id,
                shards: clusterStats.stats.shards.map(s => s.id),
                guilds: clusterStats.stats.guilds,
                users: clusterStats.stats.users,
                voice: clusterStats.stats.voice,
                memoryUsage: clusterStats.stats.memoryUsage,
                uptime: clusterStats.stats.uptime,
            });
        });

        return data;
    };

    getGuild(id: string): Promise<any | undefined> {
        return new Promise((resolve, _reject) => {
            this.returns.set(`guild_${id}`, resolve);
            this.pubRedis?.publish('getGuild', JSON.stringify({ id: id }));

            setTimeout(() => {
                this.returns.delete(`user_${id}`);
                resolve(undefined);
            }, 2000);
        });
    };

    getUser(id: string): Promise<any | undefined> {
        return new Promise((resolve, _reject) => {
            this.returns.set(`user_${id}`, resolve);
            this.pubRedis?.publish('getUser', JSON.stringify({ id: id }));

            setTimeout(() => {
                this.returns.delete(`user_${id}`);
                resolve(undefined);
            }, 2000);
        });
    };

    evalAll(script: string, timeout?: number): Promise<any | undefined> {
        return new Promise((resolve, _reject) => {
            const id: string = `${this.client instanceof DataClient ? '' : this.client.user.id}:${Date.now()+Math.random()}`;
            this.returns.set(`eval_${id}`, resolve);
            this.pubRedis?.publish('eval', JSON.stringify({ id: id, script: script, clientid: this.client instanceof DataClient ? '' : this.client.user.id }));

            setTimeout(() => {
                this.returns.delete(`eval_${id}`);
                resolve(undefined);
            }, timeout || 5000);
        });
    };

    getStats(key: string, timeout? : number): Promise<any | undefined> {
        return new Promise((resolve, _reject) => {
            const id: string = `${this.client instanceof DataClient ? '' : this.client.user.id}:${Date.now()+Math.random()}`;
            this.returns.set(`stats_${id}`, resolve);
            this.pubRedis?.publish('stats', JSON.stringify({ key: key || this.client.lockKey, id: id }));

            setTimeout(() => {
                const stats = this.stats.get(id) || [];
                this.returns.delete(`stats_${id}`);
                this.stats.delete(id);
                resolve(this.formatStats(stats));
                // resolve(undefined);
            }, timeout || 5000);
        });
    };

    sub(eventName: string, func: Function): void {
        this.subs.set(eventName, func);
        this.subRedis?.subscribe(eventName);
    };

    pub(eventName: string, message: string): void {
        console.log('emitting event')
        this.pubRedis?.publish(eventName, message);
    };
};