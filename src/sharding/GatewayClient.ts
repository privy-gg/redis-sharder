import { Client, ClientOptions } from 'eris';
import { XShardManager } from './XShardManager';

export interface GatewayClientOptions {
    erisOptions: ClientOptions;
}

export class GatewayClient extends Client {

    constructor(token: string, options: GatewayClientOptions) {
        super(token, options.erisOptions);
    }

    /**
     * Queue cluster for connect to discord gateway
     * 
     * @param largeBotSharding The amount of shards the bot can connect every 5 seconds. If you don't know what this is then chances are you don't have it for your bot
     */
    async queue(largeBotSharding: number = 1) {
        if (largeBotSharding > 1) {
            this.shards = new XShardManager(this, largeBotSharding);
        }

        await this.acquireLock();
        this.connect();
    }

    /**
     * Acquire the redis lock
     */
    private async acquireLock() {
        return 'yes';
    }
}