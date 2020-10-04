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

// Fetch a guild and user
bot.on('ready', async () => {
    const guild = await bot.getGuildbyID('YOUR_GUILD_ID');
    console.log(guild);

    const user = await bot.getUserbyID('YOUR_USER_ID');
    console.log(user);
});