import * as Eris from 'eris';
export interface Stats {
    guilds: number;
    users: number;
    voice: number;
    shards: ShardStats[];
}
export interface ShardStats {
    status: string;
    id: number;
}
export interface ClusterStats {
    guilds: number;
    users: number;
    voice: number;
    shards: ShardStats[];
}
export interface StatsOptions {
    enabled: boolean;
    interval: number;
}
export interface GatewayClientOptions {
    redisPort: number | undefined;
    redisPassword: string | undefined;
    redisHost: string | undefined;
    shardsPerCluster: number;
    stats: StatsOptions;
    lockKey: string;
    getFirstShard(): Promise<number>;
    erisOptions: Eris.ClientOptions;
}
interface GatewayClientEvents<T> extends Eris.ClientEvents<T> {
    /**
     * @event
     * Fired when the client has acquired the lock to begin connecting. (Initial connect and when a shard disconnects)
     */
    (event: 'acquiredLock', listener: () => void): T;
}
export declare interface GatewayClient extends Eris.Client {
    on: GatewayClientEvents<this>;
}
export declare class GatewayClient extends Eris.Client {
    redisPort: number | undefined;
    redisHost: string | undefined;
    redisPassword: string | undefined;
    shardsPerCluster: number;
    lockKey: string;
    stats: StatsOptions;
    getFirstShard: () => Promise<number>;
    private redisConnection;
    private redisLock;
    private hasLock;
    private fullyStarted;
    constructor(token: string, options: GatewayClientOptions);
    private initialize;
    private setupListeners;
    private calculateThisShards;
    queue(): Promise<void>;
    private aquire;
    getStats(): Promise<unknown>;
}
export {};
