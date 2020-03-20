const RedisSharder = require('../dist/RedisSharder');

const bot = new RedisSharder.GatewayClient('NjQ1NDAxMzI1NDkxODQ3MTY4.XnTlMQ.CpRk_GMx0sJjSxGyHYqfw-5Yt0k', { 
    erisOptions: { maxShards: 1 },
    shardsPerCluster: 1, // must evenly go into the max shards. 
    lockKey: 'arcane-standard-1', // not needed but is VERY VERY important if you plan on running multiple bots with this sharding setup
    getFirstShard: () => {
        return Number(process.env.pm_id || 0); // pm2 cluster mode provides this so its quite useful. The only "issue" is if you already have other pm2 processes running this will frick up the number
        // and not work. This shouldn't be used in production. Use k8s, k3s?, or any other solution. 
    },
    redisPassword: '1234'
    // webhooks: {
    //     discord: {
    //         id: 'id',
    //         token: 'token',
    //     },
    // },
});

bot.queue(); // DONT USE BOT.CONNECT ANYMORE. IT WILL BE CALLED LATER BY THE STUFF

bot.on('ready', async () => {
    console.log(`Shards ${bot.shards.map(s => s.id).join(',')} are online. (out of ${bot.options.maxShards})`);
    console.log(await bot.getUserByID('295980401560649730'));

    const output = await bot.evalAll('this.client.guilds.filter(c=>c.memberCount >= 1)');
    console.log(output.flat().map(c=>`${c.name} - ${c.memberCount}`))
});

bot.on('acquiredLock', () => { // incase you want to know idk
    console.log(`[Lock] Acquired lock for this cluster ${process.env.pm_id || 0}`);
});

setInterval(() => { // this just showcases that stats do work
    if (Number(process.env.pm_id) === 0) bot.getStats().then(stats => console.log(stats));
}, 5000);
