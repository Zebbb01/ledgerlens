// Azure Blob Storage holds the uploaded files; Azure Queue Storage hands document
// IDs to the worker. Locally both run in Azurite via a connection string; in Azure
// the app signs in with its managed identity, so no storage key exists anywhere.
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { QueueClient } from "@azure/storage-queue";

const NAME = "documents"; // both the blob container and the queue

type Clients = { blobs: ContainerClient; queue: QueueClient };
const cache = globalThis as { storage?: Promise<Clients> };

function connect(): Clients {
  const connection = process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (connection) {
    return {
      blobs: BlobServiceClient.fromConnectionString(connection).getContainerClient(NAME),
      queue: new QueueClient(connection, NAME),
    };
  }
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  if (!account) throw new Error("Set AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT.");
  const credential = new DefaultAzureCredential();
  return {
    blobs: new BlobServiceClient(`https://${account}.blob.core.windows.net`, credential).getContainerClient(NAME),
    queue: new QueueClient(`https://${account}.queue.core.windows.net/${NAME}`, credential),
  };
}

function storage() {
  cache.storage ??= (async () => {
    const clients = connect();
    await Promise.all([clients.blobs.createIfNotExists(), clients.queue.createIfNotExists()]);
    return clients;
  })();
  return cache.storage;
}

export async function putFile(name: string, bytes: Uint8Array, contentType: string) {
  const { blobs } = await storage();
  await blobs.getBlockBlobClient(name).uploadData(bytes, { blobHTTPHeaders: { blobContentType: contentType } });
}

export async function getFile(name: string): Promise<Uint8Array> {
  const { blobs } = await storage();
  return blobs.getBlockBlobClient(name).downloadToBuffer();
}

export async function enqueue(ref: { id: string; workspaceId: string }) {
  const { queue } = await storage();
  await queue.sendMessage(JSON.stringify(ref));
}

// A message stays hidden for 5 minutes while the worker processes it, then
// reappears for another try if the worker died before deleting it.
export async function receive() {
  const { queue } = await storage();
  const { receivedMessageItems } = await queue.receiveMessages({ numberOfMessages: 1, visibilityTimeout: 300 });
  return receivedMessageItems[0];
}

export async function remove(message: { messageId: string; popReceipt: string }) {
  const { queue } = await storage();
  await queue.deleteMessage(message.messageId, message.popReceipt);
}
