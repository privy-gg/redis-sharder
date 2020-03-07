import * as Eris from 'eris';
export interface RedisClientOptions {
    redisPort: number | undefined;
    redisPassword: string | undefined;
    redisHost: string | undefined;
    shardsPerCluster: number;
    lockKey: string;
    getFirstShard(): Promise<number>;
    erisOptions: Eris.ClientOptions;
}
export declare class BotClient extends Eris.Client {
    redisPort: number | undefined;
    redisHost: string | undefined;
    redisPassword: string | undefined;
    shardsPerCluster: number;
    lockKey: string;
    getFirstShard: () => Promise<number>;
    private redisConnection;
    private redisLock;
    private hasLock;
    private fullyStarted;
    constructor(token: string, options: RedisClientOptions);
    private initialize;
    private setupListeners;
    private calculateThisShards;
    queue(): Promise<void>;
    private aquire;
}
interface BotClientEvents<T> extends Eris.EventListeners<T> {
    /**
     * @event
     * Fired when the client has acquired the lock to begin connecting. (Initial connect and when a shard disconnects)
     */
    (event: 'acquiredLock', listener: () => void): T;
}
export declare interface BotClient extends Eris.Client {
    on: BotClientEvents<this>;
}
export {};
