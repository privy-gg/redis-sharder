"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ioredis_1 = __importDefault(require("ioredis"));
class PubSub {
    constructor(options, redis, client) {
        this.redis = redis;
        this.client = client;
        this.options = options;
        this.initialize();
        this.setupSubscriptions();
    }
    ;
    initialize() {
        this.pubRedis = new ioredis_1.default(this.options.redisPort, this.options.redisHost, {
            password: this.options.redisPassword,
        });
        this.redis.on('message', this.handleMessage.bind(this));
    }
    ;
    setupSubscriptions() {
        this.redis.subscribe('getStats', 'getGuild', 'returnGuild');
        setTimeout(() => {
            var _a;
            (_a = this.pubRedis) === null || _a === void 0 ? void 0 : _a.publish('getGuild', JSON.stringify({ id: '591789734435749908' }));
        }, 2000);
    }
    ;
    handleMessage(client, channel, msg) {
        var _a;
        let message = JSON.parse(msg);
        if (channel === 'getGuild') {
            const guild = client.guilds.get(message.id);
            console.log(guild);
            if (guild)
                (_a = this.pubRedis) === null || _a === void 0 ? void 0 : _a.publish('returnGuild', JSON.stringify(guild.toJSON()));
        }
        ;
        if (channel === 'returnGuild')
            console.log(message);
    }
}
exports.PubSub = PubSub;
