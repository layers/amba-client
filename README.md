# @layers/amba-client

JavaScript/TypeScript SDK for [Amba](https://amba.dev) — the agent-native
backend-as-a-service for mobile apps. Works in browsers, React Native, and
modern Node.

## Install

```bash
npm install @layers/amba-client
```

## Usage

```ts
import { Amba } from '@layers/amba-client';

Amba.configure({
  projectId: 'your-project-id',
  apiKey: 'your-publishable-api-key',
});

await Amba.client.init();

// Auth
const session = await Amba.client.auth.signInWithEmail({
  email: 'user@example.com',
  password: 'hunter2',
});

// Collections
const posts = await Amba.collections.posts.find({
  where: { published: true },
  order: 'created_at desc',
  limit: 20,
});
```

## License

Apache-2.0
