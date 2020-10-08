import { GatewayClient } from '../dist';

const bot = new GatewayClient(require('./config.json').token, {
    erisOptions: {
        maxShards: 5,
    },
    redisOptions: {
        host: '10.0.0.2'
    },
    shardingOptions: {
        shardsPerCluster: 5,
        lockKey: 'basicbot',
        clusterID: 0,
    },
});

bot.queue();

bot.on('acquiredLock', () => console.log('Acquired the lock'));
bot.on('extendedLock', (duration: number) => console.log(`Extended the lock by ${duration / 1000} seconds`));
bot.on('releasedLock', () => console.log('Released the lock'));
bot.on('shardReady', (id) => console.log(`Shard ${id} is ready`));
bot.on('ready', () => console.log('Ready'));