/**
 * Prettier 配置
 * https://prettier.io/docs/en/options.html
 */
export default {
  // 每行最大字符数
  printWidth: 100,
  // 使用 2 个空格缩进
  tabWidth: 2,
  // 不使用缩进符，使用空格
  useTabs: false,
  // 行尾使用分号
  semi: false,
  // 使用单引号
  singleQuote: true,
  // 对象属性值字符串是否需要引号
  quoteProps: 'as-needed',
  // JSX 中使用单引号
  jsxSingleQuote: false,
  // 尾随逗号 (ES5 标准)
  trailingComma: 'es5',
  // 对象字面量的大括号间添加空格
  bracketSpacing: true,
  // JSX 标签闭合处是否添加 >
  bracketSameLine: false,
  // 箭头函数单个参数是否加括号
  arrowParens: 'always',
  // 每行 printWidth 长度，仅用于 change 范围格式化
  endOfLine: 'auto',
  // HTML 空白敏感度
  htmlWhitespaceSensitivity: 'css',
  // Vue 文件中缩进脚本
  vueIndentScriptAndStyle: false,
  // 格式化文件末尾换行
  insertPragma: false,
  // 要求 pragma 格式化
  requirePragma: false,
  // 包装 prose 代码
  proseWrap: 'preserve',
  // 换行符格式
  endOfLine: 'lf',
}
