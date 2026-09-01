const memoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, String(value));
    },
  };
};

function installStorageFallback(name: "localStorage" | "sessionStorage") {
  try {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value: memoryStorage(),
    });
  } catch {
    // If the browser refuses to redefine localStorage, callers still need to
    // guard access locally. This module must never crash app bootstrap.
  }
}

try {
  const storage = globalThis.localStorage as Storage | undefined;
  if (typeof storage !== "undefined" && typeof storage.getItem === "function") {
    const probe = "__mc_storage_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
  } else {
    installStorageFallback("localStorage");
  }
} catch {
  installStorageFallback("localStorage");
}

try {
  const storage = globalThis.sessionStorage as Storage | undefined;
  if (typeof storage !== "undefined" && typeof storage.getItem === "function") {
    const probe = "__mc_storage_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
  } else {
    installStorageFallback("sessionStorage");
  }
} catch {
  installStorageFallback("sessionStorage");
}
