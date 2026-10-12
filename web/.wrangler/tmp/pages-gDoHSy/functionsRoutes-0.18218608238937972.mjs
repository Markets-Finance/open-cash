import { onRequestPost as __waitlist_ts_onRequestPost } from "/Users/daiwi/project/monad/web/functions/waitlist.ts"
import { onRequest as ___middleware_ts_onRequest } from "/Users/daiwi/project/monad/web/functions/_middleware.ts"

export const routes = [
    {
      routePath: "/waitlist",
      mountPath: "/",
      method: "POST",
      middlewares: [],
      modules: [__waitlist_ts_onRequestPost],
    },
  {
      routePath: "/",
      mountPath: "/",
      method: "",
      middlewares: [___middleware_ts_onRequest],
      modules: [],
    },
  ]