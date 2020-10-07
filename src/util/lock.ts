/** 
 * This is super sad.. I have to write my own types for this :cry:
 * Note: I have decided to not document parts of this since this project doesn't use said features
 * */

declare module 'ioredis-lock' {
    import { Redis } from 'ioredis';

    /**
     * Creates a distributed lock
     * @param client A redis client
     * @param options Options for the lock
     */
    function createLock(client: Redis, options: LockOptions): Lock;

    export interface LockOptions {
        /** Time in milliseconds before which a lock expires */
        timeout: number,
        /**  Time in milliseconds to wait between each attempt  */
        retries: number,
        /** Maximum number of retries in acquiring a lock if the first attempt failed */
        delay: number,
    }

    /**
     * A distributed redis lock
     */
    export interface Lock {
        /** Acquire the lock */
        acquire(key: string): Promise<null | Error>;
        /** Extend the lock */
        extend(ttl: number): Promise<null | Error>;
        /** Release the lock */
        release(): Promise<any | Error>;
    }
}