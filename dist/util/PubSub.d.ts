import Redis from 'ioredis';
import { GatewayClient } from '../GatewayClient';
export declare class PubSub {
    private redis;
    private pubRedis;
    private client;
    private options;
    constructor(options: any, redis: Redis.Redis, client: GatewayClient);
    private initialize;
    private setupSubscriptions;
    private handleMessage;
}
