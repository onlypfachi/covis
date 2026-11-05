import { Client, cacheExchange, fetchExchange } from "urql";

export const client = new Client({
  url: "/graphql",
  exchanges: [cacheExchange, fetchExchange],
  requestPolicy: "cache-and-network",
});
