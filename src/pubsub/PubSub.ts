import Redis from 'ioredis';

export interface PubSubOptions {
    redisOptions: Redis.RedisOptions;
}

export class PubSub {

    // @ts-ignore
    private redis: Redis.Redis;
    private subRedis: Redis.Redis;
    private options: PubSubOptions;

    constructor(redis: Redis.Redis, options: PubSubOptions) {
        this.redis = redis;
        this.options = options;

        this.subRedis = new Redis(this.options.redisOptions);

        this.subRedis.on('message', this.handleMessage.bind(this));

        this.subRedis.subscribe(['test', 'test1']);
        this.subRedis.unsubscribe(['test']);

        this.redis.publish('test1', JSON.stringify({ test: true }));
    }

    private handleMessage(channel: string, msg:any) {
        let message;
        try {
            message = JSON.parse(msg);
        } catch {
            // TODO handle "issues" later...
            return;
        }

        switch (channel) {
            case 'test': {
                console.log(message);
            }
            default: {

            }
        }

    }
}