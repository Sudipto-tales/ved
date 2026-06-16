// Orval codegen config: OpenAPI spec → typed react-query hooks + Zod schemas
// (plan/bridges.md §1). Output is generated, gitignored, and regenerated via
// `npm run gen:api`. The generated client routes every call through the custom
// mutator (shared/api/mutator.ts) so auth/tenant headers stay in one place.
import { defineConfig } from 'orval';

const SPEC = '../server/api/openapi/openapi.yaml';

export default defineConfig({
  // Typed react-query hooks (useListStudents, useOnboardStudent, …).
  client: {
    input: SPEC,
    output: {
      mode: 'tags-split',
      target: 'src/shared/api/generated',
      schemas: 'src/shared/api/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      prettier: false,
      override: {
        mutator: {
          path: 'src/shared/api/mutator.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
          useMutation: true,
        },
      },
    },
  },
  // Zod schemas for the same shapes (FE runtime validation).
  zod: {
    input: SPEC,
    output: {
      mode: 'tags-split',
      target: 'src/shared/api/generated',
      fileExtension: '.zod.ts',
      client: 'zod',
      clean: false,
      prettier: false,
    },
  },
  // Control-plane client for the SEPARATE platform SPA (web/platform).
  platform: {
    input: '../server/api/openapi/controlplane.yaml',
    output: {
      mode: 'tags-split',
      target: 'platform/src/shared/generated',
      schemas: 'platform/src/shared/generated/model',
      client: 'react-query',
      httpClient: 'axios',
      clean: true,
      prettier: false,
      override: {
        mutator: { path: 'platform/src/shared/mutator.ts', name: 'platformFetch' },
        query: { useQuery: true, useMutation: true },
      },
    },
  },
});
