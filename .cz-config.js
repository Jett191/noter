module.exports = {
  types: [
      { value: '✨ feat',     name: '  ✨  feat: 新功能' },
      { value: '🐛 fix',      name: '  🐛  fix: 修复bug' },
      { value: '🎉 init',     name: '  🎉  init: 初始化' },
      { value: '📗 docs',     name: '  📗  docs: 文档变更' },
      { value: '🌈 style',    name: '  🌈  style: 更改样式' },
      { value: '🍀 refactor', name: '  🍀  refactor: 重构' },
      { value: '🔥 perf',     name: '  🔥  perf: 性能优化' },
      { value: '✅ test',     name: '  ✅  test: 测试' },
      { value: '⏪️ revert',   name: '  ⏪️  revert: 回退' },
      { value: '📦 build',    name: '  📦  build: 打包' },
      { value: '🚀 chore',    name: '  🚀  chore: 构建/工程依赖/工具' },
      { value: '👷 ci',       name: '  👷  ci: CI related changes' }
  ],

  scopes: [
    { name: 'components' },
    { name: 'packages' },
    { name: 'style' },
    { name: 'api' },
    { name: 'custom' }
  ],

  messages: {
    type: '请选择提交类型(必填)',
    scope: '请选择文件修改范围(必填):',
    customScope: '请输入自定义文件修改范围(必填)',
    subject: '请简要描述提交(必填)',
    body: '请输入详细描述(可选)',
    breaking: '列出任何破坏性更改(可选)',
    footer: '请输入要关闭的issue(可选)',
    confirmCommit: '确定提交吗？'
  },

  allowCustomScopes: true,
  allowBreakingChanges: ['✨ feat', '🐛 fix'],
  subjectLimit: 49
}
