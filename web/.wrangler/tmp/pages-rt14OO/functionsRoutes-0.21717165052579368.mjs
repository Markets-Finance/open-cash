import { onRequestPost as __waitlist_ts_onRequestPost } from "/Users/daiwi/project/monad/web/functions/waitlist.ts"

export const routes = [
    {
      routePath: "/waitlist",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__waitlist_ts_onRequestPost],
    },
  ]