import { AsyncLocalStorage } from 'async_hooks';

interface TenantContextData {
  tenantId?: string;
  userId?: string;
}

export class TenantContext {
  private static readonly asyncLocalStorage = new AsyncLocalStorage<TenantContextData>();

  static setTenantId(tenantId: string): void {
    const store = this.asyncLocalStorage.getStore() || {};
    store.tenantId = tenantId;
  }

  static getTenantId(): string | undefined {
    const store = this.asyncLocalStorage.getStore();
    return store?.tenantId;
  }

  static setUserId(userId: string): void {
    const store = this.asyncLocalStorage.getStore() || {};
    store.userId = userId;
  }

  static getUserId(): string | undefined {
    const store = this.asyncLocalStorage.getStore();
    return store?.userId;
  }

  static run<T>(context: TenantContextData, callback: () => T): T {
    return this.asyncLocalStorage.run(context, callback);
  }

  static getContext(): TenantContextData | undefined {
    return this.asyncLocalStorage.getStore();
  }

  static clear(): void {
    const store = this.asyncLocalStorage.getStore();
    if (store) {
      delete store.tenantId;
      delete store.userId;
    }
  }
}
