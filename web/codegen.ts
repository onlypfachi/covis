import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "../backend/graph/schema.graphqls",
  documents: ["src/**/*.tsx", "src/**/*.ts", "!src/gql/**"],
  ignoreNoDocuments: true,
  generates: {
    "src/gql/": {
      preset: "client",
      presetConfig: { fragmentMasking: false },
      config: { scalars: { ID: "string", Time: "string", JSON: "Record<string, unknown>" }, enumsAsTypes: true },
    },
  },
};
export default config;
