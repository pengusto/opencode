import { companionInput, loadLegacyAtlas, type LoadedCompanion } from "./task-companion-package"

const databaseName = "opencode-companions"
const storeName = "pets"
const bundledIDs = new Set(["orbit", "byte", "molebyte"])

export const companionLibraryChanged = "opencode-companion-library-changed"

export async function importCompanion(files: File[]) {
  const loaded = loadLegacyAtlas(await companionInput(files))
  if (bundledIDs.has(loaded.id)) throw new Error(`The pet ID "${loaded.id}" is reserved`)
  const companion = loaded.id === "imported-companion" ? { ...loaded, id: `imported-${crypto.randomUUID()}` } : loaded
  await write(companion)
  window.dispatchEvent(new Event(companionLibraryChanged))
  return companion
}

export async function listCompanions() {
  const db = await open()
  const transaction = db.transaction(storeName)
  const done = complete(transaction)
  const companions = await request<LoadedCompanion[]>(transaction.objectStore(storeName).getAll())
  await done
  db.close()
  return companions.toSorted((a, b) => a.name.localeCompare(b.name))
}

export async function loadStoredCompanion(id: string) {
  const db = await open()
  const transaction = db.transaction(storeName)
  const done = complete(transaction)
  const companion = await request<LoadedCompanion | undefined>(transaction.objectStore(storeName).get(id))
  await done
  db.close()
  return companion
}

export async function removeCompanion(id: string) {
  if (bundledIDs.has(id)) return
  const db = await open()
  const transaction = db.transaction(storeName, "readwrite")
  const done = complete(transaction)
  transaction.objectStore(storeName).delete(id)
  await done
  db.close()
  window.dispatchEvent(new Event(companionLibraryChanged))
}

async function write(companion: LoadedCompanion) {
  const db = await open()
  const transaction = db.transaction(storeName, "readwrite")
  const done = complete(transaction)
  transaction.objectStore(storeName).put(companion)
  await done
  db.close()
}

function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: "id" })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function request<T>(input: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    input.onsuccess = () => resolve(input.result)
    input.onerror = () => reject(input.error)
  })
}

function complete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
