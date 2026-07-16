/**
 * lint-staged 配置
 *
 * 路由策略：
 * - apps/noter-web、apps/noter-admin 内的源文件，使用各自包内的 ESLint v9
 *   （扁平配置带 eslint-config-next，已注册 react-hooks 等插件）。
 * - 其它位置的 JS/TS 文件，走根目录的 ESLint v8 + 传统 .eslintrc。
 *
 * 路径前缀按仓库根分组，确保每个文件只走一条 ESLint 链路，
 * 避免"Definition for rule 'react-hooks/exhaustive-deps' was not found"
 * 这类因为根 ESLint 未注册插件却遇到 disable 注释导致的报错。
 *
 * lint-staged 默认传入绝对路径，子包用 `pnpm --filter` 执行 eslint 时
 * 也直接使用绝对路径，避免相对路径解析到包根。
 */

const path = require('path')

const REPO_ROOT = __dirname

const NEXT_APPS = [
  { dir: path.join(REPO_ROOT, 'apps/noter-web'), pkg: 'noter-web' },
  { dir: path.join(REPO_ROOT, 'apps/noter-admin'), pkg: 'noter-admin' }
]

const isInside = (file, dir) => {
  const rel = path.relative(dir, file)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

const quote = (file) => `"${file}"`

module.exports = {
  '*.{js,jsx,ts,tsx}': (files) => {
    const grouped = new Map()
    grouped.set('__root__', [])
    for (const app of NEXT_APPS) grouped.set(app.pkg, [])

    for (const file of files) {
      const abs = path.isAbsolute(file) ? file : path.resolve(REPO_ROOT, file)
      const app = NEXT_APPS.find((a) => isInside(abs, a.dir))
      if (app) grouped.get(app.pkg).push(abs)
      else grouped.get('__root__').push(abs)
    }

    const commands = []

    const rootFiles = grouped.get('__root__')
    if (rootFiles.length > 0) {
      const args = rootFiles.map(quote).join(' ')
      commands.push(`eslint --fix ${args}`)
      commands.push(`prettier --write ${args}`)
    }

    for (const app of NEXT_APPS) {
      const appFiles = grouped.get(app.pkg)
      if (appFiles.length === 0) continue
      const args = appFiles.map(quote).join(' ')
      commands.push(`pnpm --filter ${app.pkg} exec eslint --fix ${args}`)
      commands.push(`prettier --write ${args}`)
    }

    return commands
  }
}
