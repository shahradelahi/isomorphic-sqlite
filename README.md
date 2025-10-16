# isomorphic-sqlite

[![CI](https://github.com/shahradelahi/isomorphic-sqlite/actions/workflows/ci.yml/badge.svg?branch=main&event=push)](https://github.com/shahradelahi/isomorphic-sqlite/actions/workflows/ci.yml)
[![NPM Version](https://img.shields.io/npm/v/isomorphic-sqlite.svg)](https://www.npmjs.com/package/isomorphic-sqlite)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](/LICENSE)
![npm bundle size](https://img.shields.io/bundlephobia/minzip/isomorphic-sqlite)
[![Install Size](https://packagephobia.com/badge?p=isomorphic-sqlite)](https://packagephobia.com/result?p=isomorphic-sqlite)

_isomorphic-sqlite_ is an isomorphic SQLite driver for Node.js and Bun. It automatically uses the best available driver, prioritizing built-in options like `node:sqlite` and `bun:sqlite`, and falling back to `better-sqlite3` when necessary.

---

- [Installation](#-installation)
- [Usage](#-usage)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [References](#-references)
- [License](#license)

## 📦 Installation

```bash
npm install isomorphic-sqlite
```

<details>
<summary>Install using your favorite package manager</summary>

**pnpm**

```bash
pnpm install isomorphic-sqlite
```

**yarn**

```bash
yarn add isomorphic-sqlite
```

</details>

If you are using a Node.js version older than v22.5.0, you will also need to install `better-sqlite3`:

```bash
npm install better-sqlite3
```

## 📖 Usage

```typescript
import { Database } from 'isomorphic-sqlite';

// Open an in-memory database
const db = new Database(':memory:');

// Create a table
await db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');

// Insert some data
await db.exec('INSERT INTO users (name) VALUES (?), (?)', ['Alice', 'Bob']);

// Query for a single row
const alice = await db.get<{ id: number; name: string }>(
  'SELECT * FROM users WHERE name = ?',
  ['Alice']
);
console.log(alice); // { id: 1, name: 'Alice' }

// Query for all rows
const users = await db.all<{ id: number; name: string }>(
  'SELECT * FROM users'
);
console.log(users); // [ { id: 1, name: 'Alice' }, { id: 2, name: 'Bob' } ]

// Close the database
await db.close();
```

## 📚 Documentation

For all configuration options, please see [the API docs](./docs/api.md).

## 🤝 Contributing

Want to contribute? Awesome! To show your support is to star the project, or to raise issues on [GitHub](https://github.com/shahradelahi/isomorphic-sqlite)

Thanks again for your support, it is much appreciated! 🙏

## 📑 References

- [node:sqlite](https://nodejs.org/api/sqlite.html)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)
- [bun:sqlite](https://bun.com/docs/api/sqlite)

## License

[MIT](/LICENSE) © [Shahrad Elahi](https://github.com/shahradelahi) and [contributors](https://github.com/shahradelahi/isomorphic-sqlite/graphs/contributors).
