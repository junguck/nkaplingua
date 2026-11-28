import 'server-only';
import { GridFSBucket, MongoClient, type Db } from 'mongodb';
import { Redis } from 'ioredis';
import { COLLECTIONS } from '@nkap/lingua-core';
import { env } from './env';

interface Clients {
  mongo: Promise<MongoClient>;
  redis: Redis;
}

// Un seul pool par processus, y compris sous le rechargement à chaud de Next.
declare global {
  var __nkapStudio: Clients | undefined;
}
const globalClients = globalThis;

function clients(): Clients {
  if (globalClients.__nkapStudio === undefined) {
    const e = env();
    globalClients.__nkapStudio = {
      mongo: new MongoClient(e.MONGO_URL, { serverSelectionTimeoutMS: 3_000 }).connect(),
      redis: new Redis(e.REDIS_URL, { maxRetriesPerRequest: 2 }),
    };
  }
  return globalClients.__nkapStudio;
}

export async function db(): Promise<Db> {
  return (await clients().mongo).db(env().MONGO_DB);
}

export function redis(): Redis {
  return clients().redis;
}

export async function audioBucket(): Promise<GridFSBucket> {
  return new GridFSBucket(await db(), { bucketName: COLLECTIONS.audioBucket });
}
