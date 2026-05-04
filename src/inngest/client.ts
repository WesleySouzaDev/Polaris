import { Inngest } from "inngest";
// import { sentryMiddleware } from "@inngest/middleware-sentry";

export const inngest = new Inngest({
  id: "polaris",
  eventKey: process.env.INNGEST_EVENT_KEY,
  signingKey: process.env.INNGEST_SIGNING_KEY,
  // middleware: [sentryMiddleware()],
});
