export interface DataClientOptions {
    redisPort: number | undefined;
    redisPassword: string | undefined;
    redisHost: string | undefined;
}
export interface Statss {
    guilds?: number;
    users?: number;
    voice?: number;
    shards?: any[];
}
export declare class DataClient {
    redisPort: number | undefined;
    redisHost: string | undefined;
    redisPassword: string | undefined;
    constructor(options: DataClientOptions);
    getStats(): Promise<Statss>;
}
