import { Collection, Shard } from 'eris'
import { GatewayClient } from './GatewayClient'

export class XShardManager extends Collection<Shard> {

    //** Discord large bot sharding. x16 x64 x128 */ 
    x = 1;
    _client: GatewayClient; 

    connectQueue: [] = [];
    lastConnect: Number = 0;
    connectTimeout = null;

    constructor(client: GatewayClient, x: number) {
        super(Shard);

        this._client = client;

        this.x = x;
    }

    _readyPacketCB() {}

    /**
     * TODO: THIS IS USELESS ATM. WILL IMPLEMENT WHEN ARCANE GETS THIS... PLS RESPOND @DISCORD
     */
    connect() {

    }

    tryConnect() {}
    spawn() {}

    toString() {
        return `[XShardManager ${this.size}]`;
    }

    toJSON() {
        // return super.toJSON([
        //     "connectQueue",
        //     "lastConnect",
        //     "connectionTimeout",
        //     ...props
        // ]);
        return '';
    }
}; 