
export interface Stats {
    guilds: number,
    users: number,
    estimatedTotalUsers: number,
    voice: number,
    shards: ShardStats[],
    memoryUsage: MemoryUsage,
    clusters: ClusterStats[],
};

export enum ShardStatus {
    READY = 'ready',
    HANDSHAKING = 'handshaking',
    DISCONNECTED = 'disconnected',
    CONNECTING = 'ready',
};

export interface MemoryUsage {
    rss: number,
    heapUsed: number,
};

export interface ShardStats {
    status: ShardStatus,
    id: number,
    latency: number | null,
    guilds: number,
};

export interface RawClusterStats {
    id: number,
    guilds: number,
    users: number,
    estimatedTotalUsers: number,
    voice: number,
    shards: ShardStats[],
    memoryUsage: MemoryUsage,
    uptime: number,
};

export interface ClusterStats {
    id: number,
    shards: number[],
    guilds: number,
    users: number,
    voice: number,
    memoryUsage: MemoryUsage,
    uptime: number,
};
