const RedisSharder = require('../dist/RedisSharder');

const bot = new RedisSharder.GatewayClient(require('./config.json').token, { 
    erisOptions: { maxShards: 1 },
    shardsPerCluster: 1,
    lockKey: 'arcane-standard-1',
    getFirstShard: () => {
        return Number(process.env.pm_id || 0);
    },
    redisPassword: '1234'
});

bot.queue();
