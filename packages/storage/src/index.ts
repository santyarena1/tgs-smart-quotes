import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { decryptSecret } from "@tgs/config";
import { db } from "@tgs/database";

export type R2Credentials = { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string; publicBaseUrl: string };
export type R2Storage = { put(key: string, body: Buffer, contentType?: string): Promise<{ url: string; key: string }>; delete(key: string): Promise<void>; publicUrl(key: string): string };

export function createR2Storage(creds: R2Credentials): R2Storage {
  const client = new S3Client({ region: "auto", forcePathStyle: true, endpoint: creds.endpoint, credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey } });
  const publicUrl = (key: string) => `${creds.publicBaseUrl.replace(/\/$/, "")}/${key}`;
  return {
    publicUrl,
    async delete(key) { await client.send(new DeleteObjectCommand({ Bucket: creds.bucket, Key: key })); },
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: creds.bucket, Key: key, Body: body, ContentType: contentType }));
      return { url: publicUrl(key), key };
    },
  };
}

export async function loadR2FromModuleConfig(): Promise<R2Storage> {
  const config = await db.externalModuleConfig.findUnique({ where: { id: "singleton" } });
  if (!config) throw new Error("No existe la configuración del módulo externo");
  const missing = [
    ["endpoint", config.r2Endpoint], ["bucket", config.r2Bucket], ["accessKeyId", config.r2AccessKeyId],
    ["secretAccessKey", config.r2SecretAccessKeyEnc], ["publicBaseUrl", config.r2PublicBaseUrl],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Falta configurar R2: ${missing.join(", ")}`);
  return createR2Storage({ endpoint: config.r2Endpoint!, bucket: config.r2Bucket!, accessKeyId: config.r2AccessKeyId!, secretAccessKey: decryptSecret(config.r2SecretAccessKeyEnc!), publicBaseUrl: config.r2PublicBaseUrl! });
}

