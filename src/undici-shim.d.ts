declare module "undici" {
  export class Agent {
    constructor(options?: Record<string, unknown>);
  }

  export function setGlobalDispatcher(dispatcher: Agent): void;

  export const fetch: typeof globalThis.fetch;
}
