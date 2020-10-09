import { GatewayClient } from '../dist';

/**
 * DO NOT.... DO THIS. THIS IS ONLY HERE FOR TESTING
 * THIS RUNS MULTIPLE GATEWAY CLIENTS ON ONE PROCESS. PLEASE RUN ONLY 1 GATEWAY CLIENT PER PROCESS
 * DONT BE LAZY LIKE ME
 */
for (let i = 0; i < 2; i++) {
    const bot = new GatewayClient(require('./config.json').token, {
        erisOptions: {
            maxShards: 5,
        },
        redisOptions: {
            host: '10.0.0.2'
        },
        shardingOptions: {
            shardsPerCluster: 2,
            lockKey: 'basicbot',
            clusterID: i,
        },
        restOptions: {
            // proxyHost: 'your.discord.proxy.epicbot.domain',
            proxyHost: '10.0.0.2',
            proxyPort: 82,
            proxyProtocol: 'http',
        }
    });
    
    bot.queue();
    
    bot.on('acquiredLock', () => console.log('Acquired the lock'));
    bot.on('extendedLock', (duration: number) => console.log(`Extended the lock by ${duration / 1000} seconds`));
    bot.on('releasedLock', () => console.log('Released the lock'));
    bot.on('shardReady', (id) => console.log(`Shard ${id} is ready`));
    bot.on('ready', () => console.log('Ready'));
    // bot.on('debug', console.log);
    // bot.on('error', console.log);
    // bot.on('rawREST', console.log);

    bot.on('messageCreate', (message) => {
        if (message.content === '!ping') {
            message.channel.createMessage('Pong!')
        }
    })
}