import { ShardManager } from 'eris'
import { GatewayClient } from './GatewayClient'

export class XShardManager extends ShardManager {

    //** Discord large bot sharding. x16 x64 x128 */ 
    x = 1;

    constructor(client: GatewayClient, x: number) {
        super(client);

        this.x = x;
    }

    /**
     * TODO: THIS IS USELESS ATM. WILL IMPLEMENT WHEN ARCANE GETS THIS... PLS RESPOND @DISCORD
     */
    connect() {

    }
}; 